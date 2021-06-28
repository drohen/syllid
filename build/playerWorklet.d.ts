declare const worker = "var t;(function(f){f.state=\"state\",f.buffer=\"buffer\"})(t||(t={}));var i=class extends AudioWorkletProcessor{constructor(e){super(e);this.bindFns(),this.channels=Array(e?.outputChannelCount?.[0]??2).fill(void 0).map(()=>this.newChannelItem()),this.port.onmessage=u=>this.handleMessage(u),this.handlers={[t.state]:this.handleState,[t.buffer]:this.handleBuffer}}bindFns(){this.handleMessage=this.handleMessage.bind(this),this.handleState=this.handleState.bind(this),this.handleBuffer=this.handleBuffer.bind(this),this.process=this.process.bind(this),this.onEndProcess=this.onEndProcess.bind(this)}newChannelItem(){return{bufferCursor:0,currentBuffer:0,state:!1,totalBuffers:0}}handleMessage(e){this.handlers[e.data.type](e.data)}handleState(e){e.type===t.state&&(typeof e.state!=\"boolean\"||typeof e.channel!=\"number\"||!this.channels[e.channel]||(this.channels[e.channel].state=e.state))}handleBuffer(e){e.type===t.buffer&&(e.buffer?.buffer===void 0||typeof e.channel!=\"number\"||!this.channels[e.channel]||(this.channels[e.channel].state||(this.channels[e.channel].state=!0),this.channels[e.channel][this.channels[e.channel].totalBuffers]=e.buffer,this.channels[e.channel].totalBuffers+=1))}onEndProcess(){for(let e=0;e<this.channels.length;e+=1)!this.channels[e].state&&this.channels[e].totalBuffers>0&&(this.channels[e]=this.newChannelItem())}process(e,u){let l=u[0],a=Math.min(this.channels.length,l.length);for(let s=0;s<a;s+=1){let r=l[s],n=this.channels[s];if(!n.state||!n.totalBuffers||!n[n.currentBuffer]){r.fill(0);continue}for(let h=0;h<r.length;h+=1){if(r[h]=n[n.currentBuffer][n.bufferCursor],n.bufferCursor>n[n.currentBuffer].length-2e3&&n[n.currentBuffer+1]){let c=2e3-(n[n.currentBuffer].length-n.bufferCursor);r[h]+=n[n.currentBuffer+1][c]}n.bufferCursor+=1,n.bufferCursor===n[n.currentBuffer].length&&(delete n[n.currentBuffer],n.bufferCursor=n[n.currentBuffer+1]!==void 0?2e3:0,n.currentBuffer+=1)}}return this.onEndProcess(),!0}};registerProcessor(\"playerWorklet\",i);";
export default worker;
//# sourceMappingURL=playerWorklet.d.ts.map