(function(root){
'use strict';
function stats(values){
 const valid=values.filter(x=>typeof x==='number' && Number.isFinite(x) && x>=0);
 if(!valid.length)return null;
 const sorted=[...valid].sort((a,b)=>a-b),n=sorted.length;
 return {min:sorted[0],max:sorted[n-1],mean:valid.reduce((a,b)=>a+b,0)/n,median:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,
 variation:valid.length>1?valid.slice(1).reduce((s,x,i)=>s+Math.abs(x-valid[i]),0)/(valid.length-1):null,count:n};
}
function subnet(text){
 const match=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(text.trim());
 if(!match)throw new Error('Usa IPv4/prefijo, por ejemplo 192.168.1.20/24.');
 const parts=match.slice(1,5).map(Number),prefix=Number(match[5]);
 if(parts.some(x=>x>255)||prefix>32)throw new Error('IP o prefijo no válido.');
 const ip=parts.reduce((a,b)=>a*256+b,0),size=2**(32-prefix),network=Math.floor(ip/size)*size,last=network+size-1;
 const format=x=>[24,16,8,0].map(s=>Math.floor(x/2**s)%256).join('.');
 return {network:format(network)+'/'+prefix,mask:format(2**32-size),broadcast:prefix>=31?'No aplica (/31 o /32)':format(last),
 first:format(prefix>=31?network:network+1),last:format(prefix>=31?last:last-1),hosts:prefix>=31?size:size-2};
}
function csv(rows){return '\uFEFF'+rows.map(row=>row.map(value=>{
 let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');}
const api={stats,subnet,csv}; if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.REDUtils=api;
})(typeof window==='undefined'?globalThis:window);
