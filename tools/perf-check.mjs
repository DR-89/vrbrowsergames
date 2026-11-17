// Repeatable PC browser measurements; GPU timings are asynchronous, not gl.finish.
// Stereo samples exercise real native rendering with fixed synthetic eye poses.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const game=process.argv[2]||'tc2',label=process.argv[3]||'baseline';
const neutral=process.argv.includes('--neutral'),hz=Number(process.argv.find(x=>x.startsWith('--hz='))?.split('=')[1]||72);
let savedStorage;
const combat=process.argv.includes('--combat'),freezeFrame=combat?4000:game==='tc1'?1400:2000;
const out=new URL('../build/qa/',import.meta.url);await mkdir(out,{recursive:true});
const cdp=process.env.ARCADE_CDP;
const browser=cdp?await chromium.connectOverCDP(cdp):await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true,args:['--force-high-performance-gpu']});
// Meta's tab UI does not attach a compositor to Target.createTarget pages.
// Open the owned marker tab using Android ACTION_VIEW before a device run.
const page=cdp?browser.contexts()[0].pages().find(p=>p.url()===(process.env.ARCADE_CDP_PAGE||'http://localhost:8094/?quest-test=1')):await browser.newPage({viewport:{width:1280,height:960}}),errors=[];
if(!page)throw Error('Open http://localhost:8094/?quest-test=1 in the Quest browser first');
page.setDefaultTimeout(30000);
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 if(neutral){
  savedStorage=await page.evaluate(game=>['save','settings'].map(suffix=>{const key=`tc-webxr:${game}:${suffix}`;return [key,localStorage.getItem(key)];}),game).catch(()=>null);
  if(cdp&&!savedStorage)throw Error('Cannot preserve the owned test tab settings');
  await page.addInitScript(({game,hz})=>{if(new URL(location).searchParams.get('game')!==game)return;localStorage.removeItem(`tc-webxr:${game}:save`);localStorage.setItem(`tc-webxr:${game}:settings`,JSON.stringify({quality:1,refresh:hz,adaptive:false}));},{game,hz});
 }
 if(process.argv.includes('--gl-trace'))await page.addInitScript(()=>{
  const prototype=WebGL2RenderingContext.prototype,getError=prototype.getError,originals={};window.questGLErrors=[];
  for(const name of Object.getOwnPropertyNames(prototype)){
   if(['constructor','getError','isContextLost'].includes(name)||typeof Object.getOwnPropertyDescriptor(prototype,name)?.value!=='function')continue;
   const fn=originals[name]=prototype[name];prototype[name]=function(...args){const result=fn.apply(this,args),error=getError.call(this);if(error&&questGLErrors.length<20)questGLErrors.push({name,error,args:args.map(a=>typeof a==='number'||typeof a==='string'?a:typeof a)});return result;};
  }
  window.stopGLTrace=()=>{for(const [name,fn]of Object.entries(originals))prototype[name]=fn;};
 });
 if(cdp)await page.addInitScript(()=>{
  window.questCoreWaits=[];
  if(Atomics.waitAsync){const wait=Atomics.waitAsync;Atomics.waitAsync=function(...args){const start=performance.now(),result=wait(...args);if(result.async)result.value.then(value=>{if(value==='ok')questCoreWaits.push(performance.now()-start);});return result;};}
  const request=navigator.xr.requestSession.bind(navigator.xr);
  navigator.xr.requestSession=async(...args)=>{window.questSession=await request(...args);window.questSupportedRates=Array.from(questSession.supportedFrameRates||[]);return questSession;};
  window.questIntervals=[];let last=0;
  const raf=XRSession.prototype.requestAnimationFrame;
  XRSession.prototype.requestAnimationFrame=function(fn){return raf.call(this,(time,frame)=>{if(last)questIntervals.push(time-last);last=time;fn(time,frame);});};
 });
 if(combat)await page.addInitScript(({game,freezeFrame})=>{
  let factory;Object.defineProperty(window,'createArcade',{configurable:true,get(){return factory;},set(original){factory=async options=>{
   const replay=[];for(let frame=0;frame<=freezeFrame+1;frame++){
    let bits=0,x=game==='tc2'?457:320,y=game==='tc2'?161:240;
    if(frame>=1500&&frame<1596)bits=(frame-1500)%12<6?1:0;
    if(frame>=1700&&frame<1706)bits=16;
    if(frame>=1900&&frame<1906){bits=16;y=game==='tc2'?206:240;}
    if(frame>=2500){const k=Math.floor((frame-2500)/8),pedal=k%40<34;bits=pedal?(frame%8<4?48:32):0;x=Math.round((game==='tc2'?457:320)+200*Math.sin(k*.37));y=Math.round((game==='tc2'?161:240)+(game==='tc2'?70:150)*Math.sin(k*.23));}
    replay.push(`F ${frame} ${bits.toString(16)} ${x} ${y} 0`);
   }
   const M=await original({...options,preRun:[M=>{M.ENV.TC2_REPLAY='/perf.rec';M.FS.writeFile('/perf.rec',replay.join('\n'));}]});
   if(M._web_env){const ptr=M._web_matrices(),enc=new TextEncoder();M.HEAPU8.set(enc.encode('TC2_REPLAY\0'),ptr);M.HEAPU8.set(enc.encode('/perf.rec\0'),ptr+64);M._web_env(ptr,ptr+64);}
   return M;
  };}});
 },{game,freezeFrame});
 const reference=process.argv.find(arg=>arg==='--reference'||arg.startsWith('--reference='));
 if(reference)await page.route('**/games/'+game+'/arcade.*',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  const folder=reference.includes('=')?reference.split('=')[1]+'/':'';
  const body=await readFile(new URL('../build/reference/'+folder+game+'/'+name,import.meta.url));
  await route.fulfill({body,contentType:name.endsWith('.js')?'text/javascript':'application/octet-stream',headers:{'Cross-Origin-Resource-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin'}});
 });
 if(reference&&cdp){
  const folder=reference.includes('=')?reference.split('=')[1]+'/':'';
  for(const name of ['app.js','performance.js'])await page.route('**/'+name,async route=>route.fulfill({body:await readFile(new URL('../build/reference/'+folder+name,import.meta.url)),contentType:'text/javascript'}));
 }
 await page.goto((process.env.ARCADE_URL||'http://localhost:8094/')+'?game='+game);if(!cdp)await page.bringToFront();
 console.log(game+' page ready');
 await page.waitForFunction(()=>!!window.arcade,null,{polling:100});
 if(cdp){const devtools=await page.context().newCDPSession(page);await devtools.send('Runtime.evaluate',{expression:"document.querySelector('#load').click()",userGesture:true});await devtools.detach();}
 else await page.locator('#load').click();
 await page.waitForFunction(()=>arcade.loaded||document.querySelector('#status').classList.contains('error'),null,{timeout:90000,polling:100});
 if(!await page.evaluate(()=>arcade.loaded))throw Error(await page.locator('#status').textContent());
 if(neutral)await page.evaluate(()=>{const advance=arcade.module._web_advance;arcade.module._web_advance=()=>advance(0);});
 console.log(game+' core loaded');
 // _web_start launches a worker; its GL initialization is proxied back to
 // the browser. Do not race that initialization against an opaque XR target.
 await page.waitForFunction(()=>arcade.state[1]>0,null,{timeout:30000,polling:100});
 if(cdp)await page.evaluate(()=>{document.querySelector('#enter-vr').disabled=true;});
 if(cdp&&process.argv.includes('--xr')){
  await page.evaluate(hz=>{
   for(const [key,value]of Object.entries({quality:1,refresh:hz,adaptive:false})){
    const el=document.getElementById(key);if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new Event('input'));
   }
  },hz);
  const devtools=await page.context().newCDPSession(page);
  await devtools.send('Runtime.evaluate',{expression:"document.querySelector('#enter-vr').onclick()",userGesture:true});await devtools.detach();
  await page.waitForFunction(()=>arcade.inVR&&arcade.vr.frames>3,null,{timeout:45000,polling:100});
 }
 if(process.argv.includes('--fast-core'))await page.evaluate(async()=>{
  const m=arcade.module,advance=m._web_advance,eye=m._web_eye;
  m._web_advance=()=>{};m._web_eye=()=>0;
  try{
   const deadline=performance.now()+150000;
   while(arcade.state[1]<3000){
    if(performance.now()>deadline)throw Error('Fast replay timed out');
    if(arcade.state[0]){m._web_prepare(performance.now());advance(0);}
    await new Promise(r=>setTimeout(r,0));
   }
  }finally{m._web_advance=advance;m._web_eye=eye;}
 });
 await page.evaluate(()=>window.stopGLTrace?.());
 await page.evaluate(freezeAt=>{
  const m=arcade.module,stats=window.perfStats={};
  for(const name of ['_web_prepare','_web_advance','_web_eye','_web_aim']){
   const fn=m[name];m[name]=function(...args){const t=performance.now();const result=fn(...args);(stats[name]??=[]).push(performance.now()-t);return result;};
  }
  const advance=m._web_advance;
  m._web_advance=bits=>{if(arcade.state[1]<freezeAt)advance(bits);};
 },freezeFrame);
 await page.waitForFunction(n=>arcade.state[1]>=n,combat?3200:game==='tc1'?900:1500,{timeout:180000,polling:100});
 console.log(game+' reached frame '+await page.evaluate(()=>arcade.state[1]));
 const live=await page.evaluate(async()=>{
  for(const k of Object.keys(perfStats))perfStats[k]=[];
  if(window.questIntervals)questIntervals.length=0;
  if(window.questCoreWaits)questCoreWaits.length=0;
  const gl=document.querySelector('#game').getContext('webgl2'),priorGLError=gl.getError();
  const start=performance.now(),frame=arcade.state[1];await new Promise(r=>setTimeout(r,8000));
  const ms=performance.now()-start;const summary=a=>({calls:a.length,meanMs:a.reduce((s,v)=>s+v,0)/a.length,p95Ms:[...a].sort((a,b)=>a-b)[Math.floor(a.length*.95)]});
  return {elapsedMs:ms,gameFps:(arcade.state[1]-frame)*1000/ms,view:document.querySelector('#performance').textContent,immersive:arcade.inVR,performance:arcade.performance,xrIntervals:window.questIntervals?summary(questIntervals):null,coreWaits:window.questCoreWaits?summary(questCoreWaits):null,priorGLError,glError:gl.getError(),startupGLErrors:window.questGLErrors||[],calls:Object.fromEntries(Object.entries(perfStats).map(([k,v])=>[k,summary(v)]))};
 });
 await page.waitForFunction(n=>arcade.state[1]===n,freezeFrame,{timeout:60000,polling:100});
 if(cdp)await page.evaluate(async()=>{if(arcade.inVR)await window.questSession?.end();});
 await page.locator('#game').screenshot({path:fileURLToPath(new URL(`${game}-perf-${label}.png`,out))});
 await page.evaluate(()=>arcade.pause(true));await page.waitForFunction(()=>arcade.state[0]===1,null,{polling:100});
 const stereo=await page.evaluate(async()=>{
  const {viewMatrix,perspective}=await import('./math.js'),m=arcade.module,gl=document.querySelector('#game').getContext('webgl2');
  // Suspend the desktop callbacks during this frozen-scene measurement.
  const eye=m._web_eye;m._web_eye=()=>0;
  m._web_pause(0);m._web_view_mode(1);
  const ptr=m._web_matrices()/4,ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unknown',cases=[];
  // Old builds did not invalidate flat-space vertices on a frozen VR switch.
  // Force an actual world-space upload in BOTH reference and candidate builds.
  const prefs=arcade.settings;
  const settings=scale=>m._web_settings(scale,prefs.distance/100,prefs.pitch,prefs.up/1000,prefs.back/1000,0,Number(prefs.filter));
  settings(prefs.scale/100);
  m.HEAPF32.set(viewMatrix([-.032,0,0],[0,0,0,1]),ptr);m.HEAPF32.set(perspective(Math.PI/2,1),ptr+16);
  const transition=new Uint8Array(320*320*4),fresh=new Uint8Array(transition.length);
  let target=eye(0,320,320,performance.now());gl.bindFramebuffer(gl.FRAMEBUFFER,m.GL.framebuffers[target]);gl.readPixels(0,0,320,320,gl.RGBA,gl.UNSIGNED_BYTE,transition);
  settings(prefs.scale/100+.0001);eye(0,320,320,performance.now());settings(prefs.scale/100);
  target=eye(0,320,320,performance.now());gl.bindFramebuffer(gl.FRAMEBUFFER,m.GL.framebuffers[target]);gl.readPixels(0,0,320,320,gl.RGBA,gl.UNSIGNED_BYTE,fresh);
  let transitionDiff=0;for(let i=0;i<fresh.length;i+=4)if(fresh[i]!==transition[i]||fresh[i+1]!==transition[i+1]||fresh[i+2]!==transition[i+2])transitionDiff++;
  const inputs=ext?[['stereo-2400',2400,2640],['stereo-1440',1440,1600],['stereo-960',960,1080]]:[['stereo-1680',1680,1760],['stereo-960',960,1080]];
  const summary=a=>({meanMs:a.reduce((s,v)=>s+v,0)/a.length,p95Ms:[...a].sort((a,b)=>a-b)[Math.floor(a.length*.95)],samples:a.length});
  for(const [name,w,h]of inputs){
   const cpu=[],gpu=[],completion=[],pending=[],counts={};
   const iterations=ext?200:60,warmup=ext?120:30;
   const collect=()=>{while(pending.length&&gl.getQueryParameter(pending[0].q,gl.QUERY_RESULT_AVAILABLE)){
    const item=pending.shift();if(!gl.getParameter(ext.GPU_DISJOINT_EXT)&&item.record)gpu.push(gl.getQueryParameter(item.q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(item.q);
   }};
   const tracked=['getParameter','checkFramebufferStatus','getError','getUniformLocation','drawArrays','drawElements','texSubImage2D','bufferData','blitFramebuffer'];
   const originals={};for(const k of tracked){originals[k]=gl[k];gl[k]=function(...args){counts[k]=(counts[k]||0)+1;if(k==='drawArrays')counts.vertices=(counts.vertices||0)+args[2];return originals[k].apply(this,args);};}
   for(let i=0;i<iterations;i++){
    await new Promise(r=>ext?requestAnimationFrame(r):setTimeout(r,0));
    // Do not build an unbounded offscreen GPU queue at a desktop refresh rate
    // above the measured renderer's throughput. Warm clocks before sampling.
    collect();while(pending.length>=4){await new Promise(r=>requestAnimationFrame(r));collect();}
    const q=ext?gl.createQuery():null;if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
    const t=performance.now();
    m._web_aim(.15,-.2,-.3,0,0,0,1,1,0);
    for(const [index,x]of [-.032,.032].entries()){
     m.HEAPF32.set(viewMatrix([x,0,0],[0,0,0,1]),ptr);m.HEAPF32.set(perspective(Math.PI/2,w/h),ptr+16);
     eye(index,w,h,performance.now());
    }
    const elapsed=performance.now()-t;if(i>=warmup)cpu.push(elapsed);
    // Quest Browser does not expose timer queries. Diagnostic-only finish
    // bounds the queue and measures CPU + submission + GPU completion, NOT
    // GPU execution time or immersive frame rate. Never used by the app.
    if(!ext){gl.finish();if(i>=warmup)completion.push(performance.now()-t);}
    // This probe draws only to private targets, without an XR/compositor
    // submission. Flush asynchronously so query duration excludes idle time
    // waiting for the next browser frame to submit the command buffer.
    if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);gl.flush();pending.push({q,record:i>=warmup});}collect();
   }
   const deadline=performance.now()+5000;while(pending.length&&performance.now()<deadline){await new Promise(r=>requestAnimationFrame(r));collect();}
   for(const item of pending)gl.deleteQuery(item.q);
   for(const k of tracked)gl[k]=originals[k];
   const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),b=>b.toString(16).padStart(2,'0')).join('');
   cases.push({name,width:w,height:h,cpu:summary(cpu),gpu:ext?summary(gpu):null,completion:ext?null:summary(completion),pixelHash:hash,callsPerStereo:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v/iterations]))});
  }
  m._web_eye=eye;m._web_view_mode(0);m._web_pause(1);
  const cache=m._web_tc1_cache_status?Array.from(new Uint32Array(m.HEAPU8.buffer,m._web_tc1_cache_status(),5)):null;
  return {renderer,syntheticPoses:true,coreFrame:arcade.state[1],transitionDiff,cases,cache,glError:gl.getError()};
 });
 const diagnostics=await page.locator('#diagnostics').textContent();
 const supportedFrameRates=await page.evaluate(()=>window.questSupportedRates||[]);
 const result={game,label,combat,neutral,requestedHz:hz,supportedFrameRates,live,stereo,diagnostics,errors};await writeFile(new URL(`${game}-perf-${label}.json`,out),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(!reference&&stereo.transitionDiff)throw Error('Frozen VR entry reused flat-space vertices');
 if(stereo.glError)throw Error('WebGL error: '+stereo.glError);
 if(live.glError)throw Error('Live WebGL error: '+live.glError);
 const comparison=process.argv.find(arg=>arg.startsWith('--compare='));
 if(comparison){
  const prior=JSON.parse(await readFile(new URL(`${game}-perf-${comparison.split('=')[1]}.json`,out),'utf8'));
  if(prior.stereo.coreFrame!==stereo.coreFrame||prior.stereo.renderer!==stereo.renderer)throw Error('Comparison scene/GPU differs');
  for(const sample of stereo.cases){const before=prior.stereo.cases.find(item=>item.name===sample.name);if(before?.pixelHash!==sample.pixelHash)throw Error('Rendered pixels changed: '+sample.name);}
  console.log('PIXEL PARITY: all three stereo resolutions match the reference');
 }
}catch(e){console.error(JSON.stringify({error:e.message,errors,page:await page.evaluate(()=>({status:document.querySelector('#status').textContent,loading:document.querySelector('#loading-label').textContent,logs:document.querySelector('#diagnostics').textContent})).catch(()=>null)}));throw e;}
finally{await page.evaluate(()=>window.arcade?.module?.PThread.terminateAllThreads()).catch(()=>{});if(savedStorage)await page.evaluate(entries=>{for(const [key,value]of entries)if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);},savedStorage).catch(()=>{});if(cdp)await page.goto('http://localhost:8094/?quest-test=1').catch(()=>{});await browser.close();}
