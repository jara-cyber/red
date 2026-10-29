'use strict';
(()=>{
const $=id=>document.getElementById(id),W=window.REDWireless;let rows=[];
const colors=['#4f8a70','#6984bb','#b38249','#9464ab','#c46765','#519da9'];
function status(text){$('wifi-status').textContent=text;}
function render(){
 const filter=$('wifi-search').value.toLowerCase(),band=$('wifi-band').value,sort=$('wifi-sort').value;
 let visible=rows.map((r,index)=>({...r,index})).filter(r=>(band==='all'||r.band===band)&&[r.ssid,r.bssid,r.security].join(' ').toLowerCase().includes(filter));
 visible.sort((a,b)=>sort==='channel'?a.channel-b.channel:sort==='name'?a.ssid.localeCompare(b.ssid):b.rssi-a.rssi);
 $('wifi-table').replaceChildren();
 for(const r of visible){const tr=document.createElement('tr');for(const text of [r.ssid,r.bssid||'No anotado',r.band+' GHz',r.channel,r.rssi+' dBm',r.security,'Introducido / importado']){const td=document.createElement('td');td.textContent=text;tr.append(td);}const td=document.createElement('td'),btn=document.createElement('button');btn.className='secondary';btn.textContent='Quitar';btn.setAttribute('aria-label','Quitar red '+r.ssid);btn.addEventListener('click',()=>{rows.splice(r.index,1);render();});td.append(btn);tr.append(td);$('wifi-table').append(tr);}
 $('wifi-empty').hidden=visible.length>0;$('wifi-total').textContent=rows.length+' redes anotadas';
 $('wifi-strongest').textContent=rows.length?[...rows].sort((a,b)=>b.rssi-a.rssi)[0].ssid:'Sin datos';
 $('wifi-open').textContent=rows.filter(r=>r.security==='Abierta').length+' anotadas como abiertas';
 $('wifi-analysis').replaceChildren();
 if(rows.some(r=>r.band==='2.4')){
  for(const r of W.overlap24(rows)){const div=document.createElement('div');div.className='channel-score';const label=document.createElement('strong');label.textContent='Canal '+r.channel;const text=document.createElement('span');text.textContent=r.count+' registros con solapamiento geométrico';div.append(label,text);$('wifi-analysis').append(div);}
 }else $('wifi-analysis').textContent='Añade registros de 2,4 GHz para comparar los canales 1, 6 y 11.';
 draw();
}
function draw(){
 const band=$('chart-band').value,svg=$('channel-chart'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const data=rows.filter(r=>r.band===band),min=band==='2.4'?2398:5160,max=band==='2.4'?2486:5845;
 const x=f=>60+(f-min)/(max-min)*700,y=rssi=>25+(0-rssi)/120*210;
 const add=(name,attrs,text)=>{const e=document.createElementNS(ns,name);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e;};
 for(const rssi of [0,-30,-60,-90,-120]){add('line',{x1:60,x2:760,y1:y(rssi),y2:y(rssi),stroke:'currentColor',opacity:'.15'});add('text',{x:3,y:y(rssi)+4,fill:'currentColor','font-size':11},rssi+' dBm');}
 const channels=band==='2.4'?Array.from({length:13},(_,i)=>i+1):[36,64,100,128,149,165];
 for(const c of channels){const f=band==='2.4'?2407+5*c:5000+5*c;add('text',{x:x(f),y:260,fill:'currentColor','font-size':11,'text-anchor':'middle'},c);}
 data.forEach((r,i)=>{const f=band==='2.4'?2407+5*r.channel:5000+5*r.channel;const path=add('path',{d:'M '+x(f-10)+' '+y(-120)+' L '+x(f-7)+' '+y(r.rssi)+' L '+x(f+7)+' '+y(r.rssi)+' L '+x(f+10)+' '+y(-120)+' Z',fill:colors[i%colors.length],'fill-opacity':'.14',stroke:colors[i%colors.length],'stroke-width':2});const title=document.createElementNS(ns,'title');title.textContent=r.ssid+' · canal '+r.channel+' · '+r.rssi+' dBm · manual · esquema 20 MHz';path.append(title);add('text',{x:x(f),y:Math.max(14,y(r.rssi)-6),fill:colors[i%colors.length],'font-size':10,'text-anchor':'middle'},r.ssid.slice(0,15));});
 if(!data.length)add('text',{x:410,y:125,fill:'currentColor','font-size':14,'text-anchor':'middle'},'Sin mediciones introducidas en esta banda');
}
$('wifi-form').addEventListener('submit',e=>{e.preventDefault();try{if(rows.length>=100)throw new Error('Máximo 100 registros.');const r=W.validate({ssid:$('wifi-ssid').value,band:$('wifi-input-band').value,channel:$('wifi-channel').value,rssi:$('wifi-rssi').value,bssid:$('wifi-bssid').value,security:$('wifi-security').value});rows.push(r);render();status('Medición manual añadida; no confirma que la red esté visible ahora.');}catch(err){status(err.message);}});
for(const id of ['wifi-search','wifi-band','wifi-sort'])$(id).addEventListener(id==='wifi-search'?'input':'change',render);
$('chart-band').addEventListener('change',draw);
$('wifi-import').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100000)throw new Error('Máximo 100 KB por CSV.');const imported=W.parseCSV(await file.text());if(rows.length+imported.length>100)throw new Error('La suma supera 100 registros. Quita algunos o limpia el análisis.');rows.push(...imported);render();status(imported.length+' mediciones importadas. Comprueba cuándo y dónde se tomaron.');}catch(err){status(err.message);}finally{e.target.value='';}});
function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('wifi-template').addEventListener('click',()=>download('red-plantilla-wifi.csv','ssid,band,channel,rssi,bssid,security\r\n'));
$('wifi-export').addEventListener('click',()=>{if(!rows.length)return status('No hay mediciones para exportar.');download('red-mediciones-wifi.csv',window.REDUtils.csv([['ssid','band','channel','rssi','bssid','security'],...rows.map(r=>[r.ssid,r.band,r.channel,r.rssi,r.bssid,r.security])]));status('Exportado. El archivo contiene SSID y BSSID anotados; compártelo solo si quieres revelarlos.');});
$('wifi-clear').addEventListener('click',()=>{if(confirm('¿Borrar las mediciones wifi de esta sesión?')){rows=[];render();status('Análisis wifi vaciado.');}});
render();
})();
