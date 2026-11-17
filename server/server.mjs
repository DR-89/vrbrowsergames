import http from 'node:http';
import dgram from 'node:dgram';
import {createReadStream} from 'node:fs';
import {stat,realpath} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';

export function validPacket(data){
 return data.length>=16&&data.length<=1500&&data.toString('ascii',0,4)==='NMN2'&&
 data[10]===116&&data[11]===50&&data.readUInt16LE(12)===1&&data.readUInt16LE(8)===data.length-16;
}
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.gz':'application/gzip','.wasm':'application/wasm','.md':'text/plain; charset=utf-8'};
export function createArcadeServer({root,origin='',udpHost='127.0.0.1',udpPort=27750,maxConnections=256,maxPerIP=16}={}){
 root=resolve(root);const allowed=new Set(origin.split(',').map(s=>s.trim()).filter(Boolean));
 const wss=new WebSocketServer({noServer:true,maxPayload:1500,perMessageDeflate:false});
 const perIP=new Map();let stopping=false;
 const server=http.createServer(async(req,res)=>{
  const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Permissions-Policy':'xr-spatial-tracking=(self), microphone=(self)','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'};
  for(const[k,v]of Object.entries(headers))res.setHeader(k,v);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
  let path;try{path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
  if(path==='/api/online'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({protocol:'tc2-nmn2-ws-v1',endpoint:'/online',selfHosted:true}));}
  try{
   const target=resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));
   if(!target.startsWith(root+sep))throw Error('outside root');
   const actual=await realpath(target),actualRoot=await realpath(root);
   if(!actual.startsWith(actualRoot+sep))throw Error('outside root');
   const info=await stat(actual);if(!info.isFile())throw Error('not a file');
   res.writeHead(200,{'Content-Type':MIME[extname(actual)]||'application/octet-stream','Content-Length':info.size});
   if(req.method==='HEAD')res.end();else createReadStream(actual).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404);res.end('Not found');}
 });
 server.on('upgrade',(req,socket,head)=>{
  const reject=(code)=>{socket.end(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`);};
  const expected='http://'+req.headers.host;
  if(stopping||req.url!=='/online')return reject('404 Not Found');
  // Production origins are explicit (TLS terminates at the reverse proxy).
  // Never trust forwarded headers to bypass the origin or per-IP limit.
  if(!(allowed.size?allowed.has(req.headers.origin):req.headers.origin===expected))return reject('403 Forbidden');
  const ip=socket.remoteAddress||'unknown';
  if(wss.clients.size>=maxConnections||(perIP.get(ip)||0)>=maxPerIP)return reject('429 Too Many Requests');
  perIP.set(ip,(perIP.get(ip)||0)+1);
  socket.once('close',()=>{const n=(perIP.get(ip)||1)-1;if(n)perIP.set(ip,n);else perIP.delete(ip);});
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',ws=>{
  const udp=dgram.createSocket('udp4');let ready=false,alive=true,windowStart=Date.now(),count=0;
  const pending=[];
  const fail=()=>ws.close(1011,'Lobby transport unavailable');
  udp.on('error',fail);
  udp.connect(udpPort,udpHost,()=>{if(ws.readyState!==WebSocket.OPEN)return;ready=true;for(const b of pending)udp.send(b,err=>{if(err)fail();});pending.length=0;});
  udp.on('message',b=>{
   if(ws.readyState!==WebSocket.OPEN||!validPacket(b))return;
   // No unbounded game-frame backlog after a slow connection.
   if(ws.bufferedAmount>64*1500){ws.close(1013,'Connection too slow');return;}
   ws.send(b,{binary:true});
  });
  ws.on('message',(b,binary)=>{
   const now=Date.now();if(now-windowStart>=1000){windowStart=now;count=0;}
   if(!binary||!validPacket(b)){ws.close(1008,'Invalid TC2 packet');return;}
   if(++count>400){ws.close(1008,'Rate limit');return;}
   if(ready)udp.send(b,err=>{if(err)fail();});
   else if(pending.length<8)pending.push(Buffer.from(b));else ws.close(1013,'Lobby not ready');
  });
  ws.on('pong',()=>{alive=true;});ws.on('error',()=>{});
  const ping=setInterval(()=>{if(!alive){ws.terminate();return;}alive=false;ws.ping();},15000);ping.unref();
  ws.on('close',()=>{clearInterval(ping);try{udp.close();}catch{}});
 });
 const close=async()=>{stopping=true;for(const ws of wss.clients)ws.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));};
 return {server,wss,close};
}
if(process.argv[1]&&(await realpath(resolve(process.argv[1])).catch(()=>null))===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||8094),host=process.env.HOST||'127.0.0.1';
 const root=process.env.SITE_ROOT||fileURLToPath(new URL('../dist',import.meta.url));
 const app=createArcadeServer({root,origin:process.env.PUBLIC_ORIGIN||'',udpHost:process.env.NMN_HOST||'127.0.0.1',udpPort:Number(process.env.NMN_PORT||27750),maxConnections:Number(process.env.MAX_CONNECTIONS||256),maxPerIP:Number(process.env.MAX_PER_IP||16)});
 app.server.listen(port,host,()=>console.log(`WebXR + TC2 online: http://${host}:${port}`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
