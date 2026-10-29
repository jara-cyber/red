'use strict';
(()=>{
const el=id=>document.getElementById(id),U=window.REDUtils;
let samples=[],timer=null,testing=false,cancel=false;
const storeKey='red-analyzer-history-v1';
function notice(text){el('analyzer-status').textContent=text;}
function save(){if(el('remember-history').checked){try{localStorage.setItem(storeKey,JSON.stringify(samples.slice(-100)));}catch(_){notice('No se puede guardar el historial en este navegador.');}}}
const round=n=>Math.round(n)+' ms';
function graph(){
 const svg=el('response-chart');svg.replaceChildren();
 const ns='http://www.w3.org/2000/svg',add=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text)e.textContent=text;svg.append(e);return e;};
 const data=samples.slice(-30),max=Math.max(100,...data.map(s=>s.ms||0));
 for(let i=0;i<4;i++){const y=25+i*55;add('line',{x1:55,x2:780,y1:y,y2:y,stroke:'currentColor',opacity:.12});add('text',{x:2,y:y+4,fill:'currentColor','font-size':11},Math.round(max*(1-i/3))+' ms');}
 let line=[];
 data.forEach((s,i)=>{const x=60+i*715/Math.max(1,data.length-1),y=s.ms===null?190:190-s.ms/max*165;
  if(s.ms===null){if(line.length)add('polyline',{points:line.join(' '),fill:'none',stroke:'#6b9643','stroke-width':3});line=[];add('text',{x,y:212,fill:'#b36752','font-size':15},'×');}
  else{line.push(x+','+y);const dot=add('circle',{cx:x,cy:y,r:4,fill:'#6b9643'});const title=document.createElementNS(ns,'title');title.textContent=new Date(s.at).toLocaleTimeString()+' · '+round(s.ms)+' · '+s.label;dot.append(title);}
 });
 if(line.length)add('polyline',{points:line.join(' '),fill:'none',stroke:'#6b9643','stroke-width':3});
 if(!data.length)add('text',{x:400,y:115,'text-anchor':'middle',fill:'currentColor','font-size':14},'Ejecuta una medición para ver la gráfica');
}
function render(){
 const valid=samples.filter(s=>s.ms!==null),stats=U.stats(valid.map(s=>s.ms));
 for(const [id,key]of [['metric-min','min'],['metric-avg','mean'],['metric-max','max'],['metric-variation','variation']])el(id).textContent=stats&&stats[key]!==null?round(stats[key]):'—';
 el('metric-failed').textContent=samples.length?samples.filter(s=>s.ms===null).length+' / '+samples.length:'—';
 el('sample-count').textContent=samples.length+' muestras';
 el('sample-list').replaceChildren();
 for(const s of [...samples].reverse().slice(0,15)){
  const tr=document.createElement('tr');for(const value of [new Date(s.at).toLocaleString('es-ES'),s.label,s.ms===null?'Solicitud fallida':round(s.ms)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}el('sample-list').append(tr);
 }
 graph();
}
async function measure(){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000),start=performance.now();let ms=null;
 try{const url=new URL('./probe.txt',location.href);url.searchParams.set('sample',Date.now()+'-'+Math.random());const r=await fetch(url,{cache:'no-store',credentials:'omit',signal:controller.signal});if(!r.ok||(await r.text()).trim()!=='red-network-probe-v1')throw new Error('invalid');ms=performance.now()-start;}catch(_){}finally{clearTimeout(timeout);}
 samples.push({at:Date.now(),ms,label:el('sample-label').value.trim()||'Sin ubicación'});samples=samples.slice(-100);save();render();return ms;
}
function state(){el('monitor').textContent=timer?'Detener monitor':'Monitor cada 15 s';el('run-series').disabled=testing;}
async function series(){
 if(testing)return;testing=true;cancel=false;state();el('stop-series').hidden=false;
 for(let i=0;i<10&&!cancel;i++){notice('Serie HTTP: muestra '+(i+1)+' de 10…');await measure();}
 testing=false;el('stop-series').hidden=true;state();notice(cancel?'Serie detenida; se conservan las muestras completadas.':'Serie terminada. Los fallos HTTP no equivalen a pérdida de paquetes wifi.');
}
el('run-series').addEventListener('click',series);
el('stop-series').addEventListener('click',()=>{cancel=true;notice('Deteniendo después de la solicitud actual…');});
el('monitor').addEventListener('click',()=>{
 if(timer){clearInterval(timer);timer=null;notice('Monitor detenido.');}
 else{timer=setInterval(async()=>{if(document.hidden||testing)return;testing=true;state();try{await measure();}finally{testing=false;state();}},15000);notice('Monitor activo cada 15 segundos, solo con esta página visible.');}state();
});
document.addEventListener('visibilitychange',()=>{if(timer)notice(document.hidden?'Monitor en pausa: página no visible.':'Monitor activo; próxima muestra en un máximo de 15 segundos.');});
el('remember-history').addEventListener('change',()=>{if(el('remember-history').checked){save();notice('Se guardarán hasta 100 muestras en este navegador.');}else{try{localStorage.removeItem(storeKey);notice('Historial persistente eliminado; las muestras de esta sesión siguen visibles.');}catch(_){notice('No se pudo borrar el historial guardado.');}}});
el('clear-history').addEventListener('click',()=>{if(confirm('¿Borrar todas las muestras de respuesta HTTP?')){samples=[];try{localStorage.removeItem(storeKey);}catch(_){}render();notice('Muestras borradas.');}});
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
el('export-csv').addEventListener('click',()=>{if(!samples.length)return notice('Realiza una medición antes de exportar.');download('red-respuesta-http.csv',U.csv([['Fecha ISO','Ubicación manual','Respuesta HTTP ms','Resultado'],...samples.map(s=>[new Date(s.at).toISOString(),s.label,s.ms===null?'':Math.round(s.ms),s.ms===null?'Fallo HTTP':'OK'])]),'text/csv;charset=utf-8');});
el('subnet-form').addEventListener('submit',e=>{e.preventDefault();try{const r=U.subnet(el('cidr').value);el('subnet-result').replaceChildren();for(const [label,value]of [['Red',r.network],['Máscara',r.mask],['Broadcast',r.broadcast],['Primera dirección utilizable',r.first],['Última dirección utilizable',r.last],['Direcciones utilizables',r.hosts.toLocaleString('es-ES')]]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);el('subnet-result').append(row);}}catch(error){el('subnet-result').textContent=error.message;}});
el('inventory-search').addEventListener('input',()=>{const q=el('inventory-search').value.trim().toLowerCase();for(const row of el('manual-devices').rows)row.hidden=!row.textContent.toLowerCase().includes(q);});
el('export-inventory').addEventListener('click',()=>{try{const data=JSON.parse(localStorage.getItem('red-manual-network-v1')||'null');if(!data)return notice('No hay inventario manual guardado para exportar.');download('red-inventario-manual.json',JSON.stringify({exportedAt:new Date().toISOString(),source:'manual-not-scanned',...data},null,2),'application/json');notice('Inventario exportado. El archivo contiene los datos manuales de tu red.');}catch(_){notice('No se pudo leer el inventario.');}});
el('theme').addEventListener('click',()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';el('theme').setAttribute('aria-pressed',String(dark));el('theme').textContent=dark?'Modo claro':'Modo oscuro';try{localStorage.setItem('red-theme',dark?'dark':'light');}catch(_){}});
try{if(localStorage.getItem('red-theme')==='dark'){document.documentElement.dataset.theme='dark';el('theme').textContent='Modo claro';el('theme').setAttribute('aria-pressed','true');}const saved=JSON.parse(localStorage.getItem(storeKey)||'null');if(Array.isArray(saved)){samples=saved.filter(s=>s&&typeof s.at==='number'&&Number.isFinite(s.at)&&typeof s.label==='string'&&s.label.length<=80&&(s.ms===null||(Number.isFinite(s.ms)&&s.ms>=0))).slice(-100);el('remember-history').checked=true;}}catch(_){}
// Site-survey measurements are explicitly entered by the user, never inferred from HTTP.
let survey=[];
el('survey-form').addEventListener('submit',e=>{e.preventDefault();const place=el('survey-place').value.trim(),signal=Number(el('survey-rssi').value);if(!place||!Number.isFinite(signal)||signal>0||signal< -120)return;survey.push({place,signal});survey=survey.slice(-20);el('survey-results').replaceChildren();for(const s of survey){const row=document.createElement('div');row.className='survey-row';const name=document.createElement('span');name.textContent=s.place;const bar=document.createElement('meter');bar.min=-120;bar.max=0;bar.value=s.signal;bar.setAttribute('aria-label','Señal manual de '+s.place);const value=document.createElement('strong');value.textContent=s.signal+' dBm · manual';row.append(name,bar,value);el('survey-results').append(row);}el('survey-empty').hidden=true;el('survey-form').reset();});
el('clear-survey').addEventListener('click',()=>{survey=[];el('survey-results').replaceChildren();el('survey-empty').hidden=false;});
render();state();
})();
