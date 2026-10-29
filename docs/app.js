'use strict';
const $ = id => document.getElementById(id);
const net = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
let running = false;
let installPrompt = null;
function message(text) { $('message').textContent = text; }
function updateBrowser() {
  $('status').textContent = navigator.onLine ? 'Navegador en línea' : 'Navegador sin conexión';
  $('status').className = 'pill' + (navigator.onLine ? ' connected' : '');
  $('online').textContent = navigator.onLine ? 'En línea (no garantiza Internet)' : 'Sin conexión';
  $('secure').textContent = window.isSecureContext ? 'Sí' : 'No';
  $('timezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'No disponible';
  $('connection-type').textContent = net?.type && net.type !== 'unknown' ? ({wifi:'Wi-Fi',cellular:'Datos móviles',ethernet:'Ethernet'}[net.type] || net.type) : 'No disponible';
  $('connection-note').textContent = net?.effectiveType ? 'Rendimiento efectivo: ' + net.effectiveType + ' (estimado)' : 'El navegador no informa del tipo de red';
  $('downlink').textContent = Number.isFinite(net?.downlink) ? net.downlink + ' Mbps (estimación)' : 'No disponible en este navegador';
  $('rtt').textContent = Number.isFinite(net?.rtt) ? net.rtt + ' ms (estimación)' : 'No disponible en este navegador';
  $('save-data').textContent = typeof net?.saveData === 'boolean' ? (net.saveData ? 'Activado' : 'Desactivado') : 'No disponible en este navegador';
}
async function timedFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
    if (!response.ok) throw new Error('Respuesta HTTP ' + response.status);
    return await response.text();
  } finally { clearTimeout(timeout); }
}
async function diagnose() {
  if (running) return;
  running = true; $('diagnose').disabled = true; $('diagnose').textContent = 'Comprobando…';
  updateBrowser();
  const samples = [];
  try {
    for (let i=0; i<3; i++) {
      const start = performance.now();
      const url = new URL('./probe.txt', location.href); url.searchParams.set('t',Date.now()+'-'+i);
      const body = await timedFetch(url);
      if (body.trim() !== 'red-network-probe-v1') throw new Error('Respuesta de diagnóstico no válida');
      samples.push(performance.now()-start);
    }
    samples.sort((a,b) => a-b);
    $('latency').replaceChildren(document.createTextNode(Math.round(samples[1])+' '));
    const unit = document.createElement('small'); unit.textContent='ms'; $('latency').append(unit);
    $('reachability').textContent = 'Esta web responde por HTTPS';
    $('latency-note').textContent = 'Respuesta HTTP; no es ping al router';
    $('checked').textContent = 'Comprobado a las ' + new Date().toLocaleTimeString('es-ES');
    message('Diagnóstico completado: tres solicitudes a esta web. El tiempo incluye la respuesta del servidor.');
  } catch (_) {
    $('latency').textContent = 'Sin respuesta'; $('reachability').textContent = 'No se pudo verificar';
    $('checked').textContent = 'Última comprobación fallida';
    message('No se ha podido completar el diagnóstico. Puede ser un problema de conexión, bloqueo o del servidor; no confirma un fallo de tu red.');
  } finally { running=false; $('diagnose').disabled=false; $('diagnose').textContent='Comprobar conexión ↗'; }
}
$('diagnose').addEventListener('click',diagnose);
$('lookup').addEventListener('click',async () => {
  $('lookup').disabled=true; $('lookup').textContent='Consultando…';
  try {
    const data=JSON.parse(await timedFetch('https://ipapi.co/json/'));
    if (data.error || typeof data.ip !== 'string' || data.ip.length>64) throw new Error('Sin datos');
    $('public-ip').textContent=data.ip;
    $('provider').textContent=typeof data.org === 'string' ? data.org : 'No informado';
    $('network-org').textContent=typeof data.org === 'string' ? data.org : 'No informado';
    $('asn').textContent=typeof data.asn === 'string' ? data.asn : 'No informado';
    $('ip-version').textContent=data.ip.includes(':') ? 'IPv6' : 'IPv4';
    $('location').textContent=[data.city,data.region,data.country_name].filter(v=>typeof v==='string').join(', ') || 'No informada';
    message('Consulta completada con ipapi.co. Los datos describen tu salida a Internet y pueden reflejar una VPN o un relay.');
  } catch (_) { message('No se pudo consultar la IP pública. El servicio puede estar bloqueado, no disponible o haber alcanzado su límite. Puedes volver a intentarlo.'); }
  finally { $('lookup').disabled=false; $('lookup').textContent='Actualizar IP y proveedor'; }
});
$('demo').addEventListener('click',() => {
  const show=$('demo-panel').hidden;
  $('demo-panel').hidden=!show; $('demo').setAttribute('aria-pressed',String(show));
  $('demo').textContent=show ? 'Ocultar ejemplo' : 'Ver ejemplo de inventario';
});
window.addEventListener('online',updateBrowser);
window.addEventListener('offline',() => {updateBrowser(); $('reachability').textContent='Pendiente de nueva comprobación'; $('latency').textContent='Sin comprobar';});
net?.addEventListener('change',() => {updateBrowser(); $('latency').textContent='Sin comprobar'; $('reachability').textContent='La conexión ha cambiado; vuelve a comprobar';});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').hidden=false;});
$('install').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install').hidden=true;}});
window.addEventListener('appinstalled',()=>{$('install').hidden=true;});
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
updateBrowser();

