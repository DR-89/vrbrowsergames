import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function worklet(options={}){
 let Processor;const memory=new SharedArrayBuffer(64+65536*4);
 const context={AudioWorkletProcessor:class{port={};},sampleRate:options.sampleRate||48000,Int16Array,Int32Array,Atomics,Math,registerProcessor:(_,p)=>Processor=p};
 vm.runInNewContext(readFileSync(new URL('../dist/audio-worklet.js',import.meta.url),'utf8'),context);
 const p=new Processor({processorOptions:{memory,status:0,audio:64,...options}}),state=new Int32Array(memory,0,8),pcm=new Int16Array(memory,64);
 state[6]=88200;state[7]=65536;
 const block=()=>{const output=[new Float32Array(128),new Float32Array(128)];p.process([], [output]);return output;};
 return {p,state,pcm,block};
}
test('audio resampling preserves distinct stereo channels and stays inside produced PCM',()=>{
 const {state,pcm,block}=worklet();for(let i=0;i<5000;i++){pcm[i*2]=12000;pcm[i*2+1]=-6000;}state[4]=5000;
 for(let i=0;i<3;i++)block();const [left,right]=block();assert(left[127]>.2);assert(right[127]<-.1);assert(Math.abs(left[127]+right[127]*2)<1e-6);
 assert(state[5]>900&&state[5]<1000);assert(state[5]<state[4]);
});
test('starvation fades to silence without consuming unwritten samples and pause flushes',()=>{
 const {p,state,pcm,block}=worklet();pcm.fill(10000);state[4]=4000;
 for(let i=0;i<30;i++)block();assert.equal(block()[0][127],0);assert(state[5]<=state[4]);
 state[4]+=5000;p.port.onmessage({data:{paused:true}});assert.equal(state[5],state[4]);assert.equal(block()[0][127],0);
});
test('audio read indices wrap safely across the unsigned counter boundary',()=>{
 const {state,pcm,block}=worklet();pcm.fill(5000);state[5]=-2000;state[4]=3000;
 for(let i=0;i<10;i++)block();assert(state[5]>=300&&state[5]<=400);assert(block()[0][0]>0);
});

test('short underflow completes its fade before opposite-polarity PCM resumes',()=>{
 const {p,state,pcm,block}=worklet();pcm.fill(20000);state[4]=4000;
 for(let i=0;i<17;i++)block();const tail=block();
 assert.ok(p.recovering&&p.fade>0);
 const at=state[5];for(let i=0;i<6000;i++){pcm[((at+i)&65535)*2]=-20000;pcm[((at+i)&65535)*2+1]=-20000;}state[4]=at+6000;
 const refill=block(),next=block();let previous=tail[0][127],maxStep=0;
 for(const value of [...refill[0],...next[0]]){maxStep=Math.max(maxStep,Math.abs(value-previous));previous=value;}
 assert.ok(maxStep<.005,`Restart discontinuity ${maxStep}`);assert.ok(next[0][127]<0);
});

test('backlog trimming fades before changing waveform and bounds latency',()=>{
 const {state,pcm,block}=worklet();pcm.fill(20000);state[4]=6000;
 for(let i=0;i<4;i++)block();const before=block()[0][127];
 const read=state[5];for(let i=0;i<25000;i++){pcm[((read+i)&65535)*2]=-20000;pcm[((read+i)&65535)*2+1]=-20000;}state[4]=read+25000;
 const a=block(),b=block(),c=block();let prev=before;
 for(const value of [...a[0],...b[0],...c[0]]){assert.ok(Math.abs(value-prev)<.005);prev=value;}
 assert.ok(state[4]-state[5]<88200*.065);assert.ok(c[0][127]<0);
});

test('Crisis Zone reserve absorbs a 50 ms producer stall at unchanged pitch',()=>{
 const {p,state,pcm,block}=worklet({bufferMs:60});pcm.fill(12000);state[4]=6000;
 for(let i=0;i<20;i++)block();assert.equal(p.fade,1);assert.equal(p.recovering,false);
 state[4]+=4500;const output=block();assert.equal(p.fade,1);assert.ok(output[0][127]>.2);
 // Buffering does not alter the source/output clock ratio.
 assert.ok(Math.abs(state[5]-21*128*88200/48000)<2);
});

