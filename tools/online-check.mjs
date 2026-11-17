// Two complete WASM cabinets, real NMN2 server, actual arcade inputs (no mocked transport).
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.ARCADE_URL||'http://localhost:8094',frames=Number(process.env.ONLINE_FRAMES||6000);
const chars='ACDEFGHJKLMNPQRTUVWXY34679',code=Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
function recording(coinsAt,aimUntil){
 const events=[[0,0,457,161]],start=coinsAt+200;
 for(let i=0;i<8;i++)events.push([coinsAt+i*12,1,457,161],[coinsAt+i*12+6,0,457,161]);
 events.push([start,16,457,161],[start+6,0,457,161]);
 for(let f=start+200,k=0;f<frames+500;f+=8,k++){
  const x=f<aimUntil?457:Math.trunc(457+250*Math.sin(k*.37)),y=f<aimUntil?161:Math.trunc(161+80*Math.sin(k*.23));
  const pedal=k%40<34?32:0;events.push([f,pedal?48:0,x,y],[f+4,pedal,x,y]);
 }
 // The replay must supply the held input every frame: the WebXR host sets live input each frame.
 events.sort((a,b)=>a[0]-b[0]);let at=0,current=events[0],lines=[];
 for(let f=0;f<=frames+500;f++){while(at+1<events.length&&events[at+1][0]<=f)current=events[++at];lines.push(`F ${f} ${current[1].toString(16)} ${current[2]} ${current[3]} 0`);}
 return lines.join('\n');
}
const browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true,args:['--force-high-performance-gpu','--use-fake-device-for-media-stream']});
const pages=[],logs=[[],[]],errors=[],snapshots=[];
try{
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:1000,height:800},permissions:['microphone']}),page=await context.newPage();pages.push(page);
  page.on('pageerror',e=>errors.push({cabinet:i,message:e.message}));
  page.on('console',m=>{logs[i].push(m.text());if(m.type()==='error')errors.push({cabinet:i,message:m.text()});});
  await page.addInitScript(({i,code,replay})=>{
   let factory;Object.defineProperty(window,'createArcade',{configurable:true,get(){return factory;},set(original){factory=async options=>{
    const M=await original({...options,printErr:m=>{console.log(m);options.printErr?.(m);}});
    const env={TC2_NET_STATUS:'1',TC2_NET_ROOM_CODE:code,TC2_NET_SCRIPT:i?'700:joincode='+code:'600:hostroom',TC2_REPLAY:'/inputs.rec'};
    for(const[k,v]of Object.entries(env)){const p=M._web_net_inbox(),encode=new TextEncoder();M.HEAPU8.set(encode.encode(k+'\0'),p);M.HEAPU8.set(encode.encode(v+'\0'),p+128);if(!M._web_env(p,p+128))throw Error('Native startup config failed');}
    M.FS.writeFile('/inputs.rec',replay);M.FS.writeFile('/online.cfg',`name=WEB${i+1}\nserver=127.0.0.1\nvoice=0\n`);return M;
   };}});
  },{i,code,replay:recording(i?3000:1500,i?5000:2600)});
 }
 await Promise.all(pages.map(async page=>{
  await page.goto(base+'/?game=tc2');await page.locator('#load').click();
  await page.waitForFunction(()=>window.arcade?.loaded||document.querySelector('#status').classList.contains('error'),null,{timeout:120000});
  assert.equal(await page.evaluate(()=>arcade.loaded),true,await page.locator('#status').textContent());
 }));
 let next=Date.now()+5000;const deadline=Date.now()+240000;
 while(Date.now()<deadline){
  const pair=await Promise.all(pages.map(p=>p.evaluate(()=>({frame:arcade.state[1],online:arcade.online,performance:document.querySelector('#performance').textContent,status:document.querySelector('#status').textContent}))));
  if(Date.now()>=next){snapshots.push(pair);console.log(JSON.stringify(pair));next=Date.now()+10000;}
  if(pair.some(p=>/Failed to execute|Could not|stopped|Aborted/.test(p.status)))throw Error(JSON.stringify(pair));
  if(pair.every(p=>p.frame>=frames))break;
  if(errors.some(e=>/RuntimeError|Aborted|TypeError/.test(e.message)))throw Error(JSON.stringify(errors));
  await new Promise(r=>setTimeout(r,1000));
 }
 const pair=await Promise.all(pages.map(p=>p.evaluate(()=>({frame:arcade.state[1],online:arcade.online,glError:document.querySelector('#game').getContext('webgl2').getError()}))));
 assert.ok(pair.every(p=>p.frame>=frames),'Both cabinets must finish the replay');
 for(let i=0;i<2;i++){const p=pair[i];assert.equal(p.online.side,i+1);assert.equal(p.online.linked,true);assert.equal(p.online.alive,true);assert.equal(p.online.bad,0);assert.equal(p.online.gameErrors,0);assert.ok(p.online.tx>100&&p.online.rx>100);assert.equal(p.glError,0);}
 if(frames>=5500)assert.ok(snapshots.some(p=>p[1].online.gameMode===0&&p[1].online.selfState===4),'P1 must see P2 actually in a game over the original C422 link');
 await Promise.all(pages.map((p,i)=>p.screenshot({path:`build/qa/online-P${i+1}.png`})));
 console.log('LINKED GAMEPLAY PASS');
 await writeFile('build/qa/online-gameplay.json',JSON.stringify({code,frames,pair,snapshots,errors},null,2));
 if(frames>=5500){
  await Promise.all(pages.map(p=>p.evaluate(()=>arcade.onlineCommand(9,1))));
  await pages[0].locator('#online-mic').click();
  await pages[0].waitForFunction(()=>arcade.online.voiceSent>8,null,{timeout:15000});
  await pages[1].waitForFunction(()=>arcade.online.voiceReceived>8,null,{timeout:15000});
  console.log('BROWSER MICROPHONE / OPUS / PARTNER RECEIVE PASS');
 }
 // Opening the menu must not freeze the partner; leaving and rejoining restores P2.
 const before=pair[0].frame;await pages[0].evaluate(()=>arcade.pause(true));await new Promise(r=>setTimeout(r,1200));
 assert.ok(await pages[0].evaluate(()=>arcade.state[1])>before+20);
 await pages[0].evaluate(()=>arcade.pause(false));await pages[1].evaluate(()=>arcade.onlineCommand(3));
 await pages[1].waitForFunction(()=>arcade.online.state===0,null,{timeout:20000});
 await pages[1].evaluate(()=>arcade.onlineCommand(7));
 await pages[1].waitForFunction(()=>arcade.online.linked&&arcade.online.side===2,null,{timeout:45000});
 console.log('MENU / LEAVE / REJOIN PASS');
 await writeFile('build/qa/online-result.json',JSON.stringify({code,frames,pair,snapshots,errors,menuContinues:true,rejoin:true},null,2));
}finally{
 await mkdir('build/qa',{recursive:true});
 for(let i=0;i<pages.length;i++){await writeFile(`build/qa/online-P${i+1}.log`,logs[i].join('\n'));await pages[i].evaluate(()=>{window.arcade?.module?.PThread.terminateAllThreads();}).catch(()=>{});}
 await writeFile('build/qa/online-snapshots.json',JSON.stringify({snapshots,errors},null,2));await browser.close();
}
