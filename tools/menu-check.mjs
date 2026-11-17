import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true,args:['--force-high-performance-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto((process.env.ARCADE_URL||'http://localhost:8094')+'/?game=tc2');
 await page.locator('#skipStartup').check();await page.locator('#load').click();
 await page.waitForFunction(()=>arcade.loaded,null,{timeout:90000});
 await page.waitForFunction(()=>arcade.online?.startupLeft>0,null,{timeout:15000});
 const before=await page.evaluate(()=>arcade.state[1]),start=Date.now();
 console.log('BEFORE SKIP',JSON.stringify(await page.evaluate(()=>({state:arcade.state,online:arcade.online,settings:arcade.settings}))));
 await page.locator('#game').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Skipping the cabinet startup'),null,{timeout:3000});
 try{await page.waitForFunction(()=>arcade.state[1]>1380&&arcade.online.startupLeft===0,null,{timeout:60000});}catch(error){console.log('AFTER SKIP',JSON.stringify(await page.evaluate(()=>({state:arcade.state,online:arcade.online,status:document.querySelector('#status').textContent,diagnostics:document.querySelector('#diagnostics').textContent}))));throw error;}
 const skipMs=Date.now()-start;
 await page.evaluate(()=>arcade.pause(true));await page.waitForTimeout(500);
 const box=await page.locator('#game').boundingBox();
 const width=Math.min(box.width,box.height*4/3),height=width*3/4;
 box.x+=(box.width-width)/2;box.y+=(box.height-height)/2;box.width=width;box.height=height;
 const click=async(x,y)=>page.mouse.click(box.x+x/1120*box.width,box.y+y/728*box.height);
 // Coordinates refer to the native menu's 1120 x 728 canvas.
 await click(230,105);await page.waitForTimeout(200);
 await click(851,344);
 await page.waitForFunction(()=>arcade.settings.scale===105,null,{timeout:3000});
 await page.screenshot({path:'build/qa/tc2-native-menu.png',fullPage:true});
 // Exercise keyboard navigation too: Tab advances through native tabs.
 await page.locator('#game').focus();await page.keyboard.press('Tab');await page.waitForTimeout(150);
 await page.keyboard.press('Escape');await page.waitForTimeout(100);
 const health=await page.evaluate(()=>({state:arcade.state,online:arcade.online,gl:document.querySelector('#game').getContext('webgl2').getError()}));
 assert.equal(health.gl,0);assert.equal(health.state[3],0);assert.equal(errors.length,0);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'build/qa/tc2-online-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile horizontal overflow');
 const result={before,skipMs,health,errors};await writeFile('build/qa/tc2-menu.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await page.evaluate(()=>window.arcade?.module?.PThread.terminateAllThreads()).catch(()=>{});await browser.close();}
