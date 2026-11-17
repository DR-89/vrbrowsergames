// Capture real cabinet PCM before browser resampling, and count worklet gaps.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const game=process.argv[2]||'cz',label=process.argv[3]||'audio',cdp=process.env.ARCADE_CDP;
const reference=process.argv.find(x=>x.startsWith('--reference='))?.split('=')[1];let savedStorage;
const browser=cdp?await chromium.connectOverCDP(cdp):await chromium.launch({channel:'chrome',headless:true,args:['--force-high-performance-gpu','--autoplay-policy=no-user-gesture-required']});
const page=cdp?browser.contexts()[0].pages().find(p=>p.url()==='http://localhost:8094/?quest-test=1'):await browser.newPage(),errors=[];
assert.ok(page,'Owned Quest marker tab must exist');
await mkdir('build/qa',{recursive:true});
try{
 page.on('pageerror',e=>errors.push(e.message));
 if(cdp)savedStorage=await page.evaluate(game=>['save','settings'].map(s=>{const k=`tc-webxr:${game}:${s}`;return [k,localStorage.getItem(k)];}),game);
 if(reference){
  await page.route('**/games/'+game+'/arcade.*',async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);await route.fulfill({body:await readFile(`build/reference/${reference}/${game}/${name}`),contentType:name.endsWith('.js')?'text/javascript':'application/octet-stream',headers:{'Cross-Origin-Resource-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin'}});});
  await page.route('**/app.js',async route=>route.fulfill({body:await readFile(`build/reference/${reference}/app.js`),contentType:'text/javascript'}));
 }
 const worklet=await readFile(reference?`build/reference/${reference}/audio-worklet.js`:'dist/audio-worklet.js','utf8');
 const probedWorklet=worklet.replace("registerProcessor('arcade-audio',ArcadeAudio);",`
 const original=ArcadeAudio.prototype.process;
 ArcadeAudio.prototype.process=function(inputs,outputs){
   const was=this.primed,ready=(Atomics.load(this.state,4)-Atomics.load(this.state,5))>>>0;
   const result=original.call(this,inputs,outputs);
   this.probe??={blocks:0,gapBlocks:0,fadedBlocks:0,silentBlocks:0,minQueue:Infinity,maxQueue:0};
   this.probe.blocks++;if(!this.paused&&was&&ready<Math.ceil(outputs[0][0].length*(Atomics.load(this.state,6)||88200)/sampleRate)+3)this.probe.gapBlocks++;
   if(!this.paused&&this.fade<.999)this.probe.fadedBlocks++;if(!this.paused&&this.fade===0)this.probe.silentBlocks++;
   this.probe.minQueue=Math.min(this.probe.minQueue,ready);this.probe.maxQueue=Math.max(this.probe.maxQueue,ready);
   if(this.probe.blocks%128===0)this.port.postMessage({audioProbe:{...this.probe}});
   return result;
 };
 registerProcessor('arcade-audio',ArcadeAudio);
 `);
 await page.addInitScript(({game,probedWorklet})=>{
  if(new URL(location).searchParams.get('game')===game){localStorage.removeItem(`tc-webxr:${game}:save`);localStorage.setItem(`tc-webxr:${game}:settings`,JSON.stringify({quality:1,refresh:72,adaptive:false}));}
  if(navigator.xr){const request=navigator.xr.requestSession.bind(navigator.xr);navigator.xr.requestSession=async(...args)=>window.audioSession=await request(...args);}
  window.audioXRIntervals=[];if(typeof XRSession!=='undefined'){const raf=XRSession.prototype.requestAnimationFrame;let last=0;XRSession.prototype.requestAnimationFrame=function(fn){return raf.call(this,(t,f)=>{if(last)audioXRIntervals.push(t-last);last=t;fn(t,f);});};}
  const NativeNode=AudioWorkletNode;window.audioProbe=[];
  const NativeContext=AudioContext;
  window.AudioContext=class extends NativeContext{constructor(...args){super(...args);window.audioContext=this;const add=this.audioWorklet.addModule.bind(this.audioWorklet);this.audioWorklet.addModule=async url=>{if(!String(url).includes('audio-worklet.js'))return add(url);const blob=URL.createObjectURL(new Blob([probedWorklet],{type:'text/javascript'}));try{return await add(blob);}finally{URL.revokeObjectURL(blob);}};}};
  window.AudioWorkletNode=class extends NativeNode{constructor(...args){super(...args);this.port.addEventListener('message',e=>{if(e.data.audioProbe)audioProbe.push({time:performance.now(),...e.data.audioProbe});});this.port.start();}};
  let factory;Object.defineProperty(window,'createArcade',{configurable:true,get(){return factory;},set(original){factory=async options=>{
   const replay=[];for(let frame=0;frame<=10000;frame++){
    let bits=0;if(frame>=1500&&frame<1596)bits=frame%12<6?1:0;
    if((frame>=1700&&frame<1706)||(frame>=1900&&frame<1906))bits=16;
    if(frame>=2500)bits=frame%150<135?48:0;
    replay.push(`F ${frame} ${bits.toString(16)} ${Math.round(320+130*Math.sin(frame*.009))} ${Math.round(240+75*Math.sin(frame*.007))} 0`);
   }
   const M=await original({...options,preRun:[M=>{M.ENV.TC2_REPLAY='/audio.rec';M.FS.writeFile('/audio.rec',replay.join('\n'));}]});
   if(M._web_env){const p=M._web_matrices(),e=new TextEncoder();M.HEAPU8.set(e.encode('TC2_REPLAY\0'),p);M.HEAPU8.set(e.encode('/audio.rec\0'),p+64);M._web_env(p,p+64);}
   return M;
  };}});
 },{game,probedWorklet});
 await page.goto((process.env.ARCADE_URL||'http://localhost:8094/')+'?game='+game);
 await page.waitForFunction(()=>window.arcade,null,{polling:100});
 if(cdp){const session=await page.context().newCDPSession(page);await session.send('Runtime.evaluate',{expression:"document.querySelector('#load').click()",userGesture:true});await session.detach();}
 else await page.locator('#load').click();
 await page.waitForFunction(()=>arcade.loaded,null,{timeout:120000,polling:100});
 console.log('Loaded '+game);
 // Exercise the same core quickly up to combat; audio capture starts later.
 await page.evaluate(async()=>{
  const m=arcade.module,advance=m._web_advance,eye=m._web_eye,state=new Int32Array(m.HEAPU8.buffer,m._web_status(),8);m._web_advance=()=>{};m._web_eye=()=>0;
  const until=performance.now()+150000;
  try{while(arcade.state[1]<3000){if(performance.now()>until)throw Error('Core startup timeout');if(arcade.state[0]){m._web_prepare(performance.now());advance(0);}const wait=Atomics.waitAsync?.(state,0,0,50);if(wait?.async)await wait.value;else await new Promise(r=>setTimeout(r,0));}}
  finally{m._web_advance=advance;m._web_eye=eye;}
 });
 console.log('Combat frame '+await page.evaluate(()=>arcade.state[1]));
 if(cdp&&process.argv.includes('--xr')){
  const devtools=await page.context().newCDPSession(page);await devtools.send('Runtime.evaluate',{expression:"document.querySelector('#enter-vr').onclick()",userGesture:true});await devtools.detach();
  await page.waitForFunction(()=>arcade.inVR&&arcade.vr.frames>3,null,{timeout:45000,polling:100});
 }
 await page.evaluate(()=>{const m=arcade.module,advance=m._web_advance;window.audioAdvance=advance;m._web_advance=bits=>{if(arcade.state[1]<3200)advance(bits);};});
 await page.waitForFunction(()=>arcade.state[1]===3200&&arcade.state[0]===1,null,{timeout:60000,polling:100});
 const result=await page.evaluate(async()=>{
  const m=arcade.module,state=new Int32Array(m.HEAPU8.buffer,m._web_status(),8),pcm=new Int16Array(m.HEAPU8.buffer,m._web_audio(),65536*2),advance=window.audioAdvance;
  let read=state[4]>>>0;const chunks=[],start=performance.now(),firstFrame=state[1],firstShots=state[2],firstProbe=audioProbe.at(-1);audioXRIntervals.length=0;
  const priorGLError=document.querySelector('#game').getContext('webgl2').getError();
  const tap=()=>{const w=state[4]>>>0,n=(w-read)>>>0;if(n>65536)throw Error('Capture overrun');const chunk=new Int16Array(n*2);for(let i=0;i<n;i++){chunk[i*2]=pcm[((read+i)&65535)*2];chunk[i*2+1]=pcm[((read+i)&65535)*2+1];}if(n)chunks.push(chunk);read=w;};
  m._web_advance=(...args)=>{tap();if(state[1]<3800)return advance(...args);};
  while(state[1]<3800){if(performance.now()-start>30000)throw Error('Combat capture timeout');await new Promise(r=>setTimeout(r,10));}tap();m._web_advance=advance;
  const samples=new Int16Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){samples.set(c,at);at+=c.length;}
  let rails=0,peak=0,power=0,jumps=0;for(let i=0;i<samples.length;i++){const a=Math.abs(samples[i]);peak=Math.max(peak,a);power+=a*a;if(a>=32767)rails++;if(i>=2&&Math.abs(samples[i]-samples[i-2])>50000)jumps++;}
  const bytes=new Uint8Array(samples.buffer);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {firstFrame,lastFrame:state[1],gameFps:(state[1]-firstFrame)*1000/(performance.now()-start),shots:state[2]-firstShots,rate:state[6],samples:samples.length,peak,rms:Math.sqrt(power/samples.length),rails,railPercent:rails/samples.length*100,largeJumps:jumps,firstProbe,lastProbe:audioProbe.at(-1),xrIntervals:audioXRIntervals,performance:arcade.performance,coreError:state[3],priorGLError,glError:document.querySelector('#game').getContext('webgl2').getError(),pcm:btoa(binary)};
 });
 const pcm=Buffer.from(result.pcm,'base64');delete result.pcm;
 const wav=Buffer.alloc(44);wav.write('RIFF');wav.writeUInt32LE(36+pcm.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(result.rate,24);wav.writeUInt32LE(result.rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);
 await writeFile(`build/qa/${game}-${label}.wav`,Buffer.concat([wav,pcm]));
 await writeFile(`build/qa/${game}-${label}.json`,JSON.stringify({...result,errors},null,2));
 if(cdp)await page.evaluate(async()=>{if(arcade.inVR)await audioSession.end();});
 await page.locator('#game').screenshot({path:`build/qa/${game}-${label}.png`});
 console.log(JSON.stringify({...result,xrIntervals:{count:result.xrIntervals.length,meanMs:result.xrIntervals.reduce((a,b)=>a+b,0)/result.xrIntervals.length},errors}));assert.equal(result.coreError,0);assert.equal(result.glError,0);assert.deepEqual(errors,[]);assert.ok(result.shots>10,'Must capture accepted automatic fire');
}finally{await page.evaluate(()=>window.arcade?.module?.PThread.terminateAllThreads()).catch(()=>{});if(savedStorage)await page.evaluate(entries=>{for(const [k,v]of entries)if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);},savedStorage).catch(()=>{});if(cdp)await page.goto('http://localhost:8094/?quest-test=1').catch(()=>{});await browser.close();}
