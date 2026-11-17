// Keep the arcade clock at its original rate. These controls only budget drawing.
export function renderDefaults(userAgent,game){
  // This is the standalone browser, not a PC streaming to a Quest. Saved
  // user settings still take precedence. Start with a full-size 72 Hz image.
  return /OculusBrowser\//.test(userAgent)&&['tc2','cz'].includes(game)
    ?{quality:1,refresh:72,adaptive:false}:{quality:.85,refresh:120,adaptive:true};
}
export class RenderBudget {
  constructor(){this.reset();}
  reset(){this.scale=.8;this.samples=[];this.lastChange=0;this.headroomSince=0;}
  observe(gpuMs,time,hz=120){
    if(!Number.isFinite(gpuMs)||gpuMs<=0||gpuMs>500)return false;
    this.samples.push(gpuMs);if(this.samples.length>12)this.samples.shift();
    if(this.samples.length<6||time-this.lastChange<800)return false;
    const sorted=[...this.samples].sort((a,b)=>a-b),cost=sorted[Math.floor(sorted.length*.8)];
    const budget=1000/Math.max(60,hz)*.78;
    let next=this.scale;
    if(cost>budget*1.1){next=Math.max(.4,Math.floor(this.scale*Math.max(.7,Math.sqrt(budget/cost))/.05)*.05);this.headroomSince=0;}
    else if(cost<budget*.65){
      if(!this.headroomSince)this.headroomSince=time;
      if(time-this.headroomSince>=3000)next=Math.min(1,this.scale+.05);
    }else this.headroomSince=0;
    if(Math.abs(next-this.scale)<.025)return false;
    this.scale=Number(next.toFixed(2));this.lastChange=time;this.samples=[];this.headroomSince=0;return true;
  }
}

export function renderSize(width,height,scale){
  // Keep both eye targets stable across small viewport changes; never exceed it.
  const s=Math.max(.1,Math.min(1,scale));
  if(s===1)return {width,height};
  return {width:Math.max(1,Math.min(width,Math.round(width*s/8)*8)),height:Math.max(1,Math.min(height,Math.round(height*s/8)*8))};
}

export async function requestFrameRate(session,target){
  const rates=Array.from(session.supportedFrameRates||[]).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);
  if(!rates.length||typeof session.updateTargetFrameRate!=='function')return null;
  const selected=rates.filter(n=>n<=target+.1).at(-1)||rates[0];
  if(session.frameRate!==selected)await session.updateTargetFrameRate(selected);
  return selected;
}

export class GPUTimer {
  constructor(gl){this.gl=gl;this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');this.pending=[];this.active=null;this.frame=0;}
  begin(){
    if(!this.ext||this.active||this.pending.length>=4||this.frame++%8)return;
    this.active=this.gl.createQuery();this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,this.active);
  }
  end(){if(this.active){this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.pending.push(this.active);this.active=null;}}
  poll(){
    if(!this.ext||!this.pending.length)return null;
    const gl=this.gl;
    if(!gl.getQueryParameter(this.pending[0],gl.QUERY_RESULT_AVAILABLE))return null;
    const disjoint=gl.getParameter(this.ext.GPU_DISJOINT_EXT);let ms=null;
    while(this.pending.length&&gl.getQueryParameter(this.pending[0],gl.QUERY_RESULT_AVAILABLE)){
      const q=this.pending.shift();if(!disjoint)ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);
    }
    if(disjoint){for(const q of this.pending)gl.deleteQuery(q);this.pending=[];}
    return ms;
  }
  dispose(){this.end();for(const q of this.pending)this.gl.deleteQuery(q);this.pending=[];}
}
