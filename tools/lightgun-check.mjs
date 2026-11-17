import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.ARCADE_URL||'http://localhost:8094';
const selectedGames=process.argv.slice(2);
assert.ok(selectedGames.every(game=>['tc1','tc2','cz'].includes(game)),'Expected game IDs: tc1 tc2 cz');
await mkdir('build/qa',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--force-high-performance-gpu','--autoplay-policy=no-user-gesture-required']});
const errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.games img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
 assert.equal(await page.locator('.games a').count(),4);
 assert.equal(await page.locator('.external-game').getAttribute('href'),'https://nfsu2vr.xyz/');
 assert.match(await page.title(),/VR Browser Games/);
 await page.screenshot({path:'build/qa/collection-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'build/qa/collection-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 for(const game of selectedGames.length?selectedGames:['tc1','tc2','cz']){
  await page.goto(base+'/?game='+game);
  await page.locator('#screen-input').selectOption('lightgun');await page.locator('#gun-cover').selectOption('reload');await page.locator('#gun-button').selectOption('2');await page.locator('#gun-border').selectOption('2');
  await page.locator('#load').click();
  await page.waitForFunction(()=>arcade.loaded||document.querySelector('#status').classList.contains('error'),null,{timeout:120000});
  assert.equal(await page.evaluate(()=>arcade.loaded),true,await page.locator('#status').textContent());
  await page.waitForFunction(()=>arcade.state[1]>120,null,{timeout:30000});
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement?.id==='screen');
  const full=await page.evaluate(()=>({width:document.querySelector('#screen').getBoundingClientRect().width,height:document.querySelector('#screen').getBoundingClientRect().height,border:getComputedStyle(document.querySelector('.gun-border')).display,viewport:[innerWidth,innerHeight]}));
  assert.equal(full.width,full.viewport[0]);assert.equal(full.height,full.viewport[1]);assert.equal(full.border,'block');
  // Record inputs at the real WASM submission boundary; the core continues running.
  await page.evaluate(()=>{
   const m=arcade.module,mouse=m._web_mouse,advance=m._web_advance;window.gunQA={aim:null,inputs:[]};
   m._web_mouse=(x,y,inside)=>{gunQA.aim={x,y,inside};return mouse(x,y,inside);};
   m._web_advance=bits=>{gunQA.inputs.push({bits,...gunQA.aim});if(gunQA.inputs.length>300)gunQA.inputs.shift();return advance(bits);};
  });
  const shoot=async(x,y,button=0,moveAfter=false)=>page.evaluate(({x,y,button,moveAfter})=>{
   gunQA.inputs.length=0;const c=document.querySelector('#game'),r=c.getBoundingClientRect(),w=Math.min(r.width,r.height*4/3),h=w*3/4;
   const opts={bubbles:true,clientX:r.left+(r.width-w)/2+x*w,clientY:r.top+(r.height-h)/2+y*h,button,pointerType:'mouse'};
   // No pointermove before the shot, as some absolute HID devices behave this way.
   c.dispatchEvent(new MouseEvent('mousedown',{...opts,buttons:button===0?1:button===2?2:4}));
   c.dispatchEvent(new MouseEvent('mouseup',{...opts,buttons:0}));
   if(moveAfter)c.dispatchEvent(new PointerEvent('pointermove',{...opts,clientX:r.left+r.width*.7,clientY:r.top+r.height*.2,buttons:0}));
  },{x,y,button,moveAfter});
  await shoot(.23,.71,0,true);
  await page.waitForFunction(()=>gunQA.inputs.some(i=>i.bits&16));
  const shot=await page.evaluate(()=>gunQA.inputs.find(i=>i.bits&16));
  assert.ok(Math.abs(shot.x-.23)<.001&&Math.abs(shot.y-.71)<.001,JSON.stringify(shot));assert.equal(shot.inside,1);assert.equal(shot.bits&32,32);
  // A shot in the pillarbox must neither fire nor leave cover.
  await page.evaluate(()=>{gunQA.inputs.length=0;const c=document.querySelector('#game'),r=c.getBoundingClientRect();for(const type of ['mousedown','mouseup'])c.dispatchEvent(new MouseEvent(type,{bubbles:true,clientX:r.left+1,clientY:r.top+r.height/2,button:0,buttons:type==='mousedown'?1:0}));});
  await page.waitForFunction(()=>gunQA.inputs.length>=5);assert.equal(await page.evaluate(()=>gunQA.inputs.some(i=>i.bits&48)),false);
  await page.mouse.move(full.width/2,full.height/2);await page.mouse.down({button:'right'});
  await page.evaluate(()=>gunQA.inputs.length=0);await page.waitForFunction(()=>gunQA.inputs.length>=5);
  assert.equal(await page.evaluate(()=>gunQA.inputs.some(i=>i.bits&32)),false);await page.mouse.up({button:'right'});
  // Releasing a held trigger on focus loss must not leave automatic fire stuck.
  await page.mouse.down();await page.waitForFunction(()=>gunQA.inputs.some(i=>i.bits&16));
  await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));gunQA.inputs.length=0;});
  await page.waitForFunction(()=>gunQA.inputs.length>=5);assert.equal(await page.evaluate(()=>gunQA.inputs.some(i=>i.bits&48)),false);await page.mouse.up();
  if(game==='tc2')await page.screenshot({path:'build/qa/lightgun-fullscreen.png'});
  await page.evaluate(()=>document.exitFullscreen());
  await page.locator('#gun-cover').selectOption('pedal');await page.locator('#gun-button').selectOption('1');
  await page.locator('#game').scrollIntoViewIfNeeded();const bounds=await page.locator('#game').boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.down({button:'middle'});await page.evaluate(()=>gunQA.inputs.length=0);await page.waitForFunction(()=>gunQA.inputs.length>=4);
  assert.equal(await page.evaluate(()=>gunQA.inputs.every(i=>i.bits&32)),true);
  await page.mouse.down({button:'left'});await page.waitForFunction(()=>gunQA.inputs.some(i=>(i.bits&48)===48));await page.mouse.up({button:'left'});
  await page.evaluate(()=>gunQA.inputs.length=0);await page.waitForFunction(()=>gunQA.inputs.length>=4);assert.equal(await page.evaluate(()=>gunQA.inputs.some(i=>i.bits&16)),false);
  await page.mouse.up({button:'middle'});
  await page.evaluate(()=>gunQA.inputs.length=0);await page.waitForFunction(()=>gunQA.inputs.length>=4);assert.equal(await page.evaluate(()=>gunQA.inputs.some(i=>i.bits&32)),false);
  const result=await page.evaluate(()=>({frame:arcade.state[1],coreError:arcade.state[3],glError:document.querySelector('#game').getContext('webgl2').getError()}));
  assert.equal(result.coreError,0);assert.equal(result.glError,0);results.push({game,shot,full,...result});console.log(game+' lightgun input passed');
 }
 assert.deepEqual(errors,[]);await writeFile('build/qa/lightgun.json',JSON.stringify({results,errors,physicalHardware:false},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
