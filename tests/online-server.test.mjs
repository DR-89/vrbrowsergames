import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createArcadeServer,validPacket} from '../server/server.mjs';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const {WebSocket}=require('ws');
const packet=(type=12)=>{const b=Buffer.alloc(16);b.write('NMN2');b[4]=type;b.write('t2',10);b.writeUInt16LE(1,12);return b;};

test('gateway preserves datagrams and isolates two logical UDP sockets',async()=>{
 const udp=dgram.createSocket('udp4');udp.bind(0,'127.0.0.1');await once(udp,'listening');
 const ports=new Set();udp.on('message',(b,r)=>{ports.add(r.port);udp.send(b,r.port,r.address);});
 const app=createArcadeServer({root:new URL('../dist',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),udpPort:udp.address().port});
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 const origin=`http://127.0.0.1:${app.server.address().port}`,clients=[];
 try{
  for(let i=0;i<2;i++){const ws=new WebSocket(origin.replace('http:','ws:')+'/online',{origin});clients.push(ws);await once(ws,'open');}
  await Promise.all(clients.map(async ws=>{const message=once(ws,'message');ws.send(packet());assert.deepEqual((await message)[0],packet());}));
  assert.equal(ports.size,2);
  const close=once(clients[0],'close');clients[0].send('not a datagram');assert.equal((await close)[0],1008);
  const echo=once(clients[1],'message');clients[1].send(packet());assert.deepEqual((await echo)[0],packet());
  const response=await fetch(origin+'/api/online');assert.equal((await response.json()).protocol,'tc2-nmn2-ws-v1');
  assert.equal(response.headers.get('cross-origin-embedder-policy'),'require-corp');
 }finally{for(const ws of clients)ws.terminate();await app.close();udp.close();}
});
test('gateway rejects another origin and oversized/wrong-game payloads',async()=>{
 const app=createArcadeServer({root:'.'});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 try{
  const ws=new WebSocket(`ws://127.0.0.1:${app.server.address().port}/online`,{origin:'https://unrelated.example'});
  const [error]=await once(ws,'error');assert.match(error.message,/403/);
  const good=packet();assert.equal(validPacket(good),true);good[10]=114;assert.equal(validPacket(good),false);
  assert.equal(validPacket(Buffer.alloc(1501)),false);assert.equal(validPacket(Buffer.alloc(15)),false);
 }finally{await app.close();}
});
