import test from 'node:test';
import assert from 'node:assert/strict';
import {CoreScheduler,createTaskTimer} from '../dist/core-scheduler.js';

function clock(){
 let now=0,id=0;const tasks=new Map();
 return {now:()=>now,timer:(fn,delay)=>{tasks.set(++id,{at:now+delay,fn});return id;},cancel:id=>tasks.delete(id),
  async until(end){let n=0;while(true){await Promise.resolve();const due=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!due||due[1].at>end)break;if(++n>10000)throw Error('Scheduler busy-loop');tasks.delete(due[0]);now=due[1].at;due[1].fn();}now=end;await Promise.resolve();},get count(){return tasks.size;}};
}

test('15 ms core work sustains the arcade clock independently of a 72 Hz view',async()=>{
 const time=clock();let ready=true,due=0,frames=0,resolve;
 const s=new CoreScheduler({...time,active:()=>true,ready:()=>ready,due:()=>due,onError:e=>{throw e;},
  waitReady:()=>({async:true,value:new Promise(r=>resolve=r)}),
  step:now=>{if(ready&&now>=due){frames++;ready=false;due+=1000/60;time.timer(()=>{ready=true;resolve?.('ok');resolve=null;},15);}}
 });
 s.start();await time.until(999);s.stop();assert.ok(frames>=59&&frames<=61,frames);
 // The previous display-gated scheme can only release every second 72 Hz
 // callback when work takes longer than one 13.89 ms display interval.
 let old=0,readyAt=0;for(let t=0;t<999;t+=1000/72)if(t>=readyAt){old++;readyAt=t+15;}
 assert.ok(old<=37,old);
});

test('pause/resume and stale completion cannot restart a stopped session',async()=>{
 const time=clock();let active=true,ready=false,steps=0,resolve;
 const s=new CoreScheduler({...time,step:()=>steps++,due:()=>0,active:()=>active,ready:()=>ready,
  waitReady:()=>({async:true,value:new Promise(r=>resolve=r)}),onError:e=>{throw e;}});
 s.start();await time.until(0);assert.equal(steps,1);s.stop();resolve('ok');await time.until(50);assert.equal(steps,1);
 active=false;s.start();await time.until(51);const paused=steps;await time.until(100);assert.equal(steps,paused);
 active=true;ready=true;s.wake();await time.until(101);assert.ok(steps>paused);s.stop();assert.equal(time.count,0);
});

test('missing waitAsync uses bounded polling and reports a failed step once',async()=>{
 const time=clock();let calls=0,errors=0;
 const s=new CoreScheduler({...time,due:()=>0,ready:()=>false,active:()=>true,waitReady:()=>null,
  step:()=>{if(++calls===4)throw Error('core stopped');},onError:()=>errors++});
 s.start();await time.until(100);assert.equal(calls,4);assert.equal(errors,1);assert.equal(time.count,0);assert.equal(s.running,false);
});

test('message tasks cancel posted work and timers, preserve order, and dispose cleanly',async()=>{
 const tasks=createTaskTimer(),seen=[];
 const posted=tasks.timer(()=>seen.push('cancelled message'),0);tasks.cancel(posted);
 const delayed=tasks.timer(()=>seen.push('cancelled timer'),10);tasks.cancel(delayed);
 await new Promise(resolve=>{tasks.timer(()=>seen.push('first'),0);tasks.timer(()=>{seen.push('second');resolve();},0);});
 assert.deepEqual(seen,['first','second']);tasks.timer(()=>seen.push('disposed'),10);tasks.dispose();
 await new Promise(resolve=>setTimeout(resolve,20));assert.deepEqual(seen,['first','second']);
});
