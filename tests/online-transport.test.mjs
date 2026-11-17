import test from 'node:test';
import assert from 'node:assert/strict';
import {OnlineTransport} from '../dist/online.js';

test('native LEAVE is sent before a closed socket is disposed, allowing immediate rejoin',()=>{
 const buffer=new SharedArrayBuffer(4096),heap=new Uint8Array(buffer),handles=new Int32Array(buffer,0,8),queue=[];
 const events=[],sockets=[];
 class Socket{
  readyState=1;bufferedAmount=0;
  constructor(){sockets.push(this);}
  send(b){events.push(['send',b[4]]);}
  close(){events.push(['close']);this.readyState=3;}
 }
 const M={HEAPU8:heap,_web_net_sockets:()=>0,_web_net_peek:()=>{
  if(!queue.length)return 0;const p=queue[0];new Int32Array(buffer,128,2).set([p.fd,16]);heap.fill(0,136,152);heap[140]=p.type;return 128;
 },_web_net_sent:()=>queue.shift()};
 const transport=new OnlineTransport(M,{Socket,url:new URL('https://arcade.example/online')});
 try{
  handles[0]=8;queue.push({fd:8,type:1});transport.pump();
  handles[0]=0;queue.push({fd:8,type:8});transport.pump();
  assert.deepEqual(events,[['send',1],['send',8],['close']]);assert.equal(transport.drops,0);
  handles[0]=16;queue.push({fd:16,type:1});transport.pump();assert.equal(sockets.length,2);
 }finally{transport.close();}
});
