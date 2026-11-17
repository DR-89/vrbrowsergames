import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const game=process.argv[2]||'tc1',out=new URL('../build/qa/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1280,height:960}}),messages=[];
page.on('console',msg=>{if(['error','warning'].includes(msg.type()))messages.push(msg.text());});
page.on('pageerror',error=>messages.push(error.message));
try{
 await page.goto('http://localhost:8094/?game='+game);await page.locator('#load').click();
 await page.waitForFunction(()=>window.arcade?.loaded||document.querySelector('#status').classList.contains('error'),null,{timeout:90000});
 await page.waitForTimeout(2500);
 const start=await page.evaluate(()=>({loaded:arcade.loaded,state:arcade.state,status:document.querySelector('#status').textContent,logs:document.querySelector('#diagnostics').textContent}));
 console.log('START',JSON.stringify(start));
 if(!start.loaded)throw Error(start.status);
 await page.waitForFunction(min=>arcade.state[1]>min,game==='tc1'?180:1400,{timeout:150000});
 await page.locator('#coin').click();await page.waitForTimeout(1600);await page.locator('#game').focus();await page.keyboard.press('Enter',{delay:120});await page.waitForTimeout(3000);
 await page.locator('#game').screenshot({path:fileURLToPath(new URL(game+'-start.png',out))});
 const bounds=await page.locator('#game').boundingBox();
 await page.locator('#game').click({position:{x:bounds.width*.5,y:bounds.height*(game==='tc2'?.68:.5)},delay:100});await page.waitForTimeout(game==='tc2'?12000:2500);
 await page.keyboard.down('Space');
 for(let i=0;i<8;i++){await page.locator('#game').click({position:{x:280+i*16,y:230},delay:100});await page.waitForTimeout(100);}
 await page.keyboard.up('Space');await page.waitForTimeout(2000);
 if(game!=='tc1'){await page.waitForTimeout(8000);await page.keyboard.down('Space');const b=await page.locator('#game').boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);if(game==='cz'){await page.mouse.down();await page.waitForTimeout(3000);await page.mouse.up();}else{for(let i=0;i<10;i++){await page.mouse.click(b.x+b.width*(.35+i*.025),b.y+b.height*.5,{delay:80});await page.waitForTimeout(150);}}await page.keyboard.up('Space');}
 const final=await page.evaluate(()=>{const m=arcade.module,p=new Int16Array(m.HEAPU8.buffer,m._web_audio(),65536*2);let peak=0,nonzero=0;for(const s of p){peak=Math.max(peak,Math.abs(s));if(s)nonzero++;}return {state:arcade.state,performance:document.querySelector('#performance').textContent,peak,nonzero,save:localStorage.getItem('tc-webxr:'+new URL(location).searchParams.get('game')+':save')?.length,logs:document.querySelector('#diagnostics').textContent};});
 await page.locator('#game').screenshot({path:fileURLToPath(new URL(game+'-play.png',out))});
 await page.evaluate(()=>arcade.pause(true));await page.waitForFunction(()=>arcade.state[0]===1);
 const stereo=await page.evaluate(async()=>{
   const {viewMatrix,perspective}=await import('./math.js'),m=arcade.module,gl=document.querySelector('#game').getContext('webgl2');
   const ptr=m._web_matrices()/4,images=[];m._web_pause(0);m._web_view_mode(1);
   for(const [scale,x]of [[1,-.032],[1,.032],[.25,-.032],[4,-.032]]){
     m._web_settings(scale,.4,-16,0,0,0,1);m.HEAPF32.set(viewMatrix([x,0,0],[0,0,0,1]),ptr);m.HEAPF32.set(perspective(Math.PI/2,4/3),ptr+16);
     const fbo=m._web_eye(x<0?0:1,320,240,performance.now());gl.bindFramebuffer(gl.FRAMEBUFFER,m.GL.framebuffers[fbo]);const data=new Uint8Array(320*240*4);gl.readPixels(0,0,320,240,gl.RGBA,gl.UNSIGNED_BYTE,data);images.push(data);
   }
   const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;return n;};
   const error=gl.getError();m._web_view_mode(0);m._web_pause(1);
   return {eyeDifferencePixels:diff(images[0],images[1]),scaleDifferencePixels:diff(images[2],images[3]),glError:error};
 });
 const result={game,start,final,stereo,messages};await writeFile(new URL(game+'.json',out),JSON.stringify(result,null,2));console.log('RESULT',JSON.stringify(result));
 if(!final.state[2]||!final.nonzero||final.state[3]||stereo.glError||!stereo.eyeDifferencePixels||!stereo.scaleDifferencePixels||messages.some(m=>/INVALID_|RuntimeError|Aborted/.test(m)))process.exitCode=1;
}finally{await page.evaluate(()=>window.arcade?.module?.PThread.terminateAllThreads()).catch(()=>{});await browser.close();}
