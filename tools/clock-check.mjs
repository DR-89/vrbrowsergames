// Real browser event-loop scheduling, separate from synthetic-clock unit tests.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://localhost:8094/');
 const result=await page.evaluate(async()=>{
  const {CoreScheduler,createTaskTimer}=await import('./core-scheduler.js');const task=createTaskTimer();
  const chain=timer=>new Promise(resolve=>{let n=0,last=performance.now(),times=[];function step(){const now=performance.now();times.push(now-last);last=now;if(++n<60)timer(step,0);else resolve(times.slice(10).reduce((a,b)=>a+b,0)/50);}timer(step,0);});
  const legacyDelay=await chain(setTimeout),messageDelay=await chain(task.timer);
  const run=(timer,cancel)=>new Promise(resolve=>{
   let ready=true,notify,due=0,frames=0;const start=performance.now();
   const scheduler=new CoreScheduler({timer,cancel,active:()=>true,ready:()=>ready,due:()=>due,onError:e=>{throw e;},waitReady:()=>({async:true,value:new Promise(r=>notify=r)}),step:now=>{
    if(ready&&now>=due){if(!due)due=now;frames++;ready=false;due+=1000/60;setTimeout(()=>{ready=true;notify?.();notify=null;},15);}
   }});
   scheduler.start();setTimeout(()=>{scheduler.stop();resolve({frames,ms:performance.now()-start});},1500);
  });
  const legacy=await run((fn,delay)=>setTimeout(fn,delay),id=>clearTimeout(id)),messages=await run(task.timer,task.cancel);task.dispose();
  return {legacyDelay,messageDelay,legacy,messages};
 });
 await writeFile('build/qa/browser-clock.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 assert.ok(result.messages.frames>0);assert.ok(result.legacy.frames>0);
}finally{await browser.close();}
