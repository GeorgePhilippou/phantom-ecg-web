import {voltageFactor,bounds,fitWindow,sampleRange,envelopeIndices,intervalMetrics,csvRows} from './edf.mjs';
const $=id=>document.getElementById(id), version='browser-1.0.0';
const state={files:[],start:0,end:10,mode:'Overlay',errors:[],generation:0,busy:false};
const light=['#167a95','#e47932','#8d55b0','#21916a','#cb4f6c','#80752b','#5278cf','#af602e'];
const night=['#64d4e8','#ffb36b','#c39af0','#65dbad','#ff8eaa','#ddd176','#91b4ff','#e7af83'];
const safe=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const isVoltage=u=>{try{voltageFactor(u,'mV');return true;}catch{return false;}};
const colour=(t)=>($('dark').checked?night:light)[t.colour%light.length];
function notice(text){$('status').textContent=text;}
function fail(error){notice(error.message||String(error));}
function visible(){return state.files.filter(f=>f.visible).map(f=>({...f,channel:f.recording.channels[f.channelIndex]}));}
function compatible(){return visible().filter(t=>{try{voltageFactor(t.channel.unit,$('unit').value);return true;}catch{return false;}});}
function units(){const traces=visible(),previous=$('unit').value,base=traces[0]?.channel.unit;let options;
  if(base===undefined)options=['mV','µV','V'];else if(isVoltage(base))options=['mV','µV','V'];else options=[base];
  $('unit').replaceChildren(...options.map(u=>new Option(u||'Unspecified',u)));$('unit').value=options.includes(previous)?previous:options[0];state.displayUnit=$('unit').value;
  if(previous!==$('unit').value){try{const factor=voltageFactor(previous,$('unit').value);$('ymin').value=Number($('ymin').value)*factor;$('ymax').value=Number($('ymax').value)*factor;}catch{$('ymin').value=-1;$('ymax').value=1;}}
}
function setWindow(a,b,reset=true){const traces=compatible();if(!traces.length){requestRender();return;}
  const [lower,upper]=bounds(traces);[state.start,state.end]=fitWindow(a,b,lower,upper);if(reset)state.generation++;syncWindow();requestRender();
}
function syncWindow(){const traces=compatible();if(traces.length){const [lower,upper]=bounds(traces);for(const id of ['range-start','range-end']){$(id).min=lower;$(id).max=upper;}}for(const [id,value] of [['start',state.start],['end',state.end],['range-start',state.start],['range-end',state.end]])$(id).value=Number(value.toFixed(9));}
function make(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function fileControls(){const root=$('file-controls');root.replaceChildren();
  for(const f of state.files){const section=make('details'),summary=make('summary'),title=make('div',undefined,'file-title'),label=make('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=f.visible;checkbox.setAttribute('aria-label',`Show ${f.filename}`);label.append(checkbox,document.createTextNode(' '+f.filename));title.append(label);summary.append(title);section.append(summary);
    checkbox.onclick=e=>e.stopPropagation();checkbox.onchange=()=>{f.visible=checkbox.checked;units();setWindow(state.start,state.end);};
    const channelLabel=make('label','Channel'),select=make('select');select.setAttribute('aria-label',`Channel for ${f.filename}`);f.recording.channels.forEach((c,i)=>select.add(new Option(`${c.label} (${c.unit||'unspecified'})`,i)));select.value=f.channelIndex;
    select.onchange=()=>{f.channelIndex=Number(select.value);units();setWindow(state.start,state.end);};channelLabel.append(select);section.append(channelLabel);
    const offsetLabel=make('label','Time shift (s)'),input=make('input');input.type='number';input.step='0.1';input.value=f.offset;input.setAttribute('aria-label',`Time shift for ${f.filename}`);input.oninput=()=>{const value=input.valueAsNumber;if(Number.isFinite(value)){f.offset=value;setWindow(state.start,state.end);}};input.onchange=()=>{const value=input.valueAsNumber;if(!Number.isFinite(value)){input.value=f.offset;notice('Time shifts must be finite.');return;}f.offset=value;setWindow(state.start,state.end);};offsetLabel.append(input);section.append(offsetLabel);
    const remove=make('button','Remove recording','wide');remove.onclick=()=>{state.files=state.files.filter(x=>x.id!==f.id);fileControls();units();setWindow(state.start,state.end);};section.append(remove);root.append(section);
  }
}
let serial=0;
function parseFile(buffer,filename){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error)):resolve(data.recording);};worker.onerror=()=>{worker.terminate();reject(Error('The EDF reader could not run. Reload the page and try again.'));};worker.postMessage({id:++serial,buffer,filename},[buffer]);});}
async function addFiles(files){if(state.busy)return;state.busy=true;$('files').disabled=true;$('demo').disabled=true;state.errors=[];
  try{for(const file of files){try{
    if(!/\.edf$/i.test(file.name))throw Error('Choose an EDF file.');
    if(file.size>100*1024*1024)throw Error('This file exceeds the 100 MB browser limit. Use the Python viewer for larger recordings.');
    if(file.size+state.files.reduce((sum,f)=>sum+f.bytes,0)>200*1024*1024)throw Error('The selected files exceed the 200 MB total limit. Remove a recording first.');
    notice(`Reading ${file.name} locally…`);const buffer=await file.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(state.files.some(f=>f.digest===digest&&f.filename===file.name))continue;
    const recording=await parseFile(buffer,file.name);state.files.push({id:`trace-${++serial}`,filename:file.name,recording,digest,bytes:file.size,channelIndex:0,offset:0,visible:true,colour:serial});
  }catch(error){state.errors.push(`${file.name}: ${error.message}`);}}
  fileControls();units();const traces=compatible();if(traces.length){[state.start,state.end]=bounds(traces);$('a').value=state.start;$('b').value=state.end;state.generation++;syncWindow();}notice(state.files.length?'Recordings opened locally. No data was uploaded.':'No recordings could be opened.');requestRender();
  }finally{state.busy=false;$('files').disabled=false;$('demo').disabled=false;$('files').value='';}
}
function demo(){const rate=1024,duration=20,samples=new Float64Array(rate*duration);
  for(let i=0;i<samples.length;i++){const phase=(i/rate)%1;const g=(centre,width)=>Math.exp(-.5*((phase-centre)/width)**2);samples[i]=.1*g(.18,.035)-.12*g(.37,.012)+1.05*g(.4,.009)-.3*g(.425,.013)+.25*g(.66,.065)+.02*Math.sin(i/rate*2*Math.PI*.2);}
  state.files.push({id:`demo-${++serial}`,filename:'Synthetic ECG · 1 Hz (not experimental data)',bytes:0,digest:null,recording:{start:'Synthetic',firstRecordOnset:0,channels:[{label:'Synthetic ECG',unit:'mV',sampleRate:rate,duration,samples,prefilter:'None',limitSamples:0,physicalMin:-2,physicalMax:2}],annotations:[],warnings:['Synthetic demonstration only; no electrode-performance conclusions.']},channelIndex:0,offset:0,visible:true,colour:serial});fileControls();units();setWindow(0,10);notice('Synthetic 1 Hz ECG. Open your own EDF to inspect experimental data.');}
