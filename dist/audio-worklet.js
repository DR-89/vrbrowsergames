/* Lock-free SPSC PCM ring. Original chip rate -> device rate, in the audio thread. */
// Bounded waveform-similarity overlap/add for a temporarily slow cabinet. The
// sample-rate ratio within each grain stays fixed, preserving pitch. Only the
// spacing of overlapping grains changes. Both ears share the same alignment.
class ArcadeStretch {
  constructor(outputRate){
    this.hop=Math.round(outputRate*.01);this.output=new Float32Array(this.hop*2);this.tail=new Float32Array(this.hop*2);this.cache=new Float32Array((this.hop*3+4)*2);this.reset();
  }
  reset(){this.index=this.hop;this.haveTail=false;this.fraction=0;this.natural=0;this.speed=1;this.queue=null;}
  sample(pcm,position,ch){const i=Math.floor(position),f=position-i;const a=pcm[(i&65535)*2+ch],b=pcm[((i+1)&65535)*2+ch];return (a+(b-a)*f)/32768;}
  build(pcm,read,write,rate,target){
    const available=(write-read)>>>0,ratio=rate/sampleRate,hop=this.hop,search=Math.round(rate*.005);
    const span=2*hop*ratio+1;
    if(available<span+1)return null;
    this.queue=this.queue===null?available:this.queue+(available-this.queue)*.25;
    const desired=Math.max(.8,Math.min(1.01,1+(this.queue-target)/(rate*.12)));
    this.speed+=(desired-this.speed)*.25;
    const center=this.haveTail?search+this.fraction:0;
    let offset=0,cached=false,cacheOffset=0;
    if(this.haveTail){
      const low=-search,high=Math.min(search,Math.floor(available-span-1-center));
      if(high<low)return null;
      offset=Math.max(low,Math.min(high,this.natural));
      if(Math.abs(this.speed-1)>.002||offset!==this.natural){
        let tailEnergy=0;for(let j=0;j<hop;j+=8)tailEnergy+=this.tail[j*2]**2+this.tail[j*2+1]**2;
        if(tailEnergy>1e-8){
          // Resample the bounded search region once. Candidate correlations
          // then use contiguous float reads instead of repeating interpolation
          // and ring-index arithmetic for every candidate and channel.
          const lo=Math.ceil(low/ratio),hi=Math.floor(high/ratio),cache=this.cache;
          const base=read+center+lo*ratio;
          for(let j=0;j<2*hop+hi-lo+1;j++)for(let ch=0;ch<2;ch++)cache[j*2+ch]=this.sample(pcm,base+j*ratio,ch);
          const score=candidate=>{
            let dot=0,energy=0;const pos=candidate-lo,index=Math.floor(pos),f=pos-index;
            for(let j=0;j<hop;j+=8){const at=(index+j)*2;
              const l=cache[at]+(cache[at+2]-cache[at])*f,r=cache[at+1]+(cache[at+3]-cache[at+1])*f;
              dot+=l*this.tail[j*2]+r*this.tail[j*2+1];energy+=l*l+r*r;
            }
            return dot/Math.sqrt(Math.max(1e-20,energy*tailEnergy))-Math.abs(candidate)*ratio*.001/search;
          };
          offset=Math.max(lo,Math.min(hi,offset/ratio));
          let best=score(offset);
          for(let s=lo;s<=hi;s+=8){const value=score(s);if(value>best){best=value;offset=s;}}
          const coarse=offset;
          for(let s=Math.max(lo,coarse-8);s<=Math.min(hi,coarse+8);s++){const value=score(s);if(value>best){best=value;offset=s;}}
          cached=true;cacheOffset=offset-lo;offset*=ratio;
        }else offset=Math.max(low,Math.min(high,0));
      }
    }
    const start=read+center+offset,cacheIndex=Math.floor(cacheOffset),cacheFraction=cacheOffset-cacheIndex;
    for(let j=0;j<hop;j++){
      const blend=this.haveTail?j/hop:1;
      for(let ch=0;ch<2;ch++){
        const at=j*2+ch,ci=(cacheIndex+j)*2+ch,ct=ci+hop*2;
        const next=cached?this.cache[ci]+(this.cache[ci+2]-this.cache[ci])*cacheFraction:this.sample(pcm,start+j*ratio,ch);
        this.output[at]=this.tail[at]*(1-blend)+next*blend;
        this.tail[at]=cached?this.cache[ct]+(this.cache[ct+2]-this.cache[ct])*cacheFraction:this.sample(pcm,start+(hop+j)*ratio,ch);
      }
    }
    const advance=center+hop*ratio*this.speed,whole=Math.floor(advance);
    this.fraction=advance-whole;this.natural=offset+hop*ratio*(1-this.speed);
    this.haveTail=true;this.index=0;
    return (read+whole-search)>>>0;
  }
}
class ArcadeAudio extends AudioWorkletProcessor {
  constructor(options){
    super();const p=options.processorOptions;
    this.pcm=new Int16Array(p.memory,p.audio,65536*2);this.state=new Int32Array(p.memory,p.status,8);
    this.fraction=0;this.fade=0;this.last=[0,0];this.volume=.7;this.paused=false;this.primed=false;
    this.bufferMs=Math.max(35,Math.min(80,Number(p.bufferMs)||35));
    this.recovering=false;this.trim=false;
    this.stretch=p.stretch?new ArcadeStretch(sampleRate):null;
    this.port.onmessage=({data})=>{
      if('volume'in data)this.volume=data.volume;
      if('paused'in data){
        this.paused=data.paused;this.primed=false;this.recovering=true;this.trim=false;this.fraction=0;
        this.stretch?.reset();
        Atomics.store(this.state,5,Atomics.load(this.state,4));
      }
    };
  }
  process(inputs,outputs){
    const out=outputs[0];if(out.length<2)return true;
    let read=Atomics.load(this.state,5)>>>0;const write=Atomics.load(this.state,4)>>>0;
    const rate=Atomics.load(this.state,6)||88200,target=Math.ceil(rate*this.bufferMs/1000);
    const ratio=rate/sampleRate,fadeStep=1/(sampleRate*.005);
    if(((write-read)>>>0)>rate*.2){this.recovering=true;this.primed=false;this.trim=true;this.stretch?.reset();}
    for(let i=0;i<out[0].length;i++){
      // Finish fading before restarting or skipping queued audio. Resuming at
      // the previous nonzero gain creates a discontinuity after a short stall.
      if(this.recovering&&this.fade===0){
        if(this.trim){read=(write-Math.min((write-read)>>>0,Math.max(target,Math.round(rate*.06))))>>>0;this.trim=false;}
        this.fraction=0;this.recovering=false;this.stretch?.reset();
      }
      const available=(write-read)>>>0;
      if(!this.paused&&!this.recovering&&!this.primed&&available>=target)this.primed=true;
      // Interpolation and the following fractional step must both stay inside
      // published PCM, including devices running at a low output sample rate.
      const needed=Math.max(2,Math.floor(this.fraction+ratio));
      if(!this.stretch&&this.primed&&available<needed){this.primed=false;this.recovering=true;}
      let ready=!this.paused&&!this.recovering&&this.primed;
      if(ready&&this.stretch&&this.stretch.index===this.stretch.hop){
        const next=this.stretch.build(this.pcm,read,write,rate,target);
        if(next===null){ready=false;this.primed=false;this.recovering=true;}
        else read=next;
      }
      if(ready){
        this.fade=Math.min(1,this.fade+fadeStep);
        if(this.stretch){this.last[0]=this.stretch.output[this.stretch.index*2];this.last[1]=this.stretch.output[this.stretch.index*2+1];this.stretch.index++;}
        else {for(let c=0;c<2;c++){
          const a=this.pcm[(read&65535)*2+c],b=this.pcm[((read+1)&65535)*2+c];
          this.last[c]=(a+(b-a)*this.fraction)/32768;
        }
        this.fraction+=ratio;const step=Math.floor(this.fraction);read=(read+step)>>>0;this.fraction-=step;
        }
      }else this.fade=Math.max(0,this.fade-fadeStep);
      for(let c=0;c<2;c++)out[c][i]=this.last[c]*this.fade*this.volume;
    }
    Atomics.store(this.state,5,read);return true;
  }
}
registerProcessor('arcade-audio',ArcadeAudio);
