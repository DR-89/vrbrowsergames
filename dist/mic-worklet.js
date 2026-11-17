class ArcadeMicrophone extends AudioWorkletProcessor{
 constructor(){super();this.pcm=new Int16Array(480);this.count=0;this.phase=0;}
 process(inputs,outputs){
  const input=inputs[0]?.[0];if(input)for(let i=0;i<input.length;i++){
   this.phase+=48000/sampleRate;
   while(this.phase>=1){this.phase--;this.pcm[this.count++]=Math.round(Math.max(-1,Math.min(1,input[i]))*32767);
    if(this.count===480){this.port.postMessage(this.pcm,[this.pcm.buffer]);this.pcm=new Int16Array(480);this.count=0;}}
  }
  // Connected for processing only; never monitor the microphone into the speakers.
  for(const channels of outputs)for(const channel of channels)channel.fill(0);
  return true;
 }
}
registerProcessor('arcade-microphone',ArcadeMicrophone);
