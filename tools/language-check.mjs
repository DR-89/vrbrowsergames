import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {languages} from '../dist/i18n.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_BASE_URL||'http://localhost:8094/',publicTest=base.startsWith('https://vrbrowsergames.xyz');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required',...(publicTest?['--host-resolver-rules=MAP vrbrowsergames.xyz 159.195.202.185']:[])]});
const out=new URL('../build/qa/',import.meta.url);await mkdir(out,{recursive:true});
const context=await browser.newContext({viewport:{width:738,height:667}}),page=await context.newPage(),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
const dictionary=async name=>JSON.parse(await readFile(new URL(`../dist/lang/${name}.json`,import.meta.url),'utf8'));
async function language(name,tag){await page.selectOption('#language',name);await page.waitForFunction(tag=>document.documentElement.lang===tag,tag);}
async function layout(width,name){
 await page.setViewportSize({width,height:800});
 const sizes=await page.evaluate(()=>{
  document.querySelector('.support').open=true;
  const rect=id=>{const {x,y,width,height}=document.getElementById(id).getBoundingClientRect();return {x,y,width,height};};
  return {page:document.documentElement.scrollWidth,viewport:innerWidth,export:rect('backup'),restore:rect('restore-button'),language:rect('language')};
 });
 assert.ok(sizes.page<=width+1,`${name} page overflow at ${width}: ${sizes.page}`);
 assert.ok(sizes.language.x>=0&&sizes.language.x+sizes.language.width<=width,`${name} selector outside viewport`);
 assert.equal(sizes.export.width,sizes.restore.width,`${name} unequal backup buttons`);
 assert.equal(sizes.export.height,sizes.restore.height,`${name} unequal backup button heights`);
 if(width>480)assert.equal(sizes.export.y,sizes.restore.y,`${name} backup buttons misaligned`);
 else {assert.equal(sizes.export.x,sizes.restore.x);assert.ok(sizes.restore.y>=sizes.export.y+sizes.export.height+11);}
 return sizes;
}
try{
 const response=await page.goto(base+'?game=tc1');assert.equal(response.status(),200);
 await page.waitForFunction(()=>!!window.arcade);
 assert.equal(await page.locator('#language option').count(),21);
 for(const [name,tag]of languages){
  const dict=await dictionary(name);await language(name,tag);
  assert.equal((await page.locator('h1').textContent()).replace(/\s/g,''),(dict.s004+dict.s005).replace(/\s/g,''),name+' hero');
  assert.equal(await page.locator('#backup').textContent(),dict.s117,name+' backup');
  assert.equal(await page.locator('#restore-button').textContent(),dict.s118,name+' restore');
  assert.equal(await page.locator('#game-copy').textContent(),dict.s130,name+' game copy');
  assert.equal(await page.locator('#screen-input-status').textContent(),dict.s048,name+' live input status');
  assert.equal(await page.locator('#enter-vr').getAttribute('title'),dict.s163,name+' title');
  assert.equal(await page.locator('meta[name="description"]').getAttribute('content'),dict.s237,name+' description');
  for(const width of [738,390,1440])results.push({name,width,...await layout(width,name)});
 }
 await language('german','de');await page.setViewportSize({width:738,height:667});await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:fileURLToPath(new URL('languages-header-de.png',out))});
 await page.locator('.save-actions').scrollIntoViewIfNeeded();await page.locator('.support').screenshot({path:fileURLToPath(new URL('languages-save-de.png',out))});
 await language('japanese','ja');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:fileURLToPath(new URL('languages-mobile-ja.png',out))});
 await page.locator('.save-actions').scrollIntoViewIfNeeded();await page.locator('.support').screenshot({path:fileURLToPath(new URL('languages-save-mobile-ja.png',out))});
 await language('german','de');await page.setViewportSize({width:738,height:667});
 await page.reload();await page.waitForFunction(()=>!!window.arcade);assert.equal(await page.locator('html').getAttribute('lang'),'de');
 await page.locator('[data-game="tc2"]').click();await page.waitForFunction(()=>!!window.arcade);assert.equal(await page.locator('html').getAttribute('lang'),'de');
 await page.goto(base+'?game=tc1');await page.waitForFunction(()=>!!window.arcade);
 await page.locator('#load').click();await page.waitForFunction(()=>window.arcade?.loaded||document.querySelector('#status').classList.contains('error'),null,{timeout:90000});
 assert.equal(await page.evaluate(()=>arcade.loaded),true,await page.locator('#status').textContent());
 await page.waitForFunction(()=>arcade.state[1]>180,null,{timeout:90000});
 await page.evaluate(()=>{window.__originalCore=arcade.module;window.__frameBefore=arcade.state[1];window.__settingsBefore=JSON.stringify(arcade.settings);});
 await language('japanese','ja');await language('french','fr');await language('german','de');
 await page.waitForFunction(()=>arcade.state[1]>window.__frameBefore+10);
 const core=await page.evaluate(()=>({same:arcade.module===window.__originalCore,frames:arcade.state[1],before:window.__frameBefore,settingsSame:JSON.stringify(arcade.settings)===window.__settingsBefore,error:arcade.state[3]}));
 assert.ok(core.same&&core.settingsSame);assert.ok(core.frames>=core.before);assert.equal(core.error,0);
 const de=await dictionary('german');assert.equal(await page.locator('#load').textContent(),de.s183);
 await page.evaluate(()=>arcade.pause(true));assert.equal(await page.locator('#pause').textContent(),de.s136);
 await page.locator('.support').evaluate(element=>element.open=true);
 const chooser=page.waitForEvent('filechooser');await page.locator('#restore-button').click();
 await (await chooser).setFiles({name:'wrong-backup.json',mimeType:'application/json',buffer:Buffer.from('{"game":"wrong","version":1,"files":{}}')});
 await page.waitForFunction(text=>document.getElementById('save-status').textContent===text,de.s194);
 await language('english','en');assert.equal(await page.locator('#save-status').textContent(),'Wrong game or backup format.');
 const download=page.waitForEvent('download');await page.locator('#backup').click();const backup=await download;assert.equal(backup.suggestedFilename(),'tc1-webxr-save.json');
 const save=JSON.parse(await readFile(await backup.path(),'utf8'));assert.equal(save.game,'tc1');assert.ok(save.files['tc_eeprom.nv']);
 const restoreChooser=page.waitForEvent('filechooser');await page.locator('#restore-button').click();
 const reloaded=page.waitForEvent('domcontentloaded');
 await (await restoreChooser).setFiles({name:'tc1-webxr-save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
 await reloaded;await page.waitForFunction(()=>!!window.arcade);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('tc-webxr:tc1:save')).files),save.files);
 // Failed and racing requests must keep the latest successful choice; test in a fresh cache.
 const second=await browser.newContext(),race=await second.newPage();let releaseGerman,requestGerman;
 const requested=new Promise(resolve=>requestGerman=resolve),released=new Promise(resolve=>releaseGerman=resolve);
 await race.route('**/lang/german.json',async route=>{requestGerman();await released;await route.continue();});
 await race.route('**/lang/japanese.json',route=>route.fulfill({status:503,body:'Unavailable'}));
 await race.goto(base);await race.waitForFunction(()=>!!window.arcade);
 await race.selectOption('#language','german');await requested;await race.selectOption('#language','french');await race.waitForFunction(()=>document.documentElement.lang==='fr');const germanResponse=race.waitForResponse('**/lang/german.json');releaseGerman();
 await germanResponse;await race.waitForTimeout(100);assert.equal(await race.locator('html').getAttribute('lang'),'fr');
 await race.selectOption('#language','japanese');await race.waitForFunction(()=>!document.getElementById('language-error').hidden);assert.equal(await race.locator('#language').inputValue(),'french');assert.equal(await race.locator('html').getAttribute('lang'),'fr');
 const raw=await race.evaluate(async()=>{const {message,translate,setText,setTranslatedAttribute}=await import('./i18n.js');const button=document.createElement('button');document.body.append(button);setText(button,'Enter VR');setTranslatedAttribute(button,'title','Load the selected game first.');return {text:button.textContent,title:button.title,room:translate(message('{name} · {players}/2 · {status}',{name:'Join $& <b>',players:1,status:message('Join')}))};});
 const fr=await dictionary('french');assert.equal(raw.text,fr.s022);assert.equal(raw.title,fr.s163);assert.ok(raw.room.startsWith('Join $& <b> · 1/2 · '));assert.ok(raw.room.endsWith(fr.s209));
 await second.close();assert.deepEqual(errors,[]);
 const report={base,languages:languages.length,viewportChecks:results.length,core,errors,results};await writeFile(new URL('languages.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify({base,languages:languages.length,viewportChecks:results.length,core,errors}));
}finally{await browser.close();}
