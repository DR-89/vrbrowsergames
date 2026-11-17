// A 60 Hz arcade clock must not wait for the next 72 Hz headset callback.
// The core parks at its existing snapshot gate; only this main-thread task
// prepares/releases it. Drawing stays synchronous and owns all GL calls.
// A repeating setTimeout chain is clamped by browsers to at least 4 ms.
// Deliver each tick as a message task so an already-ready core can resume
// promptly, while positive deadlines still use a timer (never busy polling).
export function createTaskTimer(){
  const channel=new MessageChannel(),jobs=new Map();let next=0;
  channel.port1.onmessage=({data:id})=>{const job=jobs.get(id);if(!job)return;jobs.delete(id);job.fn();};
  const cancel=id=>{const job=jobs.get(id);if(!job)return;if(job.timer!==null)clearTimeout(job.timer);jobs.delete(id);};
  return {
    timer(fn,delay){const id=++next,job={fn,timer:null};jobs.set(id,job);if(delay>0)job.timer=setTimeout(()=>channel.port2.postMessage(id),delay);else channel.port2.postMessage(id);return id;},
    cancel,
    dispose(){for(const id of jobs.keys())cancel(id);channel.port1.close();channel.port2.close();}
  };
}
let defaultTasks;
const taskTimer=(fn,delay)=>(defaultTasks??=createTaskTimer()).timer(fn,delay);
const taskCancel=id=>defaultTasks?.cancel(id);
export class CoreScheduler {
  constructor({step,due,ready,waitReady,active,onError,now=()=>performance.now(),timer=taskTimer,cancel=taskCancel}){
    Object.assign(this,{step,due,ready,waitReady,active,onError,now,timer,cancel});
    this.running=false;this.generation=0;this.pending=null;
  }
  start(){if(this.running)return;this.running=true;this.wake();}
  stop(){this.running=false;this.generation++;if(this.pending!==null)this.cancel(this.pending);this.pending=null;}
  wake(){
    if(!this.running)return;
    if(this.pending!==null)this.cancel(this.pending);
    const generation=++this.generation;
    this.pending=this.timer(()=>this.tick(generation),0);
  }
  schedule(generation,delay){
    if(!this.running||generation!==this.generation)return;
    this.pending=this.timer(()=>this.tick(generation),Math.max(0,Math.ceil(delay)));
  }
  tick(generation){
    if(!this.running||generation!==this.generation)return;
    this.pending=null;
    try{
      this.step(this.now());
      if(!this.running||generation!==this.generation)return;
      if(!this.active()){this.schedule(generation,100);return;}
      if(!this.ready()){
        const wait=this.waitReady?.();
        if(wait?.async){
          wait.value.then(()=>this.schedule(generation,Math.max(0,this.due()-this.now())),error=>{
            if(this.running&&generation===this.generation){this.stop();this.onError(error);}
          });
          return;
        }
        // Older engines lack waitAsync; bounded polling still avoids tying
        // the original game clock to display refresh or blocking the browser.
        this.schedule(generation,2);return;
      }
      this.schedule(generation,Math.max(1,this.due()-this.now()));
    }catch(error){this.stop();this.onError(error);}
  }
}
