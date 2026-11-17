// Real, headed hardware check. Keeps its separate browser open for the player.
// No simulated XR poses, permission bypass or disabled browser sandbox.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(import.meta.dirname,'..'),game=process.argv[2]||'tc1';
await mkdir(resolve(root,'build/qa'),{recursive:true});
const browser=await chromium.launchPersistentContext(resolve(root,'build/pcvr-profile'),{
 channel:'chrome',headless:false,chromiumSandbox:true,viewport:null,
 args:['--force-high-performance-gpu'],ignoreDefaultArgs:['--disable-component-extensions-with-background-pages']
});
const page=browser.pages()[0]||await browser.newPage(),events=[];
page.on('console',m=>{if(['warning','error'].includes(m.type()))events.push({type:m.type(),text:m.text()});});
page.on('pageerror',e=>events.push({type:'pageerror',text:e.message}));
page.on('crash',()=>events.push({type:'crash'}));
await page.goto('http://localhost:8094/?game='+game);
await page.locator('#load').click();
await page.waitForFunction(()=>arcade.loaded||document.querySelector('#status').classList.contains('error'),null,{timeout:90000});
console.log(JSON.stringify(await page.evaluate(()=>({loaded:arcade.loaded,vr:arcade.vr,status:document.querySelector('#status').textContent,renderer:(()=>{const g=document.querySelector('#game').getContext('webgl2'),ext=g?.getExtension('WEBGL_debug_renderer_info');return ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):null;})()}))));
if(await page.evaluate(()=>arcade.loaded)){
 await page.locator('#enter-vr').click();
 try{await page.waitForFunction(()=>arcade.vr.frames>30||!!arcade.vr.error,null,{timeout:45000});}catch{}
}
const result={game,syntheticPoses:false,events,...await page.evaluate(()=>({loaded:arcade.loaded,inVR:arcade.inVR,vr:arcade.vr,status:document.querySelector('#status').textContent,help:document.querySelector('#vr-help').textContent,diagnostics:document.querySelector('#diagnostics').textContent.slice(-5000)}))};
await writeFile(resolve(root,'build/qa/pcvr-real.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
console.log('Browser remains open for headset testing. Close this separate browser window when finished.');
await new Promise(resolve=>browser.on('close',resolve));