const manualKey = 'red-manual-network-v1';
let manual = {name:'',operator:'',router:'',dns:'',devices:[]};
function ipv4(value) {
  const parts=value.split('.');
  return parts.length===4 && parts.every(p=>/^(0|[1-9][0-9]{0,2})$/.test(p) && Number(p)<=255);
}
function localIPv4(value) {
  if (!ipv4(value)) return false;
  const [a,b]=value.split('.').map(Number);
  return a===10 || (a===172 && b>=16 && b<=31) || (a===192 && b===168);
}
function persistManual(next) {
  try {localStorage.setItem(manualKey,JSON.stringify(next)); manual=next; renderManual(); $('manual-status').textContent='Guardado únicamente en este navegador.'; return true;}
  catch (_) {$('manual-status').textContent='No se pudo guardar. El navegador bloquea el almacenamiento o no tiene espacio.'; return false;}
}
function renderManual() {
  $('network-name').value=manual.name; $('contract-operator').value=manual.operator;
  $('router-ip').value=manual.router; $('manual-dns').value=manual.dns;
  for (const [id,key] of [['saved-name','name'],['saved-operator','operator'],['saved-router','router'],['saved-dns','dns']]) $(id).textContent=manual[key] || 'Sin registrar';
  $('manual-count').textContent=manual.devices.length+' dispositivos registrados';
  $('manual-empty').hidden=manual.devices.length>0; $('manual-devices').replaceChildren();
  manual.devices.forEach((device,index)=>{
    const row=document.createElement('tr');
    for (const value of [device.name,device.ip,device.mac || 'Sin anotar','Manual · sin estado en vivo']) {const td=document.createElement('td');td.textContent=value;row.append(td);}
    const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Quitar';
    button.setAttribute('aria-label','Quitar '+device.name);
    button.addEventListener('click',()=>persistManual({...manual,devices:manual.devices.filter((_,i)=>i!==index)}));
    td.append(button);row.append(td);$('manual-devices').append(row);
  });
}
$('network-form').addEventListener('submit',e=>{
  e.preventDefault();const router=$('router-ip').value.trim();
  if (router && !localIPv4(router)) {$('manual-status').textContent='Introduce una IP IPv4 privada válida para el router, tomada de tu configuración.'; return;}
  persistManual({...manual,name:$('network-name').value.trim(),operator:$('contract-operator').value.trim(),router,dns:$('manual-dns').value.trim()});
});
$('device-form').addEventListener('submit',e=>{
  e.preventDefault();const name=$('device-name').value.trim(),ip=$('device-ip').value.trim(),mac=$('device-mac').value.trim().replace(/-/g,':').toUpperCase();
  if (!name || !localIPv4(ip) || (mac && !/^(?:[A-F0-9]{2}:){5}[A-F0-9]{2}$/.test(mac))) {$('manual-status').textContent='Revisa el nombre, la IP privada IPv4 y la MAC (si la has indicado).';return;}
  if (manual.devices.some(d=>d.ip===ip || (mac && d.mac===mac))) {$('manual-status').textContent='Ya existe un registro con esa IP o MAC. Quita el anterior si necesitas sustituirlo.';return;}
  if (manual.devices.length>=100) {$('manual-status').textContent='Máximo 100 dispositivos manuales.';return;}
  if (persistManual({...manual,devices:[...manual.devices,{name,ip,mac}]})) $('device-form').reset();
});
$('clear-manual').addEventListener('click',()=>{
  if (confirm('¿Borrar los datos manuales de RED guardados en este navegador?')) {
    try {localStorage.removeItem(manualKey);manual={name:'',operator:'',router:'',dns:'',devices:[]};renderManual();$('manual-status').textContent='Datos manuales borrados.';}
    catch (_) {$('manual-status').textContent='No se pudo acceder al almacenamiento.';}
  }
});
try {
  const stored=JSON.parse(localStorage.getItem(manualKey) || 'null');
  if (stored && ['name','operator','router','dns'].every(k=>typeof stored[k]==='string' && stored[k].length<=100) && Array.isArray(stored.devices) && stored.devices.length<=100 && stored.devices.every(d=>d && typeof d.name==='string' && d.name.length<=80 && typeof d.ip==='string' && localIPv4(d.ip) && typeof d.mac==='string' && (!d.mac || /^(?:[A-F0-9]{2}:){5}[A-F0-9]{2}$/.test(d.mac)))) manual=stored;
} catch (_) {$('manual-status').textContent='No se han podido recuperar los datos guardados. Puedes introducirlos de nuevo.';}
renderManual();
