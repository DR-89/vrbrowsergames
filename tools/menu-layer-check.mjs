// Inspect actual native eye pixels, including the weapon/menu overlap.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const label=process.argv[2]||'current',game=process.argv[3]||'tc2',errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--force-high-performance-gpu']});
const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
await mkdir('build/qa',{recursive:true});
try{
 await page.goto((process.env.ARCADE_URL||'http://localhost:8094')+'/?game='+game);await page.locator('#load').click();
 await page.waitForFunction(()=>window.arcade?.loaded,null,{timeout:90000});
 await page.waitForFunction(()=>arcade.state[1]>180,null,{timeout:60000});
 await page.evaluate(()=>arcade.pause(true));await page.waitForFunction(()=>arcade.state[0]===1);
 const report=await page.evaluate(()=>{
  const m=arcade.module,gl=document.querySelector('#game').getContext('webgl2'),eye=m._web_eye;
  m._web_eye=()=>0;m._web_pause(0);m._web_head(0,0,0,0,0,0,1);m._web_view_mode(1);m._web_pause(1);
  const w=640,h=640,ptr=m._web_matrices()/4,now=performance.now()+60000,prefs=arcade.settings;
  m._web_settings(prefs.scale/100,prefs.distance/100,0,0,0,1,1);
  // The normal frame prepares the menu's cached pixels before drawing eyes.
  m._web_prepare(now);
  const pixels=()=>{const a=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
  const changed=(a,b,i)=>a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2];
  const originalElements=gl.drawElements,originalArrays=gl.drawArrays,uniforms=new Map();let gunBefore,gunAfter,menuBefore,menuAfter,order;
  function names(){const p=gl.getParameter(gl.CURRENT_PROGRAM);if(!uniforms.has(p)){
   const set=new Set();for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++)set.add(gl.getActiveUniform(p,i).name);uniforms.set(p,set);
  }return uniforms.get(p);}
  gl.drawElements=function(...args){const gun=names().has('recoil');if(gun){gunBefore=pixels();order.push('gun');}
   originalElements.apply(this,args);if(gun)gunAfter=pixels();};
  gl.drawArrays=function(...args){const u=names(),menu=u.has('panelTex')&&u.has('view')&&u.has('projection');
   if(menu){menuBefore=pixels();order.push('menu');}originalArrays.apply(this,args);if(menu)menuAfter=pixels();};
  const eyes=[];let capture;
  for(const index of [0,1]){
   order=[];gunBefore=gunAfter=menuBefore=menuAfter=null;
   m._web_aim(.08,-.10,-.40,0,0,0,1,1,0);
   m.HEAPF32.set([1,0,0,0,0,1,0,0,0,0,1,0,index?-.032:.032,0,0,1],ptr);
   m.HEAPF32.set([1,0,0,0,0,1,0,0,0,0,-1.00004,-1,0,0,-.0400008,0],ptr+16);
   eye(index,w,h,now);capture=pixels();
   let gunPixels=0,overlap=0,overpainted=0;
   if(gunAfter&&menuAfter)for(let i=0;i<capture.length;i+=4)if(changed(gunBefore,gunAfter,i)){
    gunPixels++;if(changed(menuBefore,menuAfter,i))overlap++;if(changed(gunAfter,capture,i))overpainted++;
   }
   eyes.push({index,order,gunPixels,overlap,overpainted});
  }
  order=[];m._web_aim(.08,-.10,-.4,0,0,0,1,0,0);eye(0,w,h,now);const untrackedOrder=[...order];
  order=[];m._web_pause(0);m._web_aim(.08,-.10,-.4,0,0,0,1,1,0);eye(0,w,h,now);const resumedOrder=[...order];
  gl.drawElements=originalElements;gl.drawArrays=originalArrays;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),image=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)image.data.set(capture.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);ctx.putImageData(image,0,0);
  m._web_eye=eye;m._web_pause(1);return {eyes,untrackedOrder,resumedOrder,glError:gl.getError(),coreError:arcade.state[3],image:canvas.toDataURL('image/png')};
 });
 await writeFile(`build/qa/${game}-menu-layer-${label}.png`,Buffer.from(report.image.split(',')[1],'base64'));delete report.image;
 await writeFile(`build/qa/${game}-menu-layer-${label}.json`,JSON.stringify({report,errors},null,2));console.log(JSON.stringify({report,errors}));
 for(const eye of report.eyes){assert.ok(eye.gunPixels>100);assert.ok(eye.overlap>100,'Pose must overlap the menu');assert.equal(eye.overpainted,0,'Menu must not paint over the gun');assert.deepEqual(eye.order,['menu','gun']);}
 assert.deepEqual(report.untrackedOrder,['menu']);assert.deepEqual(report.resumedOrder,['gun']);
 assert.equal(report.glError,0);assert.equal(report.coreError,0);assert.deepEqual(errors,[]);
}finally{await page.evaluate(()=>window.arcade?.module?.PThread.terminateAllThreads()).catch(()=>{});await browser.close();}
