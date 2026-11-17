// Real WASM/UI/browser persistence. The separate XR check drives tracked input.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const game=process.argv[2]||'tc1';assert.ok(['tc1','cz'].includes(game));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--force-high-performance-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 const url=(process.env.ARCADE_URL||'http://localhost:8094')+'/?game='+game;
 await page.goto(url);await page.locator('#load').click();
 await page.waitForFunction(()=>arcade.loaded,null,{timeout:90000});
 await page.waitForFunction(()=>arcade.state[1]>180,null,{timeout:60000});
 await page.evaluate(()=>arcade.pause(true));await page.waitForFunction(()=>arcade.state[0]===1);
 await page.locator('#game').scrollIntoViewIfNeeded();await page.waitForTimeout(250);
 const box=await page.locator('#game').boundingBox();
 const w=Math.min(box.width,box.height*4/3),h=w*3/4;
 const click=async(x,y)=>{await page.mouse.click(box.x+(box.width-w)/2+x/1120*w,box.y+(box.height-h)/2+y/728*h);await page.waitForTimeout(180);};
 const get=()=>page.evaluate(()=>arcade.settings);
 const expect=async(key,value)=>page.waitForFunction(({key,value})=>arcade.settings[key]===value,{key,value},{timeout:5000});
 const tab=async(x,index)=>{await click(x,105);await page.waitForFunction(t=>arcade.module._web_menu_tab()===t,index);};
 await page.evaluate(()=>{window.menuTrace=[];const m=arcade.module,fn=m._web_menu_input; m._web_menu_input=(...a)=>{if(a[3]||a[4])menuTrace.push({time:performance.now(),a});return fn(...a);};});
 const shotBefore=await page.evaluate(()=>arcade.state[2]);
 await click(959,266);await expect('aim',0);
 await click(851,344);await expect('pitch',-15);
 await click(851,422);await expect('up',5);
 await click(851,500);await expect('back',5);
 await page.locator('#game').screenshot({path:`build/qa/${game}-menu-gun.png`});
 await tab(240,1);
 await click(851,266);await expect('scale',105);
 await click(851,344);await expect('distance',game==='tc1'?45:5);
 await click(959,188);await expect('crouch',1);
 await page.locator('#game').screenshot({path:`build/qa/${game}-menu-player.png`});
 await tab(420,2);
 await click(727,188);await expect('quality',.65);
 await click(959,266);await expect('refresh',120);
 await click(959,344);await expect('adaptive',true);
 await click(959,422);await expect('filter',false);
 await page.locator('#game').screenshot({path:`build/qa/${game}-menu-graphics.png`});
 await tab(590,3);
 await click(494,188);await expect('gameVolume',95);
 await page.locator('#game').screenshot({path:`build/qa/${game}-menu-audio.png`});
 const saved=await get();
 const health=await page.evaluate(()=>({state:arcade.state,gl:document.querySelector('#game').getContext('webgl2').getError(),saved:JSON.parse(localStorage.getItem('tc-webxr:'+new URL(location).searchParams.get('game')+':settings')||'null')}));
 assert.equal(health.gl,0);assert.equal(health.state[3],0);assert.equal(health.state[2],shotBefore,'Menu clicks must not fire the cabinet');
 // Keyboard Tab wraps through the same four tabs, independently of online state.
 await page.locator('#game').focus();await page.keyboard.press('Tab');
 await page.waitForFunction(()=>arcade.module._web_menu_tab()===0);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!arcade.module._web_menu_paused());
 const before=await page.evaluate(()=>arcade.state[1]);await page.waitForFunction(n=>arcade.state[1]>n+5,before);
 await page.evaluate(()=>arcade.module.PThread.terminateAllThreads());await page.reload();
 await page.waitForFunction(()=>window.arcade);assert.deepEqual(await get(),saved,'Menu settings survive reload');
 const report={game,saved,health,errors};assert.deepEqual(errors,[]);
 await writeFile(`build/qa/${game}-offline-menu.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){
 console.error(JSON.stringify({error:e.message,errors,diagnostics:await page.evaluate(()=>({trace:window.menuTrace,settings:arcade.settings,state:arcade.state,tab:arcade.module?._web_menu_tab?.(),values:arcade.module?._web_menu_values?Array.from(new Int32Array(arcade.module.HEAPU8.buffer,arcade.module._web_menu_values(),18)):null,log:document.querySelector('#diagnostics').textContent}))}));
 await page.screenshot({path:`build/qa/${game}-menu-failure.png`,fullPage:true});throw e;
}finally{await page.evaluate(()=>window.arcade?.module?.PThread.terminateAllThreads()).catch(()=>{});await browser.close();}
