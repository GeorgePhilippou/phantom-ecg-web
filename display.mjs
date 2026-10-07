import {sampleRange,envelopeIndices,voltageFactor} from './edf.mjs';

// Only display arrays are cached. Original calibrated samples remain untouched.
export function createWaveformCache(limit=6){
  const channels=new WeakMap();
  return function points(channel,start,end,offset,unit,max){
    const [a,b]=sampleRange(channel,start,end,offset);
    const key=JSON.stringify([a,b,offset,unit,max]);
    let cache=channels.get(channel);
    if(!cache){cache=new Map();channels.set(channel,cache);}
    if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
    const indices=envelopeIndices(channel.samples,a,b,max),factor=voltageFactor(channel.unit,unit);
    const x=new Array(indices.length),y=new Array(indices.length);
    for(let j=0;j<indices.length;j++){const i=indices[j];x[j]=i/channel.sampleRate+offset;y[j]=channel.samples[i]*factor;}
    const value={x,y};cache.set(key,value);
    while(cache.size>limit)cache.delete(cache.keys().next().value);
    return value;
  };
}

export function displayPointBudget(width){
  return Math.max(2000,Math.min(16000,Math.ceil(width*4)));
}
