// Real ROM scenes: compare retained painter batches with the original traversal,
// including moving eyes, frozen settings changes, and live texture transitions.
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const label=process.argv[2]||'cache',reference=process.argv.find(x=>x.startsWith('--reference=')),comparison=process.argv.find(x=>x.startsWith('--compare='));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--force-high-performance-gpu']}),errors=[];
await mkdir('build/qa',{recursive:true});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 if(reference)await page.route('**/games/tc1/arcade.*',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1),body=await readFile(new URL('../build/reference/'+reference.split('=')[1]+'/tc1/'+name,import.meta.url));
  await route.fulfill({body,contentType:name.endsWith('.js')?'text/javascript':'application/octet-stream',headers:{'Cross-Origin-Resource-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin'}});
 });
 await page.goto((process.env.ARCADE_URL||'http://localhost:8094/')+'?game=tc1');await page.locator('#load').click();
 await page.waitForFunction(()=>window.arcade?.loaded,null,{timeout:90000});console.log('Loaded '+label);
 await page.evaluate(()=>{
  const m=arcade.module;window.cacheHarness={eye:m._web_eye,prepare:m._web_prepare,advance:m._web_advance};
  m._web_eye=()=>0;m._web_prepare=()=>0;m._web_advance=()=>{};arcade.pause(true);
 });
 await page.waitForFunction(()=>arcade.state[0]===1);
 const results=await page.evaluate(async()=>{
  const {viewMatrix,perspective}=await import('./math.js'),m=arcade.module,gl=document.querySelector('#game').getContext('webgl2'),{eye,prepare,advance}=cacheHarness;
  const ptr=m._web_matrices()/4,results=[],targets=[100,300,900,1400,1800,2400,3200,4000],now=performance.now()+60000;
  const hash=async pixels=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),b=>b.toString(16).padStart(2,'0')).join('');
  const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])n++;return n;};
  const status=()=>m._web_tc1_cache_status?Array.from(new Uint32Array(m.HEAPU8.buffer,m._web_tc1_cache_status(),5)):null;
  const cases=[{flat:1},{flat:0},{flat:0,eye:1,x:.08},{flat:0,scale:.25},{flat:0,scale:4},{flat:0,filter:0},{flat:0,w:384,h:256}];
  m._web_pause(0);
  for(const target of targets){
   const deadline=performance.now()+60000;
   while(arcade.state[1]<target){
    if(performance.now()>deadline)throw Error('Core advance timeout');
    if(arcade.state[0]){
     prepare(performance.now());const frame=arcade.state[1];let bits=0;
     if(frame>=1500&&frame<1596)bits=frame%12<6?1:0;
     if(frame>=1700&&frame<1706)bits=16;
     if(frame>=1900&&frame<1906)bits=16;
     if(frame>=2500)bits=Math.floor((frame-2500)/8)%40<34?(frame%8<4?48:32):0;
     m._web_mouse(.5+.3*Math.sin(frame*.037),.5+.25*Math.sin(frame*.023),1);advance(bits);
    }
    await new Promise(r=>setTimeout(r,0));
   }
   while(!arcade.state[0]){if(performance.now()>deadline)throw Error('Snapshot timeout');await new Promise(r=>setTimeout(r,0));}
   prepare(performance.now());
   const before=status();const samples=[];
   for(const [index,c]of cases.entries()){
    const w=c.w||320,h=c.h||240;
    m._web_view_mode(!c.flat);m._web_settings(c.scale||1,.4,-16,0,0,0,c.filter??1);m._web_aim(0,0,0,0,0,0,1,0,0);
    m.HEAPF32.set(viewMatrix([c.x??-.032,0,0],[0,0,0,1]),ptr);m.HEAPF32.set(perspective(Math.PI/2,w/h),ptr+16);
    const draw=()=>{const fbo=eye(c.eye||0,w,h,now);gl.bindFramebuffer(gl.FRAMEBUFFER,m.GL.framebuffers[fbo]);const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
    m._web_tc1_cache_enable?.(1);const first=draw(),second=draw(),third=draw();
    m._web_tc1_cache_enable?.(0);const original=draw();
    samples.push({index,hash:await hash(original),firstDiff:diff(original,first),secondDiff:diff(original,second),thirdDiff:diff(original,third)});
    if(index===0&&target>=1400){
     const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),image=ctx.createImageData(w,h);
     for(let y=0;y<h;y++)image.data.set(original.subarray((h-y-1)*w*4,(h-y)*w*4),y*w*4);ctx.putImageData(image,0,0);samples.at(-1).image=canvas.toDataURL('image/png');
    }
   }
   results.push({frame:arcade.state[1],shots:arcade.state[2],samples,before,after:status(),glError:gl.getError(),coreError:arcade.state[3]});
  }
  m._web_pause(1);return results;
 });
 for(const result of results)for(const sample of result.samples)if(sample.image){await writeFile(`build/qa/tc1-cache-${label}-${result.frame}.png`,Buffer.from(sample.image.split(',')[1],'base64'));delete sample.image;}
 await writeFile(`build/qa/tc1-cache-${label}.json`,JSON.stringify({results,errors},null,2));
 assert.deepEqual(errors,[]);
 for(const r of results){assert.equal(r.glError,0);assert.equal(r.coreError,0);assert.ok(r.samples.every(s=>s.firstDiff===0&&s.secondDiff===0&&s.thirdDiff===0),JSON.stringify(r));}
 if(!reference)assert.ok(results.at(-1).after[1]>0,'Retained batches must actually be exercised');
 if(comparison){const prior=JSON.parse(await readFile(`build/qa/tc1-cache-${comparison.split('=')[1]}.json`,'utf8'));assert.deepEqual(results.map(r=>r.samples.map(s=>s.hash)),prior.results.map(r=>r.samples.map(s=>s.hash)),'All scene/settings pixels must match the released binary');}
 console.log(JSON.stringify({scenes:results.length,settingsPerScene:7,shots:results.at(-1).shots,cache:results.at(-1).after,allPixelsIdentical:true,errors}));
 await page.evaluate(()=>arcade.module.PThread.terminateAllThreads());
}finally{await browser.close();}
