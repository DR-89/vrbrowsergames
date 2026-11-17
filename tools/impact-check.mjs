// Real accepted cabinet shots, aim assistance OFF, synthetic stereo poses.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--force-high-performance-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await mkdir('build/qa',{recursive:true});
try{
 await page.addInitScript(()=>{
  let factory;Object.defineProperty(window,'createArcade',{configurable:true,get(){return factory;},set(original){factory=async options=>{
   const replay=[];for(let frame=0;frame<=3200;frame++){
    let bits=0,x=457,y=161;
    if(frame>=1500&&frame<1596)bits=(frame-1500)%12<6?1:0;
    if(frame>=1700&&frame<1706)bits=16;
    if(frame>=1900&&frame<1906){bits=16;y=206;}
    replay.push(`F ${frame} ${bits.toString(16)} ${x} ${y} 0`);
   }
   const M=await original({...options,preRun:[M=>{M.ENV.TC2_REPLAY='/impacts.rec';M.FS.writeFile('/impacts.rec',replay.join('\n'));}]});
   const ptr=M._web_matrices(),enc=new TextEncoder();M.HEAPU8.set(enc.encode('TC2_REPLAY\0'),ptr);M.HEAPU8.set(enc.encode('/impacts.rec\0'),ptr+64);M._web_env(ptr,ptr+64);
   return M;
  };}});
 });
 await page.goto((process.env.ARCADE_URL||'http://localhost:8094')+'/?game=tc2');await page.locator('#load').click();
 await page.waitForFunction(()=>window.arcade?.loaded,null,{timeout:90000});
 await page.evaluate(()=>{const m=arcade.module,advance=m._web_advance;m._web_advance=bits=>{if(arcade.state[1]<3201)advance(bits);};window.impactAdvance=advance;});
 await page.waitForFunction(()=>arcade.state[1]>=3201,null,{timeout:180000});
 await page.evaluate(()=>arcade.pause(true));await page.waitForFunction(()=>arcade.state[0]===1);
 const report=await page.evaluate(async()=>{
  const {viewMatrix,perspective}=await import('./math.js');
  const m=arcade.module,gl=document.querySelector('#game').getContext('webgl2'),eye=m._web_eye,prepare=m._web_prepare;
  m._web_eye=()=>0;m._web_prepare=()=>0;m._web_advance=()=>0;m._web_mouse=()=>{};
  m._web_pause(0);m._web_view_mode(1);m._web_head(0,0,0,0,0,0,1);m._web_settings(1,0,0,0,0,0,1);
  let time=performance.now(),lastAim=[0,0];const ptr=m._web_matrices()/4,w=960,h=960;
  function aim(x=lastAim[0],y=lastAim[1],tracked=1){lastAim=[x,y];const length=Math.hypot(x,y,1),dx=x/length,dy=y/length,dz=-1/length,q=Math.hypot(dy,-dx,1-dz);m._web_aim(.15,-.2,-.3,dy/q,-dx/q,0,(1-dz)/q,tracked,0);}
  async function step(bits,x,y){
   prepare(time);aim(x,y);impactAdvance(bits);
   const deadline=performance.now()+10000;while(!arcade.state[0]){if(performance.now()>deadline)throw Error('Core failed to park');await new Promise(r=>setTimeout(r,1));}
   time+=1000/60;prepare(time);
  }
  const read=()=>{const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;return n;};
  const original=gl.drawArrays,programs=new Map();let passes=[],block=false;
  // A nearer synthetic depth surface must completely occlude the effect.
  const blockedDepth=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,blockedDepth);gl.texStorage2D(gl.TEXTURE_2D,1,gl.R32F,w,h);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RED,gl.FLOAT,new Float32Array(w*h).fill(1));
  gl.drawArrays=function(...args){
   const program=gl.getParameter(gl.CURRENT_PROGRAM);
   if(!programs.has(program))programs.set(program,gl.getUniformLocation(program,'impact_nearest')!==null);
   if(!programs.get(program)){original.apply(this,args);return;}
   const before=read();let saved;
   if(block){gl.activeTexture(gl.TEXTURE1);saved=gl.getParameter(gl.TEXTURE_BINDING_2D);gl.bindTexture(gl.TEXTURE_2D,blockedDepth);}
   original.apply(this,args);passes.push({vertices:args[2],changed:diff(before,read())});
   if(block)gl.bindTexture(gl.TEXTURE_2D,saved);
  };
  function render(index,now){
   m.HEAPF32.set(viewMatrix([index?.032:-.032,0,0],[0,0,0,1]),ptr);m.HEAPF32.set(perspective(Math.PI/2,1),ptr+16);
   const target=eye(index,w,h,now);gl.bindFramebuffer(gl.FRAMEBUFFER,m.GL.framebuffers[target]);return read();
  }
  for(let i=0;i<35;i++)await step(0,0,0);
  for(let i=0;i<50;i++)await step(32,0,0);
  const shotsBefore=arcade.state[2],attempts=[];let visible=false;
  for(const [x,y]of [[-.30,.18],[-.22,-.08],[.23,-.09],[0,.05],[-.35,.03],[.35,.05],[0,-.16]]){
   for(let i=0;i<3;i++)await step(48,x,y);
   for(let i=0;i<3;i++)await step(32,x,y);
   passes=[];aim(x,y,0);render(0,time);
   const ip=m._web_impact_status()/4;
   attempts.push({frame:arcade.state[1],shots:arcade.state[2],impactStatus:[...m.HEAP32.subarray(ip,ip+8)],passes:[...passes]});
   if(passes.some(p=>p.changed>3)){visible=true;break;}
  }
  if(!visible)console.error('No visible impact: '+JSON.stringify(attempts));
  const eyes=[];let capture,captureHole;
  for(const index of [0,1]){
   passes=[];const active=render(index,time),activePasses=[...passes];
   const dark=render(index,time+400);
   passes=[];block=true;const occluded=render(index,time);const blockedPasses=[...passes];block=false;
   passes=[];const expired=render(index,time+1600),expiredPasses=[...passes];
   eyes.push({index,activePasses,blockedPasses,expiredPasses,visiblePixels:diff(active,expired),holePixels:diff(dark,expired),occludedDifference:diff(occluded,expired)});capture=active;captureHole=dark;
  }
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),image=ctx.createImageData(w,h);
  const png=pixels=>{for(let y=0;y<h;y++)image.data.set(pixels.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);ctx.putImageData(image,0,0);return canvas.toDataURL('image/png');};
  gl.drawArrays=original;gl.deleteTexture(blockedDepth);m._web_pause(1);
  return {shotsBefore,shotsAfter:arcade.state[2],attempts,eyes,glError:gl.getError(),coreError:arcade.state[3],image:png(capture),holeImage:png(captureHole)};
 });
 await writeFile('build/qa/tc2-impacts.png',Buffer.from(report.image.split(',')[1],'base64'));delete report.image;
 await writeFile('build/qa/tc2-impacts-hole.png',Buffer.from(report.holeImage.split(',')[1],'base64'));delete report.holeImage;
 await writeFile('build/qa/tc2-impacts.json',JSON.stringify({report,errors},null,2));console.log(JSON.stringify({report,errors}));
 assert.ok(report.shotsAfter>report.shotsBefore);
 for(const eye of report.eyes){assert.ok(eye.visiblePixels>3);assert.ok(eye.holePixels>3);assert.ok(eye.activePasses.some(p=>p.changed>3));assert.ok(eye.blockedPasses.every(p=>p.changed===0));assert.equal(eye.occludedDifference,0);assert.equal(eye.expiredPasses.length,0);}
 assert.equal(report.glError,0);assert.equal(report.coreError,0);assert.deepEqual(errors,[]);
}catch(e){console.error(e);console.error(await page.locator('#diagnostics').textContent());throw e;}
finally{await page.evaluate(()=>window.arcade?.module?.PThread.terminateAllThreads()).catch(()=>{});await browser.close();}
