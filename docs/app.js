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
