// Preserve trigger edges when the headset renders faster than the arcade ticks.
export class TriggerLatch {
  submitted=false; observed=false; pending=false; release=false;
  press(){this.pending=true;if(this.submitted)this.release=true;}
  observe(held,handoff=false){if(held&&(!this.observed||handoff))this.press();this.observed=held;}
  reset(){this.observed=this.pending=false;this.release=this.submitted;}
  tick(held){
    let fire=held;
    if(this.release){fire=false;this.release=false;}
    else if(this.pending){fire=true;this.pending=false;}
    this.submitted=fire;return fire;
  }
}
// Match the native TC2 cover thresholds: 20 cm down, 12 cm back up.
export class PhysicalCover{
 calibrated=false;ducked=false;upright=0;
 calibrate(y){if(!Number.isFinite(y))return;this.upright=y;this.calibrated=true;this.ducked=false;}
 pedal(y,tracked=true){if(!tracked||!this.calibrated||!Number.isFinite(y))return false;const drop=this.upright-y;if(drop>=.20)this.ducked=true;else if(drop<=.12)this.ducked=false;return !this.ducked;}
}

// object-fit: contain leaves bars on wide/tall screens. They are not gun targets.
export function screenPoint(clientX,clientY,rect,aspect=4/3){
 const width=Math.min(rect.width,rect.height*aspect),height=width/aspect;
 if(!(width>0&&height>0))return {x:.5,y:.5,inside:false};
 const x=(clientX-rect.left-(rect.width-width)/2)/width;
 const y=(clientY-rect.top-(rect.height-height)/2)/height;
 return {x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y)),inside:Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1&&y>=0&&y<=1};
}

// Absolute pointer input needs no pointer lock, device IDs or USB permission.
export class ScreenGunInput{
 point={x:.5,y:.5,inside:false};primary=false;secondary=false;pendingPoint=null;
 trigger=new TriggerLatch();mode='mouse';coverMode='reload';coverButton=2;
 move(point){this.point=point;}
 press(){if(this.mode==='lightgun'&&!this.point.inside)return;this.pendingPoint={...this.point};this.trigger.press();}
 down(button){if(button===0){this.primary=true;this.press();}if(button===this.coverButton)this.secondary=true;}
 up(button){if(button===0)this.primary=false;if(button===this.coverButton)this.secondary=false;}
 reset(){this.primary=this.secondary=false;this.pendingPoint=null;this.trigger.reset();this.point={...this.point,inside:false};}
 sample(enter=false,space=false){
  const held=this.primary||enter;
  // A short trigger tap keeps its original aim even if the gun moves before a tick.
  this.trigger.observe(held);const firing=this.trigger.tick(held);
  const point=firing&&this.pendingPoint?this.pendingPoint:this.point;
  if(firing)this.pendingPoint=null;
  const reloadMode=this.mode==='lightgun'&&this.coverMode==='reload';
  const pedal=reloadMode?point.inside&&!this.secondary&&!space:this.secondary||space;
  return {firing:firing&&(this.mode!=='lightgun'||(point.inside&&(!reloadMode||pedal))),pedal,point};
 }
}