function ruler(){return $('ruler').checked?intervalMetrics($('a').valueAsNumber,$('b').valueAsNumber):null;}
function gridAxes(range){const dark=$('dark').checked;return {range,showgrid:$('grid').checked,gridcolor:dark?'#344353':'#e3ebef',zeroline:$('grid').checked,zerolinecolor:dark?'#526478':'#cbd6dc',automargin:true};}
function traceData(t,start,end,max,row=0,overview=false){const c=t.channel,[a,b]=sampleRange(c,start,end,t.offset),indices=envelopeIndices(c.samples,a,b,max),factor=voltageFactor(c.unit,$('unit').value);
  return {x:indices.map(i=>i/c.sampleRate+t.offset),y:indices.map(i=>c.samples[i]*factor),name:safe(`${t.filename} · ${c.label}`),type:'scatter',mode:'lines+markers',marker:{size:5,opacity:0},selected:{marker:{opacity:0}},unselected:{marker:{opacity:0}},line:{color:colour(t),width:overview?.8:1.3},xaxis:row?'x'+(row+1):'x',yaxis:row?'y'+(row+1):'y',hovertemplate:`%{x:.6f} s<br>%{y:.6f} ${safe($('unit').value)}<extra>%{fullData.name}</extra>`};}
function layoutFor(traces,measurement){const dark=$('dark').checked,bg=dark?'#111820':'#fff',text=dark?'#e5edf5':'#193743',stacked=state.mode==='Stacked',n=Math.max(1,traces.length),height=stacked?Math.max(570,n*250):600;
  const layout={height,paper_bgcolor:bg,plot_bgcolor:bg,font:{color:text,family:'system-ui, Segoe UI, sans-serif'},margin:{l:65,r:20,t:45,b:55},dragmode:'zoom',hovermode:'closest',showlegend:!stacked,legend:{orientation:'h',y:1.1},uirevision:`${state.generation}-${state.mode}-${$('unit').value}-${$('fixed').checked}-${$('ymin').value}-${$('ymax').value}`,shapes:[],annotations:[]};
  for(let row=0;row<(stacked?n:1);row++){const suffix=row?row+1:'',axis='y'+suffix,xaxis='x'+suffix,key='yaxis'+suffix,xkey='xaxis'+suffix;layout[xkey]={...gridAxes([state.start,state.end]),anchor:axis,title:row===(stacked?n-1:0)?{text:'Comparison time (s)'}:undefined,matches:row?'x':undefined};layout[key]={...gridAxes($('fixed').checked?[$('ymin').valueAsNumber,$('ymax').valueAsNumber]:undefined),anchor:xaxis,title:{text:`Amplitude (${$('unit').value||'unspecified'})`},domain:stacked?[1-(row+1)/n+.06/n,1-row/n-.04/n]:[0,1]};
    if(stacked)layout.annotations.push({x:0,y:layout[key].domain[1],xref:'paper',yref:'paper',text:safe(`${traces[row]?.filename||''} · ${traces[row]?.channel.label||''}`),showarrow:false,xanchor:'left',yanchor:'bottom',font:{size:12,color:text}});
    if(measurement)for(const [name,x,color] of [['A',measurement.a_s,dark?'#ff8eaa':'#b54465'],['B',measurement.b_s,dark?'#c39af0':'#6a4ab4']])if(x>=state.start&&x<=state.end){layout.shapes.push({type:'line',x0:x,x1:x,y0:0,y1:1,xref:xaxis,yref:axis+' domain',line:{color,width:1.7,dash:'dash'}});layout.annotations.push({x,y:1,xref:xaxis,yref:axis+' domain',text:name,showarrow:false,yanchor:'bottom',font:{color}});}
  }return layout;
}
const config=()=>({responsive:true,displaylogo:false,scrollZoom:$('wheel').checked,modeBarButtonsToRemove:['select2d','lasso2d'],toImageButtonOptions:{filename:'ecg_comparison',scale:2}});
let rendering=false,pending=false;
function requestRender(){pending=true;if(!rendering)void renderLoop();}
async function renderLoop(){rendering=true;try{while(pending){pending=false;await render();}}catch(error){fail(error);}finally{rendering=false;}}
async function render(){for(const id of ['csv','png','json'])$(id).disabled=true;document.body.classList.toggle('dark',$('dark').checked);$('scale').hidden=!$('fixed').checked;$('ruler-controls').hidden=!$('ruler').checked;
  const candidates=visible(),traces=compatible(),excluded=candidates.filter(t=>!traces.some(x=>x.id===t.id));const messages=[...state.errors,...excluded.map(t=>`${t.filename}: incompatible amplitude units (${t.channel.unit||'unspecified'}); excluded from this comparison.`)];
  $('errors').replaceChildren(...messages.map(m=>make('p',m)));
  const validScale=!$('fixed').checked||Number.isFinite($('ymin').valueAsNumber)&&Number.isFinite($('ymax').valueAsNumber)&&$('ymax').valueAsNumber>$('ymin').valueAsNumber;
  if(!validScale){state.controlsInvalid=true;notice('Maximum amplitude must be finite and greater than minimum.');return;}
  let measurement;try{measurement=ruler();}catch(error){state.controlsInvalid=true;notice(error.message);return;}
  if(state.controlsInvalid){notice('');state.controlsInvalid=false;}
  $('measurement').hidden=!measurement;
  if(measurement){const frequency=measurement.reciprocal_hz===null?'undefined (A = B)':`${Number(measurement.reciprocal_hz.toPrecision(7))} Hz`;
    $('measurement').textContent=`Time ruler · A ${measurement.a_s.toFixed(6)} s · B ${measurement.b_s.toFixed(6)} s · Δt ${measurement.interval_s.toFixed(6)} s (${measurement.interval_ms.toFixed(3)} ms) · 1/Δt ${frequency}`;
    if(measurement.a_s<state.start||measurement.a_s>state.end||measurement.b_s<state.start||measurement.b_s>state.end)$('measurement').append(make('small',' — Cursor outside the selected window; navigate or reset the ruler.'));
  }
  const data=traces.map((t,i)=>traceData(t,state.start,state.end,60000,state.mode==='Stacked'?i:0));const samples=traces.reduce((sum,t)=>{const[a,b]=sampleRange(t.channel,state.start,state.end,t.offset);return sum+Math.max(0,b-a);},0);
  for(const id of ['csv','png','json'])$(id).disabled=!samples;
  for(const id of ['full','ten','prev','next','start','end','apply-window','range-start','range-end'])$(id).disabled=!traces.length;
  $('summary').textContent=traces.length?`${state.mode} · ${traces.length} trace(s) · ${Number(state.start.toFixed(6))}–${Number(state.end.toFixed(6))} s · ${$('unit').value||'unspecified units'}${samples?'':' · No samples in this window'}`:'Open an EDF recording or try the synthetic example. Select at least one recording to display it.';
  $('plot').style.height=layoutFor(traces,measurement).height+'px';await Plotly.react('plot',data,layoutFor(traces,measurement),config());
  const p=$('plot');if(!p._ecgClick){p.on('plotly_click',event=>{if(!$('ruler').checked||!event.points?.length)return;const target=document.querySelector('input[name=target]:checked').value;$(target.toLowerCase()).value=event.points[0].x;document.querySelector(`input[name=target][value="${target==='A'?'B':'A'}"]`).checked=true;requestRender();});p._ecgClick=true;}
  if(traces.length){const[lower,upper]=bounds(traces);for(const id of ['range-start','range-end']){$(id).min=lower;$(id).max=upper;}$('prev').disabled=state.start<=lower+1e-9;$('next').disabled=state.end>=upper-1e-9;
    const bg=$('dark').checked?'#111820':'#fff',text=$('dark').checked?'#e5edf5':'#193743';
    await Plotly.react('overview',traces.map(t=>traceData(t,lower,upper,5000,0,true)),{height:180,paper_bgcolor:bg,plot_bgcolor:bg,font:{color:text},margin:{l:65,r:20,t:10,b:45},showlegend:false,dragmode:'select',selectdirection:'h',xaxis:{...gridAxes([lower,upper]),title:{text:'Recording overview · comparison time (s)'}},yaxis:gridAxes(),shapes:[{type:'rect',x0:state.start,x1:state.end,y0:0,y1:1,yref:'paper',fillcolor:'#d8a34a',opacity:.2,line:{width:0}}],selections:[]},{responsive:true,displaylogo:false,scrollZoom:false,modeBarButtonsToRemove:['zoom2d','pan2d','zoomIn2d','zoomOut2d','autoScale2d','lasso2d']});
    const o=$('overview');if(!o._ecgSelect){o.on('plotly_selected',event=>{const range=event?.range?.x;if(range&&range[1]>range[0])setWindow(range[0],range[1]);});o._ecgSelect=true;}
  }else{Plotly.purge('overview');}
  const details=$('details');details.replaceChildren();for(const t of candidates){const c=t.channel,[a,b]=sampleRange(c,state.start,state.end,t.offset);let min=Infinity,max=-Infinity;for(let i=a;i<b;i++){min=Math.min(min,c.samples[i]);max=Math.max(max,c.samples[i]);}
    const section=make('section');section.append(make('h3',`${t.filename} · ${c.label}`));section.append(make('p',`${c.sampleRate} Hz · ${c.samples.length.toLocaleString()} samples · ${c.duration} s · ${c.unit||'unspecified units'} · shift ${t.offset} s`));section.append(make('p',`Start: ${t.recording.start} (timezone unspecified) · Declared filter: ${c.prefilter||'unspecified'}`));
    if(b>a)section.append(make('p',`Window: ${b-a} samples · min ${min.toPrecision(7)} · max ${max.toPrecision(7)} · peak-to-peak ${(max-min).toPrecision(7)} ${c.unit||''} (stored units)`));for(const w of t.recording.warnings)section.append(make('p',w,'muted'));
    if(t.recording.annotations.length){const table=make('table');const head=make('tr');for(const text of ['Original onset (s)','Duration (s)','Annotation'])head.append(make('th',text));table.append(head);for(const note of t.recording.annotations){const row=make('tr');for(const value of [note.onset_s,note.duration_s??'',note.description])row.append(make('td',value));table.append(row);}section.append(table);}details.append(section);
  }
}
function download(blob,filename){const url=URL.createObjectURL(blob),a=make('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function metadata(){return {viewer_version:version,appearance:$('dark').checked?'dark':'light',view:state.mode,window_start_s_inclusive:state.start,window_end_s_exclusive:state.end,export_unit:$('unit').value,time_ruler:ruler(),time_reference:"Each file's first sample is zero, plus its explicit time shift",additional_processing:'None; no resampling, filtering or amplitude offsets',traces:compatible().map(t=>({trace_id:t.id,filename:t.filename,channel:t.channel.label,source_sha256:t.digest,sampling_hz:t.channel.sampleRate,stored_unit:t.channel.unit,time_shift_s:t.offset,declared_prefilter:t.channel.prefilter,recording_start_timezone_unspecified:t.recording.start,first_record_onset_s:t.recording.firstRecordOnset,synthetic:t.digest===null}))};}
$('files').onchange=e=>void addFiles(e.target.files);
$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('over');};$('drop').ondragleave=()=>$('drop').classList.remove('over');$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('over');void addFiles(e.dataTransfer.files);};
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());$('demo').onclick=demo;
try{$('dark').checked=localStorage.getItem('phantom-ecg-dark')==='true';}catch{}$('dark').onchange=()=>{try{localStorage.setItem('phantom-ecg-dark',$('dark').checked);}catch{}requestRender();};
for(const id of ['grid','wheel','fixed','ruler'])$(id).onchange=requestRender;
for(const id of ['ymin','ymax','a','b'])$(id).oninput=requestRender;
$('unit').onchange=()=>{const previous=state.displayUnit||'mV';try{const f=voltageFactor(previous,$('unit').value);$('ymin').value=$('ymin').valueAsNumber*f;$('ymax').value=$('ymax').valueAsNumber*f;}catch{}state.displayUnit=$('unit').value;state.generation++;requestRender();};
for(const el of document.querySelectorAll('input[name=view]'))el.onchange=()=>{state.mode=el.value;state.generation++;requestRender();};
function applyWindow(){const a=$('start').valueAsNumber,b=$('end').valueAsNumber;if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a){notice('Enter finite start/end times, with end after start.');return;}setWindow(a,b);}
$('apply-window').onclick=applyWindow;
for(const id of ['start','end'])$(id).onkeydown=e=>{if(e.key==='Enter')applyWindow();};
$('range-start').oninput=()=>setWindow(Number($('range-start').value),state.end);$('range-end').oninput=()=>setWindow(state.start,Number($('range-end').value));
$('full').onclick=()=>{const t=compatible();if(t.length)setWindow(...bounds(t));};$('ten').onclick=()=>setWindow(state.start,state.start+10);$('prev').onclick=()=>{const w=state.end-state.start;setWindow(state.start-w,state.end-w);};$('next').onclick=()=>{const w=state.end-state.start;setWindow(state.start+w,state.end+w);};
$('reset-ruler').onclick=()=>{$('a').value=state.start;$('b').value=state.end;document.querySelector('input[name=target][value=A]').checked=true;requestRender();};
$('csv').onclick=()=>{try{const chunks=[];let part='';for(const row of csvRows(compatible(),state.start,state.end,$('unit').value)){part+=row;if(part.length>1024*1024){chunks.push(part);part='';}}chunks.push(part);download(new Blob(chunks,{type:'text/csv;charset=utf-8'}),'ecg_comparison.csv');}catch(error){fail(error);}};
$('json').onclick=()=>{try{download(new Blob([JSON.stringify(metadata(),null,2)],{type:'application/json'}),'ecg_comparison_metadata.json');}catch(error){fail(error);}};
$('png').onclick=async()=>{const node=make('div');Object.assign(node.style,{position:'absolute',left:'-20000px',width:'1200px'});document.body.append(node);try{const traces=compatible(),measurement=ruler(),layout=layoutFor(traces,measurement);layout.width=1200;layout.uirevision=undefined;layout.annotations.push({xref:'paper',yref:'paper',x:0,y:1.18,xanchor:'left',showarrow:false,text:measurement?`Δt ${measurement.interval_s.toFixed(6)} s · 1/Δt ${measurement.reciprocal_hz===null?'undefined':measurement.reciprocal_hz.toPrecision(6)+' Hz'}`:'Selected comparison window'});layout.margin.t=85;await Plotly.newPlot(node,traces.map((t,i)=>traceData(t,state.start,state.end,60000,state.mode==='Stacked'?i:0)),layout,{staticPlot:true});const data=await Plotly.toImage(node,{format:'png',width:1200,height:layout.height,scale:2});const a=make('a');a.href=data;a.download='ecg_comparison.png';a.click();}catch(error){fail(error);}finally{Plotly.purge(node);node.remove();}};
requestRender();
