import {initI18n,setText,appendText,message,setTranslatedAttribute} from './i18n.js';
await initI18n(document);
import {viewMatrix,perspective,originFrom,relative} from './math.js';
import {TriggerLatch,PhysicalCover,ScreenGunInput,screenPoint} from './input.js';
import {VRAvailability,vrErrorMessage} from './vr.js';
import {RenderBudget,renderSize,renderDefaults,requestFrameRate,GPUTimer} from './performance.js';
import {OnlineClient} from './online.js';
import {CoreScheduler} from './core-scheduler.js';
const trigger=new TriggerLatch();
const cover=new PhysicalCover();
const desktop=new ScreenGunInput();
const $=id=>document.getElementById(id);
const games={tc1:{title:'Time Crisis',kicker:'EVERY SECOND COUNTS.',copy:'Richard Miller. One mission against the clock. Take cover and make every shot count.',poster:'assets/tc1-gameplay.png',save:'tc_eeprom.nv'},tc2:{title:'Time Crisis II',kicker:'TWO PERSPECTIVES. ONE MISSION.',copy:'Keith Martin or Robert Baxter. Take cover, reload and return fire.',poster:'assets/tc2-banner.png',save:'tc2_backup.nv'},cz:{title:'Crisis Zone',kicker:'TAKE COVER. TAKE CONTROL.',copy:'Automatic fire, destructible environments and the original arcade campaign.',poster:'assets/cz-banner.png',save:'crszone_backup.nv'}};
const id=new URL(location).searchParams.get('game')||'tc2',selected=games[id]?id:'tc2',game=games[selected];
document.title=game.title+' — VR Browser Games';setText($('game-title'),game.title);setText($('game-kicker'),game.kicker);setText($('game-copy'),game.copy);$('poster').src=game.poster;setTranslatedAttribute($('poster'),'alt',message('{game} VR artwork',{game:game.title}));$('notices').href=`games/${selected}/NOTICE.md`;
document.querySelector(`[data-game="${selected}"]`).setAttribute('aria-current','page');$('player-setting').hidden=selected!=='tc2';if(selected==='tc1')$('tracer-option').remove();
const storageKey='tc-webxr:'+selected;
function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
const defaults={scale:100,distance:selected==='tc1'?40:0,pitch:-16,up:0,back:0,aim:selected==='tc1'?1:2,hand:'right',...renderDefaults(navigator.userAgent,selected),player:1,filter:true,crouch:0,skipStartup:false,gameVolume:100};
const settings={...defaults,...readJSON(storageKey+':settings',{})};
// Explicit preset links also work for returning players with saved settings.
const presetURL=new URL(location);
if(presetURL.searchParams.get('vr')==='native72'&&selected!=='tc1'){
 Object.assign(settings,{quality:1,refresh:72,adaptive:false});
 presetURL.searchParams.delete('vr');history.replaceState(history.state,'',presetURL);
}
const fields=Object.keys(defaults),units={scale:'%',distance:' cm',pitch:'°',up:' mm',back:' mm'};
let M,gl,state,matPtr,session,space,layer,origin,needsRecenter=true,loaded=false,loading=false,paused=false,hidden=false,coreStarted=false,flatRaf=0,vrStarting=false;
let audio,audioNode,nextTick=0,lastRateTime=0,lastFrame=0,drawCount=0,coinTicks=0;
let activeHand=settings.hand,buttons=new Map(),lastSave=0,saveWanted=false,backupPending=false,logs=[],xrFailure='',xrFrames=0;
const canvas=$('game'),keys=new Set();
const startKeys=['Enter','Digit1','Numpad1'];
const renderBudget=new RenderBudget();
let gpuTimer=null,gpuMs=null,cpuMs=0,rendererName='',layerQuality=1,eyeSize=null;
let audioPaused=null;
let online=null,menuHeld=false,menuSerial=0,lastOnlinePaint=0,talkHeld=false,skippingStartup=false;
let xrSimulationInput={firing:false,pedal:false};
let xrHasPose=false;
const coreScheduler=new CoreScheduler({
 step:time=>{if(xrHasPose||online?.state.linked)simulation(time,xrSimulationInput);else nextTick=0;},due:()=>nextTick,
 ready:()=>!!Atomics.load(state,0),
 waitReady:()=>typeof Atomics.waitAsync==='function'?Atomics.waitAsync(state,0,0,50):null,
 active:()=>!!session&&((xrHasPose&&!(hidden||paused))||!!online?.state.linked),
 onError:error=>{fail(error);session?.end().catch(()=>{});}
});
for(const key of ['online-panel','skip-setting'])$(key).hidden=selected!=='tc2';
function log(message){logs.push(String(message));if(logs.length>40)logs.shift();$('diagnostics').textContent=logs.join('\n');}
function status(message,error=false){setText($('status'),message);$('status').classList.toggle('error',error);}
function updateSettings(){const oldRefresh=settings.refresh;for(const key of fields){const field=$(key);if(field.type==='checkbox')settings[key]=field.checked;else if(key==='hand')settings[key]=field.value;else settings[key]=Number(field.value);if(units[key])setText($(key+'-value'),settings[key]+units[key]);}try{localStorage.setItem(storageKey+':settings',JSON.stringify(settings));M?._web_menu_saved?.(1);}catch{M?._web_menu_saved?.(0);}if(M&&loaded)M._web_settings(settings.scale/100,settings.distance/100,settings.pitch,settings.up/1000,settings.back/1000,settings.aim,Number(settings.filter));if(session&&settings.quality>layerQuality){layerQuality=settings.quality;layer=new XRWebGLLayer(session,gl,{alpha:false,antialias:false,depth:true,framebufferScaleFactor:layerQuality});session.updateRenderState({baseLayer:layer});}if(session&&oldRefresh!==settings.refresh)void setRefresh(session);}
function extraSettings(){M?._web_extra_settings?.(settings.hand==='right'?1:0,settings.player,settings.crouch,Number(settings.skipStartup),settings.gameVolume);M?._web_render_settings?.([.65,.85,1].indexOf(settings.quality),[72,90,120].indexOf(settings.refresh),Number(settings.adaptive));}
for(const key of fields){const field=$(key);if(field.type==='checkbox')field.checked=!!settings[key];else field.value=String(settings[key]);field.addEventListener('input',updateSettings);}updateSettings();
function updateAudioPause(){const value=(paused||hidden)&&!online?.state.linked;if(audioNode&&audioPaused!==value){audioPaused=value;audioNode.port.postMessage({paused:value});}}
function setPause(value){paused=!!value;$('screen').classList.toggle('menu-open',paused);keys.clear();desktop.reset();trigger.reset();nextTick=0;if(M)M._web_pause(paused);updateAudioPause();setText($('pause'),paused?'Resume · Esc':'Pause · Esc');setText($('screen-label'),paused?'PAUSED · ESC / LEFT STICK CLICK TO RESUME':'LIVE ARCADE');saveWanted=true;coreScheduler.wake();}
function credit(){coinTicks=48;}
function recenter(){needsRecenter=true;}
$('coin').onclick=credit;$('pause').onclick=()=>setPause(!paused);$('recenter').onclick=recenter;
$('volume').oninput=()=>audioNode?.port.postMessage({volume:Number($('volume').value)/100});
function down(source,index){return !!source?.gamepad?.buttons[index]?.pressed;}
function edge(source,index){const key=source.handedness+':'+index;const value=down(source,index),old=buttons.get(key);buttons.set(key,value);return value&&old===false;}
function menuInput(x,y,pointer,held,sx=0,sy=0,select=false,back=false,tab=0,nx=0,ny=0){
 if(!M?._web_menu_input)return;M._web_menu_input(x,y,pointer,Number(held&&!menuHeld),Number(!held&&menuHeld),Number(held),sx,sy,Number(select),Number(back),tab,nx,ny);menuHeld=held;
}
function setTalk(value){if(online&&talkHeld!==!!value){talkHeld=!!value;online.command(12,Number(talkHeld));}}
function syncMenu(info){
 const menuPaused=info?info.paused:!!M._web_menu_paused();
 if(menuPaused!==paused)setPause(menuPaused);
 const v=new Int32Array(M.HEAPU8.buffer,M._web_menu_values(),online?20:18);
 if(online){$('online-voice').value=!v[18]?'off':v[16]?'ptt':'open';$('online-credit').checked=!!v[17];$('online-volume').value=v[19];}
 if(v[0]!==menuSerial){
  menuSerial=v[0];const changes={hand:v[2]?'right':'left',aim:(selected==='tc1'?[1,0]:[1,2,0])[v[3]],pitch:v[4],up:v[5],back:v[6],player:v[7]+1,crouch:v[8],scale:v[9],distance:v[10],filter:!v[12],gameVolume:v[13],skipStartup:!!v[15]};
  if(!online){delete changes.player;delete changes.skipStartup;Object.assign(changes,{quality:[.65,.85,1][v[11]],refresh:[72,90,120][v[16]],adaptive:!!v[17]});}
  for(const[k,value]of Object.entries(changes)){const field=$(k);if(field.type==='checkbox')field.checked=!!value;else field.value=value;}updateSettings();extraSettings();activeHand=settings.hand;
 }
 if(v[1]){const action=v[1];M._web_menu_event_done();if(action===1)recenter();if(action===2){persist();online?.transport.pump();setTimeout(()=>location.reload(),100);}}
}
function paintOnline(info){
 const labels=['Offline','Joining…','Room open','Hosting','Linked','Reconnecting…'];
 setText($('online-status'),message('{status} · P{player}{partner}{ping}',{status:message(labels[info.state]||'Offline'),player:info.side||settings.player,partner:info.partner?' · '+info.partner:'',ping:info.ping>=0?' · '+info.ping+' ms':''}));
 setText($('online-toast'),info.toast||'');setText($('room-code'),info.code&&!info.opening?'ROOM '+info.code:'');
 const busy=info.state!==0;
 for(const key of ['online-host','online-join','online-quick'])$(key).disabled=busy;
 $('online-leave').disabled=!busy;$('online-rejoin').disabled=busy||!info.canRejoin;setText($('online-mute'),info.muted?'Unmute voice':'Mute voice');
 const data=JSON.stringify([busy,info.rooms||[]]),list=$('online-rooms');
 if(list.dataset.rooms!==data){list.dataset.rooms=data;list.replaceChildren();(info.rooms||[]).forEach((room,index)=>{const button=document.createElement('button');setText(button,message('{name} · {players}/2 · {status}',{name:room.name,players:room.players,status:message(['Join','Playing','Full','Other version'][room.status])}));button.disabled=room.status!==0||busy;button.onclick=()=>online.command(5,index);list.append(button);});}
 if(online.transport.drops)appendText($('online-status'),` · transport drops ${online.transport.drops}`);
}
const command=(action,value=0,text='')=>online?.command(action,value,text);
$('online-host').onclick=()=>command(1);$('online-join').onclick=()=>{const code=$('online-code').value.trim().toUpperCase();if(!/^[ACDEFGHJKLMNPQRTUVWXY34679]{4}$/.test(code)){setText($('online-toast'),'Enter a valid four-character room code.');return;}command(2,0,code);};
$('online-browse').onclick=()=>command(4,1);$('online-quick').onclick=()=>command(6);$('online-leave').onclick=()=>{command(3);online?.stopMicrophone();setText($('online-mic'),'Enable microphone');setText($('mic-status'),'Microphone off.');};$('online-rejoin').onclick=()=>command(7);
$('online-name').onchange=()=>{const name=$('online-name').value.replace(/[^a-zA-Z0-9_ -]/g,'').slice(0,12)||'PLAYER';$('online-name').value=name;command(8,0,name);try{localStorage.setItem(storageKey+':name',name);}catch{}};
$('online-credit').onchange=()=>command(14,Number($('online-credit').checked));
$('online-volume').oninput=()=>command(13,Number($('online-volume').value));
$('online-mute').onclick=()=>command(10);
$('online-voice').onchange=()=>{command(9,Number($('online-voice').value!=='off'));command(11,Number($('online-voice').value==='ptt'));if($('online-voice').value==='off'){online?.stopMicrophone();setText($('online-mic'),'Enable microphone');setText($('mic-status'),'Microphone off.');}};
$('online-mic').onclick=async()=>{if(!online)return;try{const on=await online.microphone();setText($('online-mic'),on?'Stop microphone':'Enable microphone');setText($('mic-status'),on?'Microphone enabled. Transmits only while linked and voice is on.':'Microphone off.');}catch(e){setText($('mic-status'),'Microphone unavailable: '+e.message);command(15,0);}};
function sampleControllers(frame,pose,time){
 if(needsRecenter||!origin){origin=originFrom(pose);cover.calibrate(pose.transform.position.y);needsRecenter=false;}
 const head=relative(pose.transform,origin);M._web_head(...head.p,...head.q);
 const sources=[...session.inputSources].filter(s=>s.targetRayMode==='tracked-pointer');
 let handoff=false;
 for(const s of sources){if(edge(s,0)&&s.handedness!==activeHand){activeHand=s.handedness;handoff=true;}}
 const preferred=sources.find(s=>s.handedness===settings.hand),opposite=sources.find(s=>s.handedness!==settings.hand),left=sources.find(s=>s.handedness==='left'),right=sources.find(s=>s.handedness==='right');
 const select=preferred&&edge(preferred,4),back=preferred&&edge(preferred,5),other=opposite&&edge(opposite,4);
 const leftClick=left&&(edge(left,3)||edge(left,2)),rightClick=right&&(edge(right,3)||edge(right,2));
 const ptt=online&&$('online-voice').value==='ptt';
 if(!paused){if(select)credit();if(back){settings.aim=(settings.aim+1)%(selected==='tc1'?2:3);$('aim').value=settings.aim;updateSettings();}if(other)recenter();}
 if(leftClick&&!ptt)setPause(!paused);
 if(opposite&&edge(opposite,5))setPause(!paused);
 if(rightClick&&!ptt)credit();
 const source=sources.find(s=>s.handedness===activeHand)||preferred||sources[0];const aim=source&&frame.getPose(source.targetRaySpace,space);
 const firing=!!(source&&down(source,0));const pedal=settings.crouch?cover.pedal(pose.transform.position.y):sources.some(s=>down(s,1));
 let ray=[0,0,0,0,0,0,1,0,0];
 if(aim){const p=relative(aim.transform,origin);ray=[...p.p,...p.q,1,firing];}
 M._web_aim(...ray);
 {const axes=right?.gamepad?.axes||left?.gamepad?.axes||[];menuInput(0,0,-1,firing,axes.at(-2)||0,-(axes.at(-1)||0),select,back,(right&&edge(right,1)?1:0)-(left&&edge(left,1)?1:0));setTalk(ptt&&sources.some(s=>down(s,3)||down(s,2)));}
 trigger.observe(firing,handoff);
 return {firing,pedal,source,ray};
}
function simulation(time,input){
 if(!M||!coreStarted)return;
 if(Atomics.load(state,3))throw Error('The game core stopped. Reload the page to restart.');
 if(Atomics.load(state,0)){online?.beforePrepare();extraSettings();}
 const ready=M._web_prepare(time);
 if(!online&&ready)syncMenu();
 if(online&&ready){const info=online.afterPrepare();syncMenu(info);updateAudioPause();if(skippingStartup){skippingStartup=false;status(info.startupLeft<=0?'Cabinet ready. Add credits and press the trigger.':'Startup skip stopped.');}if(time-lastOnlinePaint>200){paintOnline(info);lastOnlinePaint=time;}}
 if(ready&&(saveWanted||time-lastSave>15000)){persist();saveWanted=false;lastSave=time;}
 if((hidden||paused)&&!online?.state.linked){nextTick=0;return;}
 if(hidden||paused)input={firing:false,pedal:false};
 if(!nextTick)nextTick=time;
 if(ready&&time>=nextTick){
  if(session&&input.ray)M._web_aim(...input.ray);
  let bits=0,f;
  if(!session){
   const sample=desktop.sample(startKeys.some(key=>keys.has(key)),keys.has('Space'));
   if(!hidden&&!paused){input=sample;M._web_mouse(sample.point.x,sample.point.y,Number(sample.point.inside));}
   f=sample.firing&&!hidden&&!paused;
  }else f=trigger.tick(input.firing);
  if(f&&online&&settings.skipStartup&&M._web_skip_startup()){f=false;skippingStartup=true;status('Skipping the cabinet startup…');}if(f)bits|=0x10;if(input.pedal)bits|=0x20;if(coinTicks&&!paused&&!hidden){if(coinTicks%12>5)bits|=1;coinTicks--;}M._web_advance(bits);nextTick+=1000/(25600000/(814*525));if(nextTick<time-50)nextTick=time+1000/(25600000/(814*525));
 }
 if(time-lastRateTime>1000){const f=Atomics.load(state,1),elapsed=(time-lastRateTime)/1000;setText($('performance'),message('Game {gameFps} fps · {view} {viewFps} fps',{gameFps:((f-lastFrame)/elapsed).toFixed(1),view:message(session?'VR':'View'),viewFps:(drawCount/elapsed).toFixed(0)}));if(session)setText($('render-performance'),message('Stereo CPU {cpu} ms · GPU {gpu} · {eyes} · {rate}',{cpu:cpuMs.toFixed(1),gpu:gpuMs===null?message('unavailable'):gpuMs.toFixed(1)+' ms',eyes:eyeSize?message('{width} × {height} per eye',{width:eyeSize.width,height:eyeSize.height}):'',rate:message(session.frameRate?'{rate} Hz display':'{rate} Hz target',{rate:session.frameRate||settings.refresh})}));lastFrame=f;drawCount=0;lastRateTime=time;}
}
function renderEye(view,projection,width,height,index,target,viewport,time){
 M.HEAPF32.set(view,matPtr/4);M.HEAPF32.set(projection,matPtr/4+16);
 const fbo=M._web_eye(index,width,height,time);if(!fbo)return;
 gl.disable(gl.SCISSOR_TEST);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,M.GL.framebuffers[fbo]);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,target);
 gl.blitFramebuffer(0,0,width,height,viewport.x,viewport.y,viewport.x+viewport.width,viewport.y+viewport.height,gl.COLOR_BUFFER_BIT,width===viewport.width&&height===viewport.height?gl.NEAREST:gl.LINEAR);
 gl.bindFramebuffer(gl.FRAMEBUFFER,target);
}
function flatFrame(time){
 if(session)return;
 try{if(loaded){const mouse=desktop.point;M._web_mouse(mouse.x,mouse.y,Number(mouse.inside));menuInput(mouse.x*1120,mouse.y*728,Number(mouse.inside),desktop.primary);setTalk(keys.has('KeyV'));simulation(time,{firing:false,pedal:false});const w=960,h=720;renderEye(viewMatrix([0,0,0],[0,0,0,1]),perspective(2*Math.atan(.48),4/3),w,h,0,null,{x:0,y:0,width:w,height:h},time);drawCount++;}}catch(e){fail(e);return;}flatRaf=requestAnimationFrame(flatFrame);
}
function xrFrame(time,frame){
 if(!session)return;
 xrFrames++;
 session.requestAnimationFrame(xrFrame);
 try{const pose=frame.getViewerPose(space);if(!pose||hidden){nextTick=0;xrHasPose=false;xrSimulationInput={firing:false,pedal:false};trigger.reset();M._web_aim(0,0,0,0,0,0,1,0,0);return;}
 const restoredPose=!xrHasPose;xrHasPose=true;if(restoredPose)coreScheduler.wake();
 const measured=gpuTimer?.poll();if(measured!=null){gpuMs=measured;if(settings.adaptive)renderBudget.observe(measured,time,session.frameRate||settings.refresh);}
 const started=performance.now();gpuTimer?.begin();
 const input=sampleControllers(frame,pose,time);xrSimulationInput=input;
 {
  // Paused menus still consume pointer/buttons at headset refresh. The
  // stopped game clock cannot advance here; resume uses the same timer clock.
  if(paused&&!online?.state.linked)simulation(performance.now(),input);
  coreScheduler.start();
 }
 for(const [i,view] of pose.views.entries()){const vp=layer.getViewport(view),p=relative(view.transform,origin);eyeSize=renderSize(vp.width,vp.height,Math.min(1,settings.quality/layerQuality)*(settings.adaptive?renderBudget.scale:1));renderEye(viewMatrix(p.p,p.q),view.projectionMatrix,eyeSize.width,eyeSize.height,i,layer.framebuffer,vp,time);}drawCount++;
 gpuTimer?.end();cpuMs=cpuMs*.9+(performance.now()-started)*.1;
 const shots=Atomics.load(state,2);if(shots!==xrFrame.shots){xrFrame.shots=shots;input.source?.gamepad?.hapticActuators?.[0]?.pulse(.65,40).catch(()=>{});}
 }catch(e){gpuTimer?.end();fail(e);session?.end().catch(()=>{});}
}
async function setRefresh(next){
 try{const rate=await requestFrameRate(next,settings.refresh);log(rate?`VR display requested: ${rate} Hz`:`VR refresh is controlled by the PC runtime; select ${settings.refresh} Hz in Virtual Desktop / SteamVR.`);}catch(e){log('VR refresh request: '+e.message);}
}
function fail(error){log(error.stack||error);status(error.message||String(error),true);$('loading').hidden=true;$('load').disabled=false;setText($('load'),loaded?'Reload page':'Retry');$('load').onclick=()=>location.reload();}
const vr=new VRAvailability({xr:navigator.xr,secure:isSecureContext,allowed:(document.permissionsPolicy||document.featurePolicy)?.allowsFeature('xr-spatial-tracking')!==false,onChange:updateVR});
function updateVR(){
 const labels={checking:'CHECKING VR CONNECTION…',available:'IMMERSIVE VR AVAILABLE',unavailable:'HEADSET NOT DETECTED YET',insecure:'VR REQUIRES HTTPS OR LOCALHOST','no-api':'WEBXR UNAVAILABLE IN THIS BROWSER',blocked:'VR ACCESS BLOCKED',error:'VR CONNECTION CHECK FAILED'};
 setText($('capability'),session?'VR SESSION CONNECTED':labels[vr.state]);
 $('enter-vr').disabled=!loaded||!vr.canRequest||vrStarting||!!session;
 setText($('enter-vr'),vrStarting?'Starting VR…':session?'In VR':'Enter VR');
 setTranslatedAttribute($('enter-vr'),'title',!loaded?'Load the selected game first.':'');
 $('check-vr').disabled=vrStarting||!!session;
 const help={
  checking:'Checking for a connected headset. You can retry VR after the game loads.',
  available:loaded?'Ready. Click Enter VR and accept any request in your browser or headset.':'Headset detected. First click Load game, then Enter VR.',
  unavailable:'Connect your headset, then click Check headset or try Enter VR after loading. For Virtual Desktop, open this address in a PC browser and connect to its active OpenXR runtime.',
  insecure:'Use http://localhost:8094 on the PC running the server, or HTTPS for other devices. A plain HTTP LAN address cannot start VR.',
  'no-api':'Open this address in a full WebXR-capable browser, such as Chrome or Edge on the PC, or the Quest browser. An embedded preview may not provide VR access.',
  blocked:'Open this page directly in a browser tab. This page is not allowed to access spatial tracking.',
  error:vr.error+' — Check the headset connection and try again.'
 };
 if(!vrStarting)setText($('vr-help'),xrFailure||(session?'VR connected. Use your headset and tracked controllers.':help[vr.state]));
 $('vr-help').classList.toggle('error',!!xrFailure);
}
$('check-vr').onclick=()=>{xrFailure='';void vr.refresh();};
async function startVR(){
 if(!loaded||session||vrStarting||!vr.canRequest)return;
 vrStarting=true;xrFailure='';updateVR();
 setText($('vr-help'),'Starting VR. Accept any request in your browser or headset.');
 log('VR: requesting immersive session');
 const slow=setTimeout(()=>{if(vrStarting)setText($('vr-help'),'Still waiting for the browser / VR runtime. Check the permission prompt and headset connection. The request is still active.');},12000);
 let next;
 try{
 // No awaited detection, loading or audio work before this user-activated call.
 next=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});session=next;cancelAnimationFrame(flatRaf);xrFrames=0;
 log('VR: session accepted; preparing graphics');
 next.addEventListener('end',()=>{if(session!==next)return;coreScheduler.stop();xrSimulationInput={firing:false,pedal:false};gpuTimer?.dispose();gpuTimer=null;session=null;space=layer=null;origin=null;buttons.clear();M._web_view_mode(0);M._web_aim(0,0,0,0,0,0,1,0,0);document.body.classList.remove('in-vr');hidden=document.hidden;setPause(true);setText($('render-performance'),'');flatRaf=requestAnimationFrame(flatFrame);updateVR();void vr.refresh();log('VR: session ended');});
 await gl.makeXRCompatible();layerQuality=settings.quality;layer=new XRWebGLLayer(next,gl,{alpha:false,antialias:false,depth:true,framebufferScaleFactor:layerQuality});next.updateRenderState({baseLayer:layer,depthNear:.02,depthFar:10000});
 renderBudget.reset();gpuMs=null;cpuMs=0;gpuTimer=new GPUTimer(gl);
 // Without GPU queries, adaptation cannot make a measured decision. Do not
 // leave Quest at the budget's 80% starting scale indefinitely.
 if(!gpuTimer.ext&&selected!=='tc1')renderBudget.scale=1;
 void setRefresh(next);
 try{space=await next.requestReferenceSpace('local-floor');}catch{space=await next.requestReferenceSpace('local');}
 if(session!==next)throw Error('VR session ended during setup. Try Enter VR again.');
 space.addEventListener('reset',recenter);next.addEventListener('visibilitychange',()=>{hidden=next.visibilityState!=='visible';nextTick=0;trigger.reset();xrSimulationInput={firing:false,pedal:false};updateAudioPause();coreScheduler.wake();});
 M._web_view_mode(1);origin=null;needsRecenter=true;hidden=next.visibilityState==='hidden';buttons.clear();setPause(false);audio?.resume().catch(e=>log('Audio: '+e.message));document.body.classList.add('in-vr');next.requestAnimationFrame(xrFrame);log('VR: stereo frame loop started');
 }catch(e){if(next&&session===next)await next.end().catch(()=>{});xrFailure=vrErrorMessage(e);log('VR: '+xrFailure);}
 finally{clearTimeout(slow);vrStarting=false;updateVR();}
}
$('enter-vr').onclick=startVR;
function script(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>reject(Error('Could not load the game module.'));document.head.append(s);});}
async function bytes(url,compressed=false){const response=await fetch(url);if(!response.ok)throw Error(`Download failed (${response.status}): ${url}`);if(compressed){if(!globalThis.DecompressionStream)throw Error('This browser cannot decompress the game files. Update your browser.');return new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}return new Uint8Array(await response.arrayBuffer());}
async function load(){
 if(loading||loaded)return;loading=true;$('load').disabled=true;$('loading').hidden=false;$('player').disabled=true;
 try{
 if(!crossOriginIsolated||!globalThis.SharedArrayBuffer)throw Error('Shared memory is unavailable. This page needs cross-origin isolation; reload after the hosting headers are enabled.');
 audio=new AudioContext({latencyHint:'interactive'});await audio.resume();await audio.audioWorklet.addModule('audio-worklet.js');
 const base=`games/${selected}/`;const response=await fetch(base+'manifest.json');if(!response.ok)throw Error('This game build is not available on the server yet.');const manifest=await response.json();
 setText($('loading-label'),'Starting the browser game engine…');await script(base+'arcade.js');
 const wasmModule=await WebAssembly.compile(await bytes(base+'arcade.wasm.gz',true));
 let rejectWasm;const instantiationFailure=new Promise((_,reject)=>{rejectWasm=reject;});
 const coreModule=globalThis.createArcade({canvas,instantiateWasm(imports,receive){WebAssembly.instantiate(wasmModule,imports).then(instance=>receive(instance,wasmModule),rejectWasm);return {};},noInitialRun:true,locateFile:file=>base+file,print:log,printErr:log,onAbort:reason=>fail(Error('Game engine: '+reason))});
 M=await Promise.race([coreModule,instantiationFailure]);
 // Choose the VR-capable adapter before the native renderer uploads its assets.
 gl=canvas.getContext('webgl2',{alpha:false,depth:true,stencil:false,antialias:false,powerPreference:'high-performance',xrCompatible:!!navigator.xr});
 if(!gl||!M._web_context())throw Error('WebGL 2 could not start on this device.');
 if(vr.canRequest&&gl.makeXRCompatible){try{await gl.makeXRCompatible();}catch(e){log('VR graphics preparation: '+e.message);}}
 const debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');rendererName=debugRenderer?gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);setText($('graphics-device'),'Graphics: '+rendererName);log('Graphics: '+rendererName);
 if(gl.getParameter(gl.MAX_TEXTURE_SIZE)<8192&&selected!=='tc1')throw Error('This graphics device needs support for 8192-pixel textures.');
 M.FS.mkdir('/extracted');M.FS.mkdir('/models');
 const files=[...manifest.roms.map(f=>({...f,path:'/extracted/'+f.name,gzip:true})),...manifest.models.map(f=>({...f,path:'/models/'+f.name}))];
 let completed=0;const total=files.reduce((n,f)=>n+f.size,0);
 for(const f of files){setText($('loading-label'),`Loading ${game.title} · ${Math.round(completed/total*100)}%`);const data=await bytes(base+f.url,f.gzip);if(data.length!==f.size)throw Error('Incorrect file size: '+f.name);if(f.sha256){const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==f.sha256)throw Error('Game file integrity check failed: '+f.name);}M.FS.writeFile(f.path,data);completed+=f.size;$('progress').value=completed/total;}
 const save=readJSON(storageKey+':save',null);if(save?.files)restoreFiles(save);
 if(selected==='tc2'){
  const config=localStorage.getItem(storageKey+':onlineConfig');if(config&&config.length<2048)M.FS.writeFile('/online.cfg',config);
  // Browsers supply echo-cancelled/noise-suppressed microphone PCM through AudioWorklet.
  M.ENV.TC2_VOICE_DSP='0';online=new OnlineClient(M,message=>{setText($('online-status'),message);log('Online: '+message);});
  $('online-name').value=localStorage.getItem(storageKey+':name')||'PLAYER';command(8,0,$('online-name').value);command(15,0);command(18,settings.player);
 }
 state=new Int32Array(M.HEAPU8.buffer,M._web_status(),8);matPtr=M._web_matrices();
 audioNode=new AudioWorkletNode(audio,'arcade-audio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{memory:M.HEAPU8.buffer,audio:M._web_audio(),status:M._web_status(),bufferMs:selected==='cz'?60:35,stretch:selected==='cz'}});audioNode.connect(audio.destination);audioNode.port.postMessage({volume:Number($('volume').value)/100});
 if(!M._web_start(settings.player))throw Error('Could not start the game worker.');coreStarted=true;
 {
  // Native GL initialization is proxied from the worker to this thread.
  // Finish it before enabling Enter VR and creating an opaque XR target.
  const deadline=performance.now()+30000;
  while(!Atomics.load(state,0)){
   if(Atomics.load(state,3))throw Error('The game core stopped. Reload the page to restart.');
   if(performance.now()>deadline)throw Error('Game engine initialization timed out. Reload the page to retry.');
   await new Promise(resolve=>setTimeout(resolve,10));
  }
 }
 loaded=true;M._web_view_mode(0);updateSettings();
 extraSettings();if(online)$('online-controls').disabled=false;
 $('loading').hidden=true;document.querySelector('.screen').classList.add('playing');$('playbar').hidden=false;$('fullscreen').disabled=!document.fullscreenEnabled;setText($('load'),'Game loaded');$('load').disabled=true;$('backup').disabled=false;$('restore').disabled=false;$('restore-button').disabled=false;updateVR();status('Game engine loaded. Wait for the cabinet to finish booting, then add credits and press the trigger.');setText($('screen-label'),'LIVE ARCADE');canvas.focus();lastRateTime=performance.now();flatRaf=requestAnimationFrame(flatFrame);
 }catch(e){fail(e);}finally{loading=false;}
}
$('load').onclick=load;
const screen=$('screen'),screenKey='vrbrowsergames:screen-input';
const screenSettings={mode:'mouse',cover:'reload',button:2,border:0,cursor:true,...readJSON(screenKey,{})};
$('screen-input').value=screenSettings.mode;$('gun-cover').value=screenSettings.cover;$('gun-button').value=screenSettings.button;$('gun-border').value=screenSettings.border;$('gun-cursor').checked=!!screenSettings.cursor;
function screenSettingsChanged(){
 desktop.reset();desktop.mode=$('screen-input').value==='lightgun'?'lightgun':'mouse';desktop.coverMode=$('gun-cover').value==='pedal'?'pedal':'reload';desktop.coverButton=desktop.mode==='lightgun'&&$('gun-button').value==='1'?1:2;
 const lightgun=desktop.mode==='lightgun',border=[1,2,3].includes(Number($('gun-border').value))?Number($('gun-border').value):0;
 screen.classList.toggle('lightgun',lightgun);screen.classList.toggle('hide-pointer',lightgun&&!$('gun-cursor').checked);screen.classList.toggle('has-gun-border',lightgun&&border>0);screen.style.setProperty('--gun-border',border+'vmin');
 for(const name of ['gun-cover','gun-button','gun-border','gun-cursor'])$(name).disabled=!lightgun;
 setText($('screen-input-status'),!lightgun?'Mouse: aim, left click to fire; hold right click or Space to leave cover.':desktop.coverMode==='pedal'?'Lightgun: hold your pedal / side button or Space to leave cover. Release to hide and reload.':'Lightgun: aim at the game to leave cover. Hold reload or Space, or aim outside the game, to hide and reload.');
 if(lightgun&&border)appendText($('screen-input-status'),' White border appears in Fullscreen. Keep the gun’s tracking software running.');
 try{localStorage.setItem(screenKey,JSON.stringify({mode:desktop.mode,cover:desktop.coverMode,button:Number($('gun-button').value),border,cursor:$('gun-cursor').checked}));}catch{}
}
for(const name of ['screen-input','gun-cover','gun-button','gun-border','gun-cursor'])$(name).addEventListener('change',screenSettingsChanged);screenSettingsChanged();
async function fullscreen(){
 if(!loaded||session)return;
 try{if(document.fullscreenElement===screen)await document.exitFullscreen();else await screen.requestFullscreen({navigationUI:'hide'});}catch(e){setText($('screen-input-status'),'Fullscreen unavailable: '+e.message);}
}
$('fullscreen').onclick=fullscreen;
document.addEventListener('fullscreenchange',()=>{desktop.reset();keys.clear();setText($('fullscreen'),document.fullscreenElement===screen?'Exit fullscreen · F':'Fullscreen · F');if(loaded)canvas.focus({preventScroll:true});});
window.addEventListener('resize',()=>desktop.reset());
function aimPointer(e){desktop.move(screenPoint(e.clientX,e.clientY,canvas.getBoundingClientRect(),canvas.width/canvas.height));}
window.addEventListener('pointermove',e=>{if(!loaded||session)return;aimPointer(e);});
screen.addEventListener('pointerleave',()=>{desktop.move({...desktop.point,inside:false});});
screen.addEventListener('contextmenu',e=>e.preventDefault());screen.addEventListener('auxclick',e=>e.preventDefault());
// Mouse button events report chords (pedal + trigger); pointerdown/up only report
// the transition between no buttons and at least one button for mouse devices.
screen.addEventListener('mousedown',e=>{
 if(!loaded||session)return;e.preventDefault();canvas.focus({preventScroll:true});aimPointer(e);desktop.down(e.button);
 if(paused&&e.button===0){const p=desktop.point;menuInput(p.x*1120,p.y*728,Number(p.inside),true);}
});
window.addEventListener('mouseup',e=>{if(!loaded||session)return;aimPointer(e);desktop.up(e.button);if(paused&&e.button===0){const p=desktop.point;menuInput(p.x*1120,p.y*728,Number(p.inside),false);}});
window.addEventListener('pointercancel',()=>desktop.reset());
window.addEventListener('keydown',e=>{if(!loaded||/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName))return;if(['Space',...startKeys,'Escape','Digit5','Numpad5','KeyR','KeyF',...(paused&&M?._web_menu_input?['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Backspace']:[])].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='Escape')setPause(!paused);if(['Digit5','Numpad5'].includes(e.code))credit();if(e.code==='KeyR')recenter();if(e.code==='KeyF')void fullscreen();if(paused&&M?._web_menu_input){const mouse=desktop.point;menuInput(mouse.x*1120,mouse.y*728,0,false,0,0,startKeys.includes(e.code),e.code==='Backspace',e.code==='Tab'?(e.shiftKey?-1:1):0,e.code==='ArrowRight'?1:e.code==='ArrowLeft'?-1:0,e.code==='ArrowUp'?1:e.code==='ArrowDown'?-1:0);}else if(startKeys.includes(e.code)&&!session)desktop.press();});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();desktop.reset();trigger.reset();});
document.addEventListener('visibilitychange',()=>{if(!session){hidden=document.hidden;nextTick=0;updateAudioPause();keys.clear();desktop.reset();trigger.reset();}});
function encode(data){let s='';for(const b of data)s+=String.fromCharCode(b);return btoa(s);}
function restoreFiles(save){if(save.game!==selected||save.version!==1||!save.files||typeof save.files!=='object')throw Error('This is not a save backup for '+game.title);for(const [name,content]of Object.entries(save.files)){if(!/^(tc_eeprom|tc2_backup|crszone_backup)\.nv$/.test(name)||name!==game.save||typeof content!=='string'||content.length>150000)throw Error('Invalid save file.');const data=Uint8Array.from(atob(content),c=>c.charCodeAt(0));M.FS.writeFile('/'+name,data);}}
function persist(){if(!loaded)return;try{M._web_save();if(online){try{localStorage.setItem(storageKey+':onlineConfig',M.FS.readFile('/online.cfg',{encoding:'utf8'}));}catch{}}const files={};try{files[game.save]=encode(M.FS.readFile('/'+game.save));}catch{}if(!files[game.save]){setText($('save-status'),'The cabinet has not created save data yet. Wait for boot to finish.');return;}const save={version:1,game:selected,files,updated:new Date().toISOString()};localStorage.setItem(storageKey+':save',JSON.stringify(save));if(backupPending){const blob=new Blob([JSON.stringify(save,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=selected+'-webxr-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);backupPending=false;setText($('save-status'),'Backup exported.');}}catch(e){setText($('save-status'),'Could not save locally: '+e.message);}}
$('backup').onclick=()=>{setPause(true);backupPending=true;saveWanted=true;setText($('save-status'),'Preparing your backup…');};
$('restore-button').onclick=()=>$('restore').click();
$('restore').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>180000)throw Error('Backup is too large.');const save=JSON.parse(await file.text());if(save.game!==selected||save.version!==1||Object.keys(save.files||{}).length!==1||Object.keys(save.files||{}).some(n=>n!==game.save))throw Error('Wrong game or backup format.');for(const [name,data]of Object.entries(save.files)){if(typeof data!=='string'||data.length>150000)throw Error('Invalid backup.');atob(data);}localStorage.setItem(storageKey+':save',JSON.stringify(save));location.reload();}catch(e){setText($('save-status'),e.message);}};
window.arcade={get module(){return M;},get online(){return online?.state??null;},onlineCommand:command,get loaded(){return loaded;},get state(){return state?[...state]:null;},get settings(){return {...settings};},get inVR(){return !!session;},get vr(){return {availability:vr.state,starting:vrStarting,frames:xrFrames,error:xrFailure};},get performance(){return {renderer:rendererName,cpuMs,gpuMs,eyeSize,renderScale:renderBudget.scale,targetHz:settings.refresh,displayHz:session?.frameRate??null};},pause:setPause,credit};
if(!crossOriginIsolated&&'serviceWorker'in navigator&&isSecureContext){navigator.serviceWorker.register('isolation-worker.js').then(()=>navigator.serviceWorker.ready).then(()=>{if(!sessionStorage.getItem('tc-coi-reload')){sessionStorage.setItem('tc-coi-reload','1');location.reload();}}).catch(log);}
const stopVRWatch=vr.watch(window,document);

window.addEventListener('pagehide',()=>{online?.close();M?.PThread?.terminateAllThreads();audio?.close().catch(()=>{});});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});

// Keep the partner cabinet alive when WebXR pauses callbacks. Browsers may still throttle sleeping tabs.
setInterval(()=>{if(online&&loaded&&(hidden||document.hidden)){try{simulation(performance.now(),{firing:false,pedal:false});}catch(e){fail(e);}}},16);
