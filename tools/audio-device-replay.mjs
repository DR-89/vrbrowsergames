// Run the captured firefight through a real browser AudioWorklet at 52 game
// fps. OfflineAudioContext needs no headset display or audio permission. Its
// throughput is diagnostic, not proof of real-time XR/audio deadlines.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),cdp=process.env.ARCADE_CDP;
const browser=cdp?await chromium.connectOverCDP(cdp):await chromium.launch({channel:'chrome',headless:true});
const page=cdp?browser.contexts()[0].pages().find(p=>p.url()==='http://localhost:8094/?quest-test=1'):await browser.newPage();
const results=[];
try{
 assert.ok(page,'Owned marker tab missing; leave other tabs untouched');
 if(!cdp)await page.goto('http://localhost:8094/?quest-test=1');
 for(const variant of ['before','after']){
  const source=await readFile(variant==='before'?'build/reference/20261114-cz-audio/audio-worklet.js':'dist/audio-worklet.js','utf8');
  const pcm=(await readFile(`build/qa/cz-exact-${variant}.wav`)).subarray(44).toString('base64');
  const result=await page.evaluate(async({source,pcm,variant})=>{
   const bytes=Uint8Array.from(atob(pcm),c=>c.charCodeAt(0)),samples=new Int16Array(bytes.buffer),hz=25600000/(814*525),duration=samples.length/2/88200*hz/52;
   const blocks=Math.floor(duration*48000/128),memory=new SharedArrayBuffer(64+65536*4),state=new Int32Array(memory,0,8);state[6]=88200;state[7]=65536;
   const probe=`
    class ReplayProbe extends ArcadeAudio {
     constructor(options){super(options);this.source=options.processorOptions.source;this.blocks=options.processorOptions.blocks;this.written=0;this.count=0;this.faded=0;this.silent=0;this.invalid=0;this.elapsed=0;this.maxMs=0;this.checked=0;}
     process(inputs,outputs){
      const time=this.count*128/sampleRate,target=Math.min(this.source.length/2,Math.floor(Math.floor(time*52+1)*88200/(25600000/(814*525))));
      for(;this.written<target;this.written++){this.pcm[(this.written&65535)*2]=this.source[this.written*2];this.pcm[(this.written&65535)*2+1]=this.source[this.written*2+1];}Atomics.store(this.state,4,this.written);
      const t=Date.now();super.process(inputs,outputs);const cost=Date.now()-t;this.elapsed+=cost;this.maxMs=Math.max(this.maxMs,cost);
      if(((Atomics.load(this.state,4)-Atomics.load(this.state,5))>>>0)>=65536)this.invalid++;
      if(time>1&&time<this.blocks*128/sampleRate-.3){this.checked++;if(this.fade<.999)this.faded++;if(this.fade===0)this.silent++;}
      if(++this.count===this.blocks)this.port.postMessage({blocks:this.count,checked:this.checked,faded:this.faded,silent:this.silent,invalid:this.invalid,coarseCpuMs:this.elapsed,coarseMaxBlockMs:this.maxMs,speed:this.stretch?.speed});
      return true;
     }
    }
    registerProcessor('replay-probe',ReplayProbe);
   `;
   const context=new OfflineAudioContext(2,blocks*128,48000),blob=URL.createObjectURL(new Blob([source.replace("registerProcessor('arcade-audio',ArcadeAudio);",probe)],{type:'text/javascript'}));
   await context.audioWorklet.addModule(blob);URL.revokeObjectURL(blob);
   const node=new AudioWorkletNode(context,'replay-probe',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{memory,status:0,audio:64,bufferMs:variant==='after'?60:35,stretch:variant==='after',source:samples,blocks}});
   const stats=new Promise(resolve=>node.port.onmessage=e=>resolve(e.data));node.connect(context.destination);
   const started=performance.now();await context.startRendering();const elapsedMs=performance.now()-started;
   return {variant,duration,elapsedMs,stats:await stats,userAgent:navigator.userAgent};
  },{source,pcm,variant});
  console.log(JSON.stringify(result));results.push(result);
 }
 const report=`build/qa/cz-audio-device-${cdp?'quest':'pc'}.json`;await writeFile(report,JSON.stringify(results,null,2));
 assert.equal(results[1].stats.invalid,0);assert.equal(results[1].stats.faded,0);assert.equal(results[1].stats.silent,0);
}finally{await browser.close();}
