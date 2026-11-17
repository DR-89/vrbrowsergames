// Replay captured cabinet PCM at the measured slow-core cadence. This isolates
// underrun recovery and worklet cost; it is not a headset performance benchmark.
import vm from 'node:vm';
import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const sourceRate=88200,outputRate=48000,gameHz=25600000/(814*525),slowHz=52;
async function run(label,file,worklet,stretch){
 const wave=await readFile(file),pcmSource=new Int16Array(wave.buffer,wave.byteOffset+44,(wave.length-44)/2);
 let Processor;const memory=new SharedArrayBuffer(64+65536*4),state=new Int32Array(memory,0,8),pcm=new Int16Array(memory,64);
 vm.runInNewContext(await readFile(worklet,'utf8'),{AudioWorkletProcessor:class{port={};},sampleRate:outputRate,Int16Array,Int32Array,Float32Array,Atomics,Math,registerProcessor:(_,c)=>Processor=c});
 const p=new Processor({processorOptions:{memory,status:0,audio:64,bufferMs:stretch?60:35,stretch}});state[6]=sourceRate;state[7]=65536;
 const duration=pcmSource.length/2/sourceRate*gameHz/slowHz,blocks=Math.floor(duration*outputRate/128),rendered=new Int16Array(blocks*128*2),times=[];
 let written=0,faded=0,silent=0,checked=0,minQueue=Infinity,maxQueue=0;
 for(let n=0;n<blocks;n++){
  const time=n*128/outputRate,target=Math.min(pcmSource.length/2,Math.floor(Math.floor(time*slowHz+1)*sourceRate/gameHz));
  for(;written<target;written++){pcm[(written&65535)*2]=pcmSource[written*2];pcm[(written&65535)*2+1]=pcmSource[written*2+1];}state[4]=written;
  const out=[new Float32Array(128),new Float32Array(128)],start=performance.now();p.process([], [out]);times.push(performance.now()-start);
  const queue=(state[4]-state[5])>>>0;if(queue>=65536)throw Error('Invalid read cursor');
  if(time>1&&time<duration-.3){checked++;if(p.fade<.999)faded++;if(p.fade===0)silent++;minQueue=Math.min(minQueue,queue);maxQueue=Math.max(maxQueue,queue);}
  for(let i=0;i<128;i++)for(let ch=0;ch<2;ch++){if(!Number.isFinite(out[ch][i])||Math.abs(out[ch][i])>1)throw Error('Invalid output');rendered[(n*128+i)*2+ch]=Math.round(out[ch][i]*32767);}
 }
 times.sort((a,b)=>a-b);const report={label,sourceFrames:pcmSource.length/2,gameFps:slowHz,duration,checkedBlocks:checked,fadedBlocks:faded,silentBlocks:silent,minQueueMs:minQueue/sourceRate*1000,maxQueueMs:maxQueue/sourceRate*1000,workletMeanMs:times.reduce((a,b)=>a+b,0)/times.length,workletP95Ms:times[Math.floor(times.length*.95)],workletP99Ms:times[Math.floor(times.length*.99)],finalSpeed:p.stretch?.speed};
 const head=Buffer.alloc(44);head.write('RIFF');head.writeUInt32LE(36+rendered.byteLength,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(2,22);head.writeUInt32LE(outputRate,24);head.writeUInt32LE(outputRate*4,28);head.writeUInt16LE(4,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(rendered.byteLength,40);
 await writeFile(`build/qa/cz-output-${label}.wav`,Buffer.concat([head,Buffer.from(rendered.buffer)]));return report;
}
const results=[];
results.push(await run('before','build/qa/cz-exact-before.wav','build/reference/20261114-cz-audio/audio-worklet.js',false));
results.push(await run('after','build/qa/cz-exact-after.wav','dist/audio-worklet.js',true));
await writeFile('build/qa/cz-audio-replay.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
if(results[1].silentBlocks||results[1].fadedBlocks)throw Error('Slow-core audio still runs dry');
