/* EDF calibration and elapsed-time operations; no network or patient identifiers. */
const ascii = new TextDecoder('windows-1252');
const utf8 = new TextDecoder('utf-8', {fatal:true});
export function readEDF(buffer, filename='recording.edf') {
  const bytes=new Uint8Array(buffer), view=new DataView(buffer);
  const field=(o,n)=>ascii.decode(bytes.subarray(o,o+n)).trim();
  const number=(o,n,integer=false)=>{
    const text=field(o,n); if(!text || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?$/.test(text)) throw Error('Invalid EDF numeric header.');
    const v=Number(text); if(!Number.isFinite(v)||(integer&&!Number.isSafeInteger(v))) throw Error('Invalid EDF numeric header.'); return v;
  };
  if(bytes.length<256||field(0,8)!=='0') throw Error('Not a supported EDF file. BDF is not supported.');
  const ns=number(252,4,true), header=number(184,8,true), declared=number(236,8,true), seconds=number(244,8), type=field(192,44);
  if(type.startsWith('EDF+D')) throw Error('Discontinuous EDF+D is not supported: gaps cannot be plotted as continuous time.');
  if(ns<1||header!==256*(ns+1)||bytes.length<header||seconds<=0||declared < -1) throw Error('Invalid or incomplete EDF header.');
  const signals=Array.from({length:ns},(_,i)=>({label:field(256+i*16,16)||`Channel ${i+1}`,unit:field(256+ns*96+i*8,8),
    physicalMin:number(256+ns*104+i*8,8),physicalMax:number(256+ns*112+i*8,8),digitalMin:number(256+ns*120+i*8,8,true),digitalMax:number(256+ns*128+i*8,8,true),
    prefilter:field(256+ns*136+i*80,80),count:number(256+ns*216+i*8,8,true)}));
  let recordBytes=0;
  for(const s of signals){if(s.count<=0)throw Error('Samples per record must be positive.');s.byteOffset=recordBytes;recordBytes+=s.count*2;}
  const payload=bytes.length-header, records=payload/recordBytes;
  if(payload<=0||!Number.isSafeInteger(records)||(declared!==-1&&declared!==records)) throw Error('File length does not match EDF header; it may be truncated.');
  const warnings=declared===-1?['Record count inferred from complete data records.']:[];
  const channels=signals.filter(s=>s.label!=='EDF Annotations');
  if(!channels.length)throw Error('No ordinary signal channels found.');
  for(const s of channels){
    if(s.physicalMax<=s.physicalMin||s.digitalMax<=s.digitalMin||s.digitalMin < -32768||s.digitalMax>32767)throw Error('Invalid amplitude calibration.');
    s.sampleRate=s.count/seconds;s.duration=records*seconds;if(!Number.isFinite(s.sampleRate)||!Number.isFinite(s.duration))throw Error("Invalid EDF timing.");s.samples=new Float64Array(records*s.count);s.limitSamples=0;
    const gain=(s.physicalMax-s.physicalMin)/(s.digitalMax-s.digitalMin);
    for(let r=0;r<records;r++)for(let j=0;j<s.count;j++){
      const d=view.getInt16(header+r*recordBytes+s.byteOffset+j*2,true);
      s.samples[r*s.count+j]=s.physicalMin+(d-s.digitalMin)*gain;
      if(d<=s.digitalMin||d>=s.digitalMax)s.limitSamples++;
    }
    if(!s.unit)warnings.push(`${s.label}: unspecified amplitude units.`);
    if(s.limitSamples)warnings.push(`${s.label}: ${s.limitSamples} samples reach calibration limits; inspect for clipping.`);
  }
  const annotations=[];let firstOnset=null;
  const annotationSignals=signals.filter(s=>s.label==='EDF Annotations');
  for(let r=0;r<records;r++)for(let ai=0;ai<annotationSignals.length;ai++){
    const s=annotationSignals[ai],offset=header+r*recordBytes+s.byteOffset;
    let content;try{content=utf8.decode(bytes.subarray(offset,offset+s.count*2));}catch{throw Error('Invalid UTF-8 EDF+ annotations.');}
    let recordOnset=null;
    for(const tal of content.split('\0').filter(Boolean)){
      const parts=tal.split('\x14'),timing=parts.shift().split('\x15'),onset=Number(timing[0]),duration=timing.length>1?Number(timing[1]):null;
      if(!/^[+-](?:\d+\.?\d*|\.\d+)$/.test(timing[0])||!Number.isFinite(onset)||(duration!==null&&(!Number.isFinite(duration)||duration<0)))throw Error('Invalid EDF+ annotation time.');
      if(recordOnset===null)recordOnset=onset;
      for(const description of parts.filter(Boolean))annotations.push({onset_s:onset,duration_s:duration,description});
    }
    if(type.startsWith('EDF+C')&&ai===0){
      if(recordOnset===null)throw Error('Missing EDF+C record timestamps.');
      if(firstOnset===null)firstOnset=recordOnset;
      if(Math.abs(recordOnset-firstOnset-r*seconds)>1e-6)throw Error('EDF+C timestamps contain gaps; discontinuous data is unsupported.');
    }
  }
  if(type.startsWith('EDF+C')&&!annotationSignals.length)throw Error('EDF+C annotation channel is missing.');
  const rawDate=field(168,8),rawTime=field(176,8),dm=rawDate.match(/^(\d{2})\.(\d{2})\.(\d{2})$/),tm=rawTime.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  let start='Unspecified';
  if(dm&&tm){const [,d,m,y]=dm;const year=+y>=85?1900+(+y):2000+(+y);start=`${year}-${m}-${d}T${tm[1]}:${tm[2]}:${tm[3]}`;}
  // EDF+ explicit year takes precedence; discard all remaining recording identifiers.
  const fullDate=field(88,80).match(/^Startdate (\d{2})-([A-Z]{3})-(\d{4})\b/);
  if(fullDate&&tm){const month=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(fullDate[2])+1;if(month)start=`${fullDate[3]}-${String(month).padStart(2,'0')}-${fullDate[1]}T${tm[1]}:${tm[2]}:${tm[3]}`;}
  return {filename,start,firstRecordOnset:firstOnset??0,channels,annotations,warnings};
}
export function voltageFactor(source,target){
  if(source===target)return 1;
  const norm=s=>s.trim().replace(/[µμ]/g,'u').toLowerCase(),scales={uv:-6,mv:-3,v:0};
  const a=scales[norm(source)],b=scales[norm(target)];if(a===undefined||b===undefined)throw Error(`Cannot convert ${source||'unspecified units'} to ${target||'unspecified units'}.`);return 10**(a-b);
}
export function bounds(traces){return [Math.min(...traces.map(t=>t.offset)),Math.max(...traces.map(t=>t.offset+t.channel.duration))];}
export function fitWindow(start,end,lower,upper){
  if(![start,end,lower,upper].every(Number.isFinite)||upper<=lower)throw Error('Invalid time bounds.');
  const width=Math.min(upper-lower,Math.max(1e-6,end-start));start=Math.max(lower,Math.min(start,upper-width));return [start,start+width];
}
export function sampleRange(channel,start,end,offset=0){return [Math.max(0,Math.min(channel.samples.length,Math.ceil((start-offset)*channel.sampleRate-1e-9))),Math.max(0,Math.min(channel.samples.length,Math.ceil((end-offset)*channel.sampleRate-1e-9)))];}
export function envelopeIndices(values,first=0,last=values.length,max=20000){
  if(last<=first)return [];
  if(last-first<=max)return Array.from({length:last-first},(_,i)=>first+i);
  const result=new Set([first,last-1]),bins=Math.floor(max/2)-1;
  for(let b=0;b<bins;b++){const a=first+Math.floor(b*(last-first)/bins),z=first+Math.floor((b+1)*(last-first)/bins);let lo=a,hi=a;for(let i=a+1;i<z;i++){if(values[i]<values[lo])lo=i;if(values[i]>values[hi])hi=i;}result.add(lo);result.add(hi);}
  return [...result].sort((a,b)=>a-b);
}
export function intervalMetrics(a,b){if(![a,b].every(Number.isFinite))throw Error('Ruler times must be finite.');const dt=Math.abs(b-a);return {a_s:a,b_s:b,interval_s:dt,interval_ms:dt*1000,reciprocal_hz:dt?1/dt:null};}
export function csvCell(value){const s=String(value);return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}
export function* csvRows(traces,start,end,unit){
  yield ['trace_id','source_filename','channel','sampling_hz','source_elapsed_time_s','comparison_time_s','time_shift_s',`amplitude_${unit||'unspecified'}`].map(csvCell).join(',')+'\r\n';
  for(const t of traces){const c=t.channel,[a,b]=sampleRange(c,start,end,t.offset),factor=voltageFactor(c.unit,unit);for(let i=a;i<b;i++)yield [t.id,t.filename,c.label,c.sampleRate,i/c.sampleRate,i/c.sampleRate+t.offset,t.offset,c.samples[i]*factor].map(csvCell).join(',')+'\r\n';}
}
