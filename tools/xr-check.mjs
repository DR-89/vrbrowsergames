// Exercises the real WebXR host and native stereo renderer with synthetic poses.
// This is an API integration test, not a real headset/performance test.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const game=process.argv[2]||'tc1';
const browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true});
const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')errors.push(m.text());});
try{
 await page.addInitScript(()=>{
   const transform=(x,y=1.65,z=0)=>({position:{x,y,z},orientation:{x:0,y:0,z:0,w:1}});
   const sources=['left','right'].map((handedness,i)=>({handedness,targetRayMode:'tracked-pointer',targetRaySpace:{handedness},gamepad:{mapping:'xr-standard',axes:[0,0,0,0],buttons:Array.from({length:6},()=>({pressed:false,value:0})),hapticActuators:[{pulse:()=>Promise.resolve()}]}}));
   class FakeSession extends EventTarget{
     inputSources=sources;visibilityState='visible';active=true;frames=0;
     supportedFrameRates=new Float32Array([72,90,120]);frameRate=72;
     async updateTargetFrameRate(rate){this.frameRate=rate;}
     requestReferenceSpace(){return Promise.resolve(new EventTarget());}
     updateRenderState(state){this.renderState=state;}
     requestAnimationFrame(cb){return requestAnimationFrame(t=>{if(this.active){this.frames++;cb(t,{getViewerPose:()=>({transform:transform(0),views:[-.032,.032].map((x,i)=>({eye:i?'right':'left',transform:transform(x),projectionMatrix:new Float32Array([.75,0,0,0,0,1,0,0,0,0,-1.000004,-1,0,0,-.04000008,0])}))}),getPose:s=>({transform:transform(s.handedness==='left'?-.15:.15,1.45,-.25)})});}});}
     async end(){this.active=false;this.dispatchEvent(new Event('end'));}
   }
   const xr=new EventTarget();xr.supported=false;xr.calls=0;xr.rejectNext=true;
   xr.isSessionSupported=async()=>xr.supported;
   xr.requestSession=()=>{
     xr.calls++;if(!navigator.userActivation.isActive)throw Error('Lost user activation before requestSession');
     if(xr.rejectNext){xr.rejectNext=false;return Promise.reject(new DOMException('Test permission rejection','NotAllowedError'));}
     return new Promise(resolve=>{xr.accept=()=>{window.fakeXR=new FakeSession();resolve(fakeXR);};});
   };
   Object.defineProperty(navigator,'xr',{value:xr});
   WebGL2RenderingContext.prototype.makeXRCompatible=()=>Promise.resolve();
   window.XRWebGLLayer=class{
     constructor(session,gl,options){this.requestedScale=options.framebufferScaleFactor;this.framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,960,720);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);}
     getViewport(view){return {x:view.eye==='left'?0:480,y:0,width:480,height:720};}
   };
 });
 await page.goto((process.env.ARCADE_URL||'http://localhost:8094')+'/?game='+game);
 await page.waitForFunction(()=>window.arcade?.vr.availability==='unavailable');
 await page.evaluate(()=>{navigator.xr.supported=true;navigator.xr.dispatchEvent(new Event('devicechange'));});
 await page.waitForFunction(()=>arcade.vr.availability==='available');
 await page.evaluate(()=>{navigator.xr.supported=false;navigator.xr.dispatchEvent(new Event('devicechange'));});
 await page.locator('#load').click();
 await page.waitForFunction(()=>arcade.loaded||document.querySelector('#status').classList.contains('error'),null,{timeout:90000});
 const loaded=await page.evaluate(()=>({loaded:arcade.loaded,status:document.querySelector('#status').textContent}));if(!loaded.loaded)throw Error(loaded.status);
 await page.waitForFunction(()=>arcade.state[1]>180,null,{timeout:60000});
 await page.locator('#enter-vr').click();
 await page.waitForFunction(()=>!!arcade.vr.error);
 if(!await page.locator('#vr-help').textContent().then(t=>t.includes('Allow VR access')))throw Error('Missing permission recovery help');
 await page.locator('#enter-vr').click();
 const pending=await page.evaluate(()=>{
  document.querySelector('#enter-vr').dispatchEvent(new Event('click'));
  const result={calls:navigator.xr.calls,starting:arcade.vr.starting,disabled:document.querySelector('#enter-vr').disabled};
  navigator.xr.accept();return result;
 });
 if(pending.calls!==2||!pending.starting||!pending.disabled)throw Error('Duplicate or unguarded VR request: '+JSON.stringify(pending));
 await page.waitForFunction(()=>arcade.inVR&&fakeXR.frames>40,null,{timeout:30000});
 const advancingFrom=await page.evaluate(()=>arcade.state[1]);
 await page.waitForFunction(frame=>arcade.state[1]>=frame+10,advancingFrom,{timeout:10000});
 const adaptiveSize=await page.evaluate(()=>arcade.performance.eyeSize);
 const hasTiming=await page.evaluate(()=>!!document.querySelector('#game').getContext('webgl2').getExtension('EXT_disjoint_timer_query_webgl2'));
 await page.locator('#adaptive').uncheck();
 await page.waitForFunction(()=>arcade.performance.eyeSize?.width===480);
 await page.locator('#adaptive').check();
 await page.waitForFunction(shrink=>shrink?arcade.performance.eyeSize?.width<480:arcade.performance.eyeSize?.width===480,hasTiming||game==='tc1');
 if((hasTiming||game==='tc1')&&adaptiveSize.width>=480)throw Error('Automatic resolution did not apply to native eye targets');
 await page.locator('#quality').selectOption('0.65');await page.waitForFunction(()=>arcade.performance.eyeSize?.width<480);
 await page.locator('#quality').selectOption('0.85');
 // All games now share tab/row navigation. Drive the real controller path.
 const controller=async(code,value)=>{await page.evaluate(({code,value})=>{const right=fakeXR.inputSources[1].gamepad;
  if(code==='leftMenu')fakeXR.inputSources[0].gamepad.buttons[3].pressed=value;
  if(code==='tab')right.buttons[1].pressed=value;
  if(code==='x')right.axes[2]=value;if(code==='y')right.axes[3]=value;
 },{code,value});await page.waitForTimeout(180);};
 await controller('leftMenu',true);await controller('leftMenu',false);
 await controller('tab',true);await controller('tab',false);
 // From RESUME: the last player row, then upwards to World size.
 for(let i=0;i<(game==='tc2'?3:2);i++){await controller('y',-1);await controller('y',0);}
 await controller('x',1);await controller('x',0);
 await page.waitForFunction(()=>arcade.settings.scale>100);
 if(game!=='tc2'){
  await controller('tab',true);await controller('tab',false); // GRAPHICS
  await controller('y',1);await controller('y',0); // render size
  await controller('x',1);await controller('x',0); // 85 -> 100%, including XR layer
  await page.waitForFunction(()=>arcade.settings.quality===1&&fakeXR.renderState.baseLayer.requestedScale===1);
  await controller('y',1);await controller('y',0); // display rate
  await controller('x',-1);await controller('x',0); // 120 -> 90
  await page.waitForFunction(()=>arcade.settings.refresh===90&&fakeXR.frameRate===90);
  await controller('x',1);await controller('x',0); // restore 120
 }

 const inside=await page.evaluate(()=>({frames:fakeXR.frames,scale:arcade.settings.scale,frameRate:fakeXR.frameRate,render:arcade.performance,glError:document.querySelector('#game').getContext('webgl2').getError(),state:arcade.state,status:document.querySelector('#status').textContent}));
 const pausedAt=await page.evaluate(()=>arcade.state[1]);await page.waitForTimeout(200);
 const pausedFrame=await page.evaluate(()=>arcade.state[1]);if(pausedFrame!==pausedAt)throw Error('Paused game clock still advancing');
 await page.evaluate(()=>fakeXR.end());await page.waitForFunction(()=>!arcade.inVR);const resumed=await page.locator('#pause').textContent();
 const result={game,syntheticPoses:true,lateConnection:true,negativePreflightRetry:true,permissionRecovery:true,resolutionResize:true,pendingGuard:pending,inside,afterEnd:resumed,errors};await writeFile(new URL('../build/qa/'+game+'-xr.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(inside.glError||inside.scale<=100||inside.frameRate!==120||!inside.render.eyeSize||!resumed.startsWith('Resume')||errors.some(e=>/INVALID_|RuntimeError|Aborted/.test(e)))process.exitCode=1;
}catch(error){console.error(JSON.stringify({error:error.message,errors,diagnostics:await page.evaluate(()=>({vr:arcade.vr,state:arcade.state,status:document.querySelector('#status').textContent,log:document.querySelector('#diagnostics').textContent})).catch(()=>null)}));throw error;}
finally{await page.evaluate(()=>window.arcade?.module?.PThread.terminateAllThreads()).catch(()=>{});await browser.close();}
