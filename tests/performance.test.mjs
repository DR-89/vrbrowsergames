import test from 'node:test';
import assert from 'node:assert/strict';
import {RenderBudget,renderSize,renderDefaults,requestFrameRate,GPUTimer} from '../dist/performance.js';

test('standalone Quest System 23 defaults keep native resolution at 72 Hz',()=>{
 const quest='Mozilla/5.0 (X11; Linux x86_64; Quest 3) OculusBrowser/156.0 VR';
 for(const game of ['tc2','cz'])assert.deepEqual(renderDefaults(quest,game),{quality:1,refresh:72,adaptive:false});
 for(const [ua,game]of [[quest,'tc1'],['Chrome/156.0 Windows','tc2']])assert.deepEqual(renderDefaults(ua,game),{quality:.85,refresh:120,adaptive:true});
 assert.deepEqual(renderSize(1683,1763,1),{width:1683,height:1763});
});

test('GPU overload reduces resolution within bounds and never changes the game clock',()=>{
 const b=new RenderBudget();const initial=b.scale;
 for(let t=0;t<8000;t+=100)b.observe(30,t,120);
 assert.ok(b.scale<initial);assert.equal(b.scale,.4);
 for(let t=8000;t<16000;t+=100)b.observe(NaN,t,120);
 assert.equal(b.scale,.4);
});
test('resolution recovers slowly with sustained headroom and does not oscillate on one spike',()=>{
 const b=new RenderBudget();for(let t=0;t<900;t+=100)b.observe(5,t,120);
 const stable=b.scale;b.observe(40,1000,120);assert.equal(b.scale,stable);
 for(let t=1100;t<10000;t+=100)b.observe(1,t,120);
 assert.ok(b.scale>stable);assert.ok(b.scale<=1);
});
test('internal eye targets fit the viewport even at odd sizes',()=>{
 assert.deepEqual(renderSize(960,1080,.5),{width:480,height:544});
 for(const scale of [.4,.8,1,2]){const s=renderSize(987,1001,scale);assert.ok(s.width>0&&s.width<=987&&s.height>0&&s.height<=1001);}
});
test('refresh selection only requests rates the runtime actually advertises',async()=>{
 const calls=[],session={supportedFrameRates:new Float32Array([120,72,90]),frameRate:72,async updateTargetFrameRate(n){calls.push(n);this.frameRate=n;}};
 assert.equal(await requestFrameRate(session,120),120);
 assert.equal(await requestFrameRate(session,100),90);
 assert.deepEqual(calls,[120,90]);assert.equal(await requestFrameRate({},120),null);
});
test('GPU timing never reads pending results and discards disjoint results',()=>{
 let ready=false,disjoint=false,reads=0,deletes=0;
 const ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2},gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,getExtension:()=>ext,createQuery:()=>({}),beginQuery(){},endQuery(){},deleteQuery(){deletes++;},getParameter:()=>disjoint,getQueryParameter(q,p){if(p===3)return ready;reads++;return 6000000;}};
 const timer=new GPUTimer(gl);timer.begin();timer.end();assert.equal(timer.poll(),null);assert.equal(reads,0);
 ready=true;assert.equal(timer.poll(),6);assert.equal(reads,1);assert.equal(deletes,1);
 for(let i=0;i<8;i++)timer.begin();timer.end();disjoint=true;assert.equal(timer.poll(),null);assert.equal(reads,1);timer.dispose();
});
