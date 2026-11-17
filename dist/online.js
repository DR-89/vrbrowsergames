/* One browser WebSocket per native UDP socket. The server alone chooses its UDP destination. */
export class OnlineTransport{
 constructor(M,{onStatus=()=>{},Socket=WebSocket,url=new URL('/online',location.href)}={}){
  this.M=M;this.onStatus=onStatus;this.Socket=Socket;this.sockets=new Map();this.retry=new Map();this.closed=false;this.drops=0;
  this.url=new URL(url);this.url.protocol=this.url.protocol==='https:'?'wss:':'ws:';
  this.timer=setInterval(()=>this.pump(),8);
 }
 pump(){
  if(this.closed)return;const M=this.M;
  const handles=new Int32Array(M.HEAPU8.buffer,M._web_net_sockets(),8),live=new Set();
  for(let i=0;i<handles.length;i++){const fd=Atomics.load(handles,i);if(fd>0)live.add(fd);}
  for(const fd of live)if(!this.sockets.has(fd)&&performance.now()>=(this.retry.get(fd)||0)){
   const ws=new this.Socket(this.url);ws.binaryType='arraybuffer';this.sockets.set(fd,ws);
   ws.onopen=()=>this.onStatus('Connected to this website’s lobby server.');
   ws.onmessage=event=>{
    if(this.closed||this.sockets.get(fd)!==ws||!(event.data instanceof ArrayBuffer))return;
    const data=new Uint8Array(event.data);if(data.length<16||data.length>1500)return;
    M.HEAPU8.set(data,M._web_net_inbox());if(!M._web_net_receive(fd,data.length))this.drops++;
   };
   ws.onerror=()=>this.onStatus('Online server unavailable. Check that the website’s lobby service is running.');
   ws.onclose=()=>{if(this.sockets.get(fd)===ws){this.sockets.delete(fd);this.retry.set(fd,performance.now()+1500);}};
  }
  for(let i=0;i<64;i++){
   const ptr=M._web_net_peek();if(!ptr)break;
   const header=new Int32Array(M.HEAPU8.buffer,ptr,2),fd=header[0],n=header[1],ws=this.sockets.get(fd);
   if(ws?.readyState===0)break; // Also retain a queued LEAVE while the socket is opening.
   if(ws?.readyState===1&&ws.bufferedAmount<64*1500)ws.send(M.HEAPU8.slice(ptr+8,ptr+8+n));else this.drops++;
   M._web_net_sent();
  }
  // Native disconnect sends LEAVE and then closes its socket in the same call.
  // Drain those final datagrams BEFORE the WebSocket close handshake. Otherwise
  // the lobby retains a stale cabinet and rejects an immediate rejoin as full.
  if(!M._web_net_peek())for(const[fd,ws]of this.sockets)if(!live.has(fd)){this.sockets.delete(fd);this.retry.delete(fd);ws.close();}
 }
 close(){this.closed=true;clearInterval(this.timer);for(const ws of this.sockets.values())ws.close();this.sockets.clear();}
}
export class OnlineClient{
 constructor(M,onStatus){this.M=M;this.transport=new OnlineTransport(M,{onStatus});this.commands=[];this.capture=[];this.state={};this.decoder=new TextDecoder();this.encoder=new TextEncoder();}
 command(action,value=0,text=''){if(this.commands.length<32)this.commands.push({action,value,text});}
 readString(ptr){const heap=this.M.HEAPU8;let end=ptr;while(end<ptr+8192&&heap[end])end++;return this.decoder.decode(heap.slice(ptr,end));}
 beforePrepare(){
  const M=this.M;while(this.commands.length){const c=this.commands[0],text=this.encoder.encode(c.text).slice(0,120),ptr=M._web_online_argument();M.HEAPU8.set(text,ptr);M.HEAPU8[ptr+text.length]=0;if(!M._web_online_action(c.action,c.value))break;this.commands.shift();}
  while(this.capture.length){const pcm=this.capture.shift();if(!this.state.linked||!this.state.voice)continue;new Int16Array(M.HEAPU8.buffer,M._web_voice_buffer(),480).set(pcm);M._web_voice_feed(480);}
 }
 afterPrepare(){this.state=JSON.parse(this.readString(this.M._web_online_status()));return this.state;}
 async microphone(){
  if(this.stream){this.stopMicrophone();return false;}
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:false});
  try{
   this.micAudio=new AudioContext({sampleRate:48000});await this.micAudio.audioWorklet.addModule('mic-worklet.js');
   this.micNode=new AudioWorkletNode(this.micAudio,'arcade-microphone');
   this.micNode.port.onmessage=({data})=>{if(this.capture.length<12)this.capture.push(data);};
   this.micAudio.createMediaStreamSource(stream).connect(this.micNode);this.micNode.connect(this.micAudio.destination);await this.micAudio.resume();this.stream=stream;this.command(15,1);return true;
  }catch(e){for(const t of stream.getTracks())t.stop();await this.micAudio?.close();throw e;}
 }
 stopMicrophone(){for(const t of this.stream?.getTracks()||[])t.stop();this.stream=null;this.micNode?.disconnect();this.micAudio?.close().catch(()=>{});this.capture.length=0;this.command(15,0);}
 close(){this.stopMicrophone();this.transport.close();}
}