test('low output sample rates never advance beyond the published write index',()=>{
 const {state,pcm,block}=worklet({sampleRate:16000});pcm.fill(4000);state[4]=4001;
 for(let i=0;i<15;i++)block();assert.ok(state[5]<=state[4]);assert.equal(block()[0][127],0);
});

test('Crisis Zone audio stays continuous at 52 game fps without lowering pitch',()=>{
 const {p,state,pcm,block}=worklet({bufferMs:60,stretch:true});const rate=88200;
 let produced=0,frames=0,nextFrame=0,faded=0,leftCross=0,rightCross=0,prevL=0,prevR=0,power=0,count=0;
 const originalHz=25600000/(814*525);
 for(let n=0;n<Math.ceil(7*48000/128);n++){
  const time=n*128/48000;
  while(time>=nextFrame){frames++;nextFrame+=1/(time<1.5||time>=5.5?originalHz:52);}
  const target=Math.floor(frames*rate/originalHz);
  for(;produced<target;produced++){pcm[(produced&65535)*2]=Math.round(20000*Math.sin(2*Math.PI*440*produced/rate));pcm[(produced&65535)*2+1]=Math.round(15000*Math.sin(2*Math.PI*660*produced/rate));}
  state[4]=produced;const [l,r]=block();
  assert.ok(((state[4]-state[5])>>>0)<65536,'Reader cannot overtake producer');
  if(time>.5&&p.fade<.999)faded++;
  if(time>=2.5&&time<5.5){for(let i=0;i<l.length;i++){if(prevL<=0&&l[i]>0)leftCross++;if(prevR<=0&&r[i]>0)rightCross++;prevL=l[i];prevR=r[i];power+=l[i]*l[i];count++;}}
 }
 const seconds=count/48000;
 assert.equal(faded,0,'Sustained 52 fps must not create repeated fades or silent gaps');
 assert.ok(Math.abs(leftCross/seconds-440)<3,`Left pitch ${leftCross/seconds}`);
 assert.ok(Math.abs(rightCross/seconds-660)<3,`Right pitch ${rightCross/seconds}`);
 assert.ok(Math.sqrt(power/count)>.2,'Overlap must not cancel the signal');
 assert.ok(p.stretch.speed>.95&&p.stretch.speed<1.02,'Recover original tempo at full game speed');
});

test('time stretching preserves antiphase stereo, counter wrap, and pause flushing',()=>{
 const {p,state,pcm,block}=worklet({bufferMs:60,stretch:true});state[5]=-2000;state[4]=4000;
 for(let i=0;i<65536;i++){pcm[i*2]=Math.round(18000*Math.sin(i*.02));pcm[i*2+1]=-pcm[i*2];}
 for(let n=0;n<12;n++){const [l,r]=block();for(let i=0;i<l.length;i++){assert.ok(Number.isFinite(l[i]));assert.ok(Math.abs(l[i]+r[i])<1e-7);}assert.ok(((state[4]-state[5])>>>0)<65536);}
 p.port.onmessage({data:{paused:true}});assert.equal(state[4],state[5]);for(let i=0;i<4;i++)block();assert.equal(Math.abs(block()[0][127]),0);
});

test('time stretching stops on a long stall and never replays stale audio after pause',()=>{
 const {p,state,pcm,block}=worklet({bufferMs:60,stretch:true});pcm.fill(15000);state[4]=6000;
 for(let i=0;i<80;i++){block();assert.ok(state[5]<=state[4]);}
 assert.equal(Math.abs(block()[0][127]),0);assert.equal(p.primed,false);
 p.port.onmessage({data:{paused:true}});p.port.onmessage({data:{paused:false}});
 for(let i=0;i<10;i++)assert.equal(Math.abs(block()[0][127]),0);
});
