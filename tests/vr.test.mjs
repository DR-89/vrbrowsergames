import test from 'node:test';
import assert from 'node:assert/strict';
import {VRAvailability,vrErrorMessage} from '../dist/vr.js';

test('a negative preflight does not prevent a later user-activated session request',async()=>{
 const vr=new VRAvailability({secure:true,xr:{isSessionSupported:async()=>false,requestSession(){}}});
 await vr.refresh();assert.equal(vr.state,'unavailable');assert.equal(vr.canRequest,true);
});
test('headset connection, tab focus and foreground changes recheck support',async()=>{
 const xr=new EventTarget(),win=new EventTarget(),doc=new EventTarget();let supported=false,checks=0;
 xr.isSessionSupported=async()=>{checks++;return supported;};xr.requestSession=()=>{};
 const vr=new VRAvailability({secure:true,xr});const stop=vr.watch(win,doc);
 await Promise.resolve();assert.equal(vr.state,'unavailable');supported=true;
 xr.dispatchEvent(new Event('devicechange'));await Promise.resolve();assert.equal(vr.state,'available');
 supported=false;win.dispatchEvent(new Event('focus'));await Promise.resolve();assert.equal(vr.state,'unavailable');
 supported=true;doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();assert.equal(vr.state,'unavailable');
 doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();assert.equal(vr.state,'available');
 stop();const count=checks;win.dispatchEvent(new Event('focus'));xr.dispatchEvent(new Event('devicechange'));assert.equal(checks,count);
});
test('late detection results cannot overwrite a newer device check',async()=>{
 const answers=[];const vr=new VRAvailability({secure:true,xr:{isSessionSupported:()=>new Promise(resolve=>answers.push(resolve)),requestSession(){}}});
 const old=vr.refresh(),fresh=vr.refresh();answers[1](true);await fresh;answers[0](false);await old;assert.equal(vr.state,'available');
});
test('missing API, insecure context and blocked policy prevent a request',async()=>{
 for(const [config,state]of [[{secure:false},'insecure'],[{secure:true},'no-api'],[{secure:true,allowed:false},'blocked']]){
  const vr=new VRAvailability(config);await vr.refresh();assert.equal(vr.state,state);assert.equal(vr.canRequest,false);
 }
});
test('detection errors are visible and can recover',async()=>{
 let fail=true;const vr=new VRAvailability({secure:true,xr:{requestSession(){},isSessionSupported:async()=>{if(fail)throw new DOMException('Runtime unavailable','NotSupportedError');return true;}}});
 await vr.refresh();assert.equal(vr.state,'error');assert.match(vr.error,/Runtime unavailable/);assert.equal(vr.canRequest,true);
 fail=false;await vr.refresh();assert.equal(vr.state,'available');assert.equal(vr.error,'');
 assert.match(vrErrorMessage(new DOMException('Rejected','NotAllowedError')),/Allow VR access/);
 assert.match(vrErrorMessage(new Error('Runtime initialization failed')),/OpenXR runtime/);
});
