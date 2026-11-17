// Real native eye buffers: assistance must be visible in this eye/frame,
// disappear when disabled or tracking is lost, and survive paused view changes.
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const games=process.argv.slice(2).filter(x=>['tc1','tc2','cz'].includes(x));if(!games.length)games.push('tc1','tc2','cz');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--force-high-performance-gpu']});
const results=[],errors=[];await mkdir('build/qa',{recursive:true});
try{for(const game of games){
 const page=await browser.newPage({viewport:{width:1280,height:960}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.ARCADE_URL||'http://localhost:8094')+'/?game='+game);await page.locator('#load').click();
 await page.waitForFunction(()=>window.arcade?.loaded||document.querySelector('#status').classList.contains('error'),null,{timeout:90000});
 assert.equal(await page.evaluate(()=>arcade.loaded),true,await page.locator('#status').textContent());
 await page.waitForFunction(()=>arcade.state[1]>180,null,{timeout:60000});
 await page.evaluate(()=>arcade.pause(true));await page.waitForFunction(()=>arcade.state[0]===1);
 const result=await page.evaluate(async()=>{
  const {viewMatrix,perspective}=await import('./math.js'),m=arcade.module,gl=document.getElementById('game').getContext('webgl2');
  const eye=m._web_eye;m._web_eye=()=>0;m._web_pause(0);m._web_view_mode(1);
  const ptr=m._web_matrices()/4,w=640,h=640,prefs=arcade.settings,now=performance.now()+60000;
  function draw(index,mode,tracked=1,flat=0,scale=prefs.scale/100){
   m._web_view_mode(!flat);m._web_settings(scale,prefs.distance/100,0,0,0,mode,1);
   m._web_aim(.25,-.2,-.25,0,0,0,1,tracked,0);
   m.HEAPF32.set(viewMatrix([index?.032:-.032,0,0],[0,0,0,1]),ptr);m.HEAPF32.set(perspective(Math.PI/2,1),ptr+16);
   const fbo=eye(index,w,h,now);gl.bindFramebuffer(gl.FRAMEBUFFER,m.GL.framebuffers[fbo]);
   const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
  }
  const diff=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])count++;return count;};
  const cyan=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4)if(a[i]<100&&a[i+1]>180&&a[i+2]>230&&(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]))count++;return count;};
  const eyes=[];let capture;
  for(const index of [0,1]){
   const off=draw(index,0),on=draw(index,1),again=draw(index,1),disabled=draw(index,0);
   eyes.push({index,visible:cyan(on,off),repeatDiff:diff(on,again),disabledDiff:diff(off,disabled)});capture=on;
  }
  const noTracking=draw(0,1,0),noTrackingOff=draw(0,0,0);
  // Switching the same frozen scene must match a forced fresh vertex upload.
  draw(0,0,0,1);const switched=draw(0,0,0);draw(0,0,0,0,prefs.scale/100+.001);const fresh=draw(0,0,0);
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),image=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)image.data.set(capture.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);ctx.putImageData(image,0,0);
  const result={eyes,untrackedDiff:diff(noTracking,noTrackingOff),viewSwitchDiff:diff(switched,fresh),glError:gl.getError(),coreError:arcade.state[3],image:canvas.toDataURL('image/png')};
  m._web_eye=eye;m._web_view_mode(0);m._web_pause(1);return result;
 });
 await writeFile(`build/qa/${game}-laser.png`,Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
 results.push({game,...result});console.log(JSON.stringify({game,...result}));
 assert.ok(result.eyes.every(eye=>eye.visible>=20),'Laser must appear in each submitted eye');
 assert.ok(result.eyes.every(eye=>eye.repeatDiff===0&&eye.disabledDiff===0),'No delayed or stale ray');
 assert.equal(result.untrackedDiff,0);assert.equal(result.viewSwitchDiff,0);assert.equal(result.glError,0);assert.equal(result.coreError,0);
 await page.evaluate(()=>arcade.module.PThread.terminateAllThreads());await page.close();
}assert.deepEqual(errors,[]);await writeFile('build/qa/aim.json',JSON.stringify({results,errors},null,2));}finally{await browser.close();}
