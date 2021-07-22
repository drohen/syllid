declare const worker = "var u;(function(f){f.state=\"state\",f.buffer=\"buffer\",f.add=\"add\"})(u||(u={}));var c;(function(f){f.feed=\"feed\",f.id=\"id\"})(c||(c={}));var i;(function(f){f.new=\"new\",f.stale=\"stale\"})(i||(i={}));var a=class extends AudioWorkletProcessor{constructor(e){super(e);this.bindFns(),this.sources=[],this.sourceKey={},this.port.onmessage=s=>this.handleMessage(s),this.handlers={[u.state]:this.handleState,[u.buffer]:this.handleBuffer,[u.add]:this.handleAdd}}bindFns(){this.handleMessage=this.handleMessage.bind(this),this.handleState=this.handleState.bind(this),this.handleBuffer=this.handleBuffer.bind(this),this.handleAdd=this.handleAdd.bind(this),this.bufferKey=this.bufferKey.bind(this),this.process=this.process.bind(this),this.onEndProcess=this.onEndProcess.bind(this)}newStreamItem(e){return{id:e,bufferCursor:0,currentBuffer:0,state:!1,totalBuffers:0,bufferState:i.new}}handleMessage(e){this.handlers[e.data.type](e.data)}handleAdd(e){e.type===u.add&&typeof e.id==\"string\"&&this.sourceKey[e.id]===void 0&&(this.sourceKey[e.id]=e.index,this.sources[e.index]=this.newStreamItem(e.id))}handleState(e){if(e.type!==u.state||typeof e.state!=\"boolean\"||typeof e.id!=\"string\")return;let s=this.sourceKey[e.id];s!==void 0&&(this.sources[s].state=e.state)}handleBuffer(e){if(e.type!==u.buffer||e.buffer?.buffer===void 0||typeof e.id!=\"string\"||typeof e.bufferID!=\"string\")return;let s=this.sourceKey[e.id];s===void 0&&(s=this.sources.length,this.sourceKey[e.id]=s,this.sources.push(this.newStreamItem(e.id)));let r=this.bufferKey(s);this.sources[s][r]={buffer:e.buffer,id:e.bufferID}}bufferKey(e){let s=this.sources[e].totalBuffers;return this.sources[e].totalBuffers+=1,s}onEndProcess(e){e.length>0&&this.port.postMessage(this.emitBufferIDs(e));let s=[];for(let r=0;r<this.sources.length;r+=1)!this.sources[r].state&&this.sources[r].totalBuffers>0&&(this.sources[r]=this.newStreamItem(this.sources[r].id)),this.sources[r].state&&this.sources[r].totalBuffers-this.sources[r].currentBuffer<6&&s.push(this.sources[r].id);this.port.postMessage(this.emitFeedRequest(s))}emitBufferIDs(e){return{idList:e,type:c.id}}emitFeedRequest(e){return{streams:e,type:c.feed}}process(e,s){try{let r=[];for(let h=0;h<this.sources.length;h+=1){let t=this.sources[h];if(!t||!t.state)continue;let d=s[h];if(!d)continue;let n=d[0];if(!t.state||!t.totalBuffers||!t[t.currentBuffer]){n.fill(0);continue}for(let o=0;o<n.length;o+=1){if(!t.state||!t.totalBuffers||!t[t.currentBuffer]){n.fill(0,o);break}t.bufferState===i.new&&(r.push({bufferID:t[t.currentBuffer].id,sourceID:t.id}),t.bufferState=i.stale),n[o]=t[t.currentBuffer].buffer[t.bufferCursor];let l=!1;if(t.bufferCursor>t[t.currentBuffer].buffer.length-2e3&&t[t.currentBuffer+1]){let b=2e3-(t[t.currentBuffer].buffer.length-t.bufferCursor);n[o]+=t[t.currentBuffer+1].buffer[b],l=!0}t.bufferCursor+=1,t.bufferCursor===t[t.currentBuffer].buffer.length&&(delete t[t.currentBuffer],t.bufferCursor=l?2e3:0,t.currentBuffer+=1,t.bufferState=i.new)}}this.onEndProcess(r)}catch(r){console.warn(\"Audio Worklet Errored:\",r)}return!0}};registerProcessor(\"playerWorklet\",a);";
export default worker;
//# sourceMappingURL=playerWorklet.d.ts.map