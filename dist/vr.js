// Detection is advisory: a headset can connect between this check and a click.
// requestSession must remain directly in the click handler to retain activation.
export class VRAvailability {
  constructor({xr,secure,allowed=true,onChange=()=>{}}) {
    Object.assign(this,{xr,secure,allowed,onChange});
    this.state='checking';this.error='';this.revision=0;
  }
  get canRequest(){return this.secure&&this.allowed&&typeof this.xr?.requestSession==='function';}
  async refresh(){
    const revision=++this.revision;
    this.error='';
    if(!this.secure)this.state='insecure';
    else if(!this.allowed)this.state='blocked';
    else if(!this.xr)this.state='no-api';
    else {
      this.state='checking';this.onChange();
      try{
        const supported=await this.xr.isSessionSupported('immersive-vr');
        if(revision!==this.revision)return;
        this.state=supported?'available':'unavailable';
      }catch(e){
        if(revision!==this.revision)return;
        this.state='error';this.error=`${e.name}: ${e.message}`;
      }
    }
    this.onChange();
  }
  watch(windowTarget,documentTarget){
    const refresh=()=>{void this.refresh();};
    const visible=()=>{if(!documentTarget.hidden)refresh();};
    this.xr?.addEventListener?.('devicechange',refresh);
    windowTarget.addEventListener('focus',refresh);
    documentTarget.addEventListener('visibilitychange',visible);
    refresh();
    return ()=>{
      ++this.revision;
      this.xr?.removeEventListener?.('devicechange',refresh);
      windowTarget.removeEventListener('focus',refresh);
      documentTarget.removeEventListener('visibilitychange',visible);
    };
  }
}

export function vrErrorMessage(error){
  const detail=`${error.name||'Error'}: ${error.message||String(error)}`;
  const advice={
    NotAllowedError:'Allow VR access in the browser, then click Enter VR again.',
    SecurityError:'Open the page directly in your PC browser or headset browser and allow VR access.',
    NotSupportedError:'Connect your headset to the active OpenXR runtime, then check the headset again. With Virtual Desktop, use a PC browser with VDXR or SteamVR configured.',
    InvalidStateError:'Close any other immersive VR session, return to this tab and try again.'
  }[error.name]||'The browser could not start the VR runtime. With Virtual Desktop, check the headset connection and active OpenXR runtime. On laptops, run the browser on the VR graphics card. Reopen the browser after changing the runtime.';
  return `${advice} (${detail})`;
}
