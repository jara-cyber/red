'use strict';
const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('red-token') || '';
let snapshot = null;
let announced = null;
let busy = false;
let localAlerts = false;
let sw = null;
const date = seconds => new Date(seconds * 1000).toLocaleString('es-ES', {dateStyle:'short',timeStyle:'short'});
const message = text => { $('message').textContent = text; };
async function api(path, body) {
  const response = await fetch(path, {method:body ? 'POST':'GET', cache:'no-store',
    headers:{Authorization:'Bearer '+token, ...(body ? {'Content-Type':'application/json'}:{})},
    ...(body ? {body:JSON.stringify(body)}:{})});
  if (response.status === 401) {
    sessionStorage.removeItem('red-token'); token = ''; $('login').hidden = false;
    $('dashboard').hidden = true; snapshot = null; announced = null;
    throw new Error('Clave incorrecta. Introduce la clave de la consola de Windows.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'El agente no pudo completar la petición.');
  }
  return response.json();
}
function cell(row, text, className) {
  const td = document.createElement('td'); td.textContent = text;
  if (className) td.className = className;
  row.append(td); return td;
}
function renderDevices() {
  if (!snapshot) return;
  const filter = $('search').value.toLowerCase();
  const devices = snapshot.devices.filter(d => `${d.ip} ${d.mac} ${d.role}`.toLowerCase().includes(filter));
  $('devices').replaceChildren();
  for (const d of devices) {
    const tr = document.createElement('tr');
    const td = cell(tr, '', 'device-role');
    const icon = document.createElement('span'); icon.className = 'device-icon'; icon.textContent = d.role === 'Gateway' ? '⌘' : '▣';
    const name = document.createElement('span'); name.textContent = d.role;
    td.append(icon, name);
    cell(tr, d.ip); cell(tr, d.mac);
    cell(tr, `${d.recent ? 'Reciente · ' : 'Sin observación reciente · '}${date(d.last_seen)}`, d.recent ? 'seen':'older');
    $('devices').append(tr);
  }
  $('empty').hidden = devices.length > 0;
  $('empty').textContent = filter ? 'No hay resultados para esta búsqueda.' : 'Todavía no hay dispositivos detectados.';
}
function render(data) {
  snapshot = data;
  $('login').hidden = true; $('dashboard').hidden = false;
  $('connection').textContent = data.error ? 'Lectura interrumpida' : data.ready ? 'Agente conectado' : 'Iniciando agente';
  $('connection').className = 'pill' + (data.ready && !data.error ? ' connected' : '');
  $('last-update').textContent = data.updated ? 'Última lectura · ' + date(data.updated) : 'Primera lectura en curso…';
  message(data.error || '');
  if (data.network) {
    for (const key of ['ip','gateway','subnet','interface']) $(key).textContent = data.network[key];
    $('dns').textContent = 'DNS: ' + (data.network.dns || []).join(' · ');
  }
  $('mode').textContent = (data.mode || 'Esperando lectura') + ' · actualización periódica';
  $('count').textContent = data.devices.filter(d => d.recent).length;
  renderDevices();
  $('events').replaceChildren();
  for (const e of data.events.slice(0,30)) {
    const li = document.createElement('li'); li.textContent = e.message;
    const address = document.createElement('span'); address.textContent = `${e.ip} · ${e.mac}`;
    const at = document.createElement('span'); at.textContent = date(e.at); li.append(address, at); $('events').append(li);
  }
  $('no-events').hidden = data.events.length > 0;
  $('notification-detail').textContent = data.push
    ? 'Push configurado en el agente. En el móvil necesitas abrir este panel mediante HTTPS. La entrega depende de los permisos y del sistema.'
    : 'Avisos locales mientras este panel esté abierto. Para avisos con la web cerrada, configura Web Push y acceso HTTPS (ver README).';
  if (announced !== null && localAlerts && sw) {
    const fresh = data.events.filter(e => !announced.has(e.id));
    if (fresh.length) sw.showNotification('RED · Nuevo dispositivo', {body:`${fresh.length} dispositivo(s) detectado(s) por primera vez.`, tag:'red-local', icon:'icon-192.png'}).catch(() => {});
  }
  if (data.ready) announced = new Set(data.events.map(e => e.id));
}
async function refresh() {
  if (!token || busy) return;
  busy = true;
  try { render(await api('/api/status')); }
  catch (error) { message(error.message === 'Failed to fetch' ? 'No se puede conectar. Comprueba que el agente sigue abierto.' : error.message); $('connection').textContent = 'Sin conexión'; $('connection').className='pill'; }
  finally { busy = false; }
}
$('login-form').addEventListener('submit', async e => {
  e.preventDefault(); token = $('token').value.trim();
  sessionStorage.setItem('red-token', token); $('token').value = ''; await refresh();
});
$('logout').addEventListener('click', () => {
  token = ''; sessionStorage.removeItem('red-token'); snapshot = null; announced = null; localAlerts = false;
  $('devices').replaceChildren(); $('events').replaceChildren(); $('dashboard').hidden = true; $('login').hidden = false;
  $('connection').textContent = 'Sesión cerrada'; $('connection').className = 'pill';
  message('Sesión cerrada. Las suscripciones push permanecen activas hasta pulsar Desactivar push.');
});
$('search').addEventListener('input', renderDevices);
$('refresh').addEventListener('click', refresh);
async function subscription() { return sw && await sw.pushManager.getSubscription(); }
function decodeKey(value) {
  const raw = atob((value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
$('notify').addEventListener('click', async () => {
  $('notify').disabled = true;
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !window.isSecureContext) throw new Error('Abre el panel en localhost o mediante HTTPS. En iPhone, añádelo primero a la pantalla de inicio.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('No hay permiso de notificaciones. Puedes cambiarlo en los ajustes del navegador.');
    sw = await navigator.serviceWorker.ready;
    const config = await api('/api/push-key');
    if (config.publicKey) {
      if (!('PushManager' in window)) throw new Error('Este navegador no admite Web Push en este contexto.');
      let sub = await subscription();
      if (!sub) sub = await sw.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(config.publicKey)});
      await api('/api/subscribe', sub.toJSON()); localAlerts = false;
      $('test-push').hidden = false; $('unsubscribe').hidden = false;
      message('Push activado en este dispositivo. Puedes probarlo con el botón Probar push.');
    } else {
      localAlerts = true;
      await sw.showNotification('RED · Avisos locales activados', {body:'Recibirás avisos mientras el panel esté abierto.', icon:'icon-192.png'});
      message('Avisos locales activados para esta sesión. Para recibirlos con la web cerrada, configura push.');
    }
  } catch (error) { message(error.message); }
  finally { $('notify').disabled = false; }
});
$('test-push').addEventListener('click', async () => {
  try { const sub = await subscription(); if (!sub) throw new Error('Primero activa push.'); await api('/api/test-push', sub.toJSON()); message('Envío de prueba solicitado. Confirma que recibes el aviso; revisa la consola si no llega.'); }
  catch (error) { message(error.message); }
});
$('unsubscribe').addEventListener('click', async () => {
  try { const sub = await subscription(); if (sub) {await api('/api/unsubscribe',sub.toJSON()); await sub.unsubscribe();} $('unsubscribe').hidden = true; $('test-push').hidden = true; message('Push desactivado en este dispositivo.'); }
  catch (error) { message(error.message); }
});
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').then(async () => {
    sw = await navigator.serviceWorker.ready;
    const sub = await subscription(); if (sub) {$('unsubscribe').hidden=false; $('test-push').hidden=false;}
  }).catch(() => message('No se pudo registrar el servicio de notificaciones.'));
}
refresh(); setInterval(refresh, 10000);
