import {readEDF} from './edf.mjs';
self.onmessage=({data})=>{
  try {const recording=readEDF(data.buffer,data.filename);self.postMessage({id:data.id,recording},recording.channels.map(c=>c.samples.buffer));}
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
