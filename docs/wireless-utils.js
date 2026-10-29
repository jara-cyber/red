(function(root){'use strict';
const channels5=[36,40,44,48,52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,144,149,153,157,161,165];
function validate(row){
 if(!row || typeof row.ssid!=='string' || !row.ssid.trim() || row.ssid.length>80)throw new Error('Cada red necesita un SSID de hasta 80 caracteres.');
 const band=String(row.band),channel=Number(row.channel),rssi=Number(row.rssi);
 if(!['2.4','5'].includes(band))throw new Error('Banda válida: 2.4 o 5 GHz.');
 if(!Number.isInteger(channel)||(band==='2.4'?channel<1||channel>13:!channels5.includes(channel)))throw new Error('Canal no compatible con esta vista de 2,4/5 GHz.');
 if(row.rssi===''||!Number.isFinite(rssi)||rssi< -120||rssi>0)throw new Error('RSSI válido: entre -120 y 0 dBm.');
 const bssid=String(row.bssid||'').replace(/-/g,':').toUpperCase();
 if(bssid&&!/^(?:[A-F0-9]{2}:){5}[A-F0-9]{2}$/.test(bssid))throw new Error('BSSID no válido.');
 const security=String(row.security||'Desconocida');if(!['WPA2','WPA3','WPA2/WPA3','Abierta','Desconocida'].includes(security))throw new Error('Seguridad válida: WPA2, WPA3, WPA2/WPA3, Abierta o Desconocida.');
 return {ssid:row.ssid.trim(),band,channel,rssi,bssid,security};
}
function parseCSV(text){
 const rows=[];let row=[],field='',quoted=false,closed=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
  else if(c==='"'){if(field||closed)throw new Error('Comillas CSV no válidas.');quoted=true;}
  else if(c===','||c==='\n'||c==='\r'){row.push(field);field='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x.trim()))rows.push(row);row=[];}}
  else{if(closed&&!/\s/.test(c))throw new Error('Texto después de comillas CSV.');if(!closed)field+=c;}
 }
 if(quoted)throw new Error('Hay comillas sin cerrar en el CSV.');
 if(field||closed||row.length){row.push(field);if(row.some(x=>x.trim()))rows.push(row);}
 if(!rows.length)throw new Error('El CSV está vacío.');
 const header=rows.shift().map(x=>x.trim().toLowerCase());
 if(['ssid','band','channel','rssi'].some(k=>!header.includes(k)))throw new Error('Cabecera requerida: ssid,band,channel,rssi,bssid,security');
 if(new Set(header).size!==header.length)throw new Error('Cabeceras duplicadas.');
 if(!rows.length||rows.length>100)throw new Error('Importa entre 1 y 100 redes.');
 return rows.map((r,i)=>{if(r.length!==header.length)throw new Error('Número de campos incorrecto en la fila '+(i+2));const v=Object.fromEntries(header.map((k,j)=>[k,r[j]]));try{return validate(v);}catch(e){throw new Error('Fila '+(i+2)+': '+e.message);}});
}
function overlap24(rows){return [1,6,11].map(channel=>({channel,count:rows.filter(r=>r.band==='2.4'&&Math.abs(r.channel-channel)<4).length}));}
const api={channels5,validate,parseCSV,overlap24};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.REDWireless=api;
})(typeof window==='undefined'?globalThis:window);
