# RED · Web de conexión para GitHub Pages

La versión principal está en `docs/`: una web estática, sin agente y sin instalación en Windows. Dirección prevista: **https://jara-cyber.github.io/red/**.

## Activar GitHub Pages

En el repositorio, abre **Settings → Pages → Build and deployment**. Selecciona **Deploy from a branch**, rama **main**, carpeta **/docs**, y pulsa **Save**. Si tu plan no admite Pages en repositorios privados, GitHub pedirá cambiar de plan o hacer público el repositorio. Este proyecto no cambia su visibilidad automáticamente.

La configuración de Pages es necesaria antes de que la dirección esté disponible. Puede tardar unos minutos tras activarla.

## Qué hace esta web

- Muestra estado declarado por el navegador, HTTPS, zona horaria y datos de Network Information API si el navegador los admite. En Safari/iPhone muchos campos no están disponibles y así se indica.
- El botón Comprobar conexión realiza tres solicitudes sin caché a `probe.txt` en el mismo sitio y muestra su mediana. Mide respuesta HTTP, no ping ICMP, latencia al router ni velocidad contratada.
- El botón Consultar IP y proveedor hace una petición explícita a `https://ipapi.co/json/`. Ese servicio recibe la IP del visitante; puede limitar o bloquear peticiones. La consulta no se hace automáticamente y los resultados solo se mantienen en memoria. La ubicación es aproximada y puede reflejar una VPN o relay.
- IP local, gateway, DNS y dispositivos aparecen como no disponibles. No se intenta escanear la LAN.
- El inventario de ejemplo es opcional y está marcado como ficticio. No se mezcla con los resultados reales.
- Tiene manifiesto e iconos para añadirla al inicio. No ofrece vigilancia en segundo plano ni notificaciones de nuevas conexiones. No guarda inventarios, claves ni datos de red en GitHub.

Todos los recursos usan rutas relativas y el service worker se limita a `/red/`, para no interferir con otros proyectos como `/casa/`. No hay dependencias ni compilación. Para probar localmente, sirve `docs/` con un servidor estático.

---

## Versión anterior: agente Windows (opcional, fuera de la web publicada)

Los archivos `agent.py`, `web/`, `Iniciar.ps1` y `tests/` se conservan como versión anterior. No se publican al seleccionar `/docs` en Pages. Sus instrucciones siguen debajo; **no son necesarias para la nueva web**.

# RED · Observatorio de red

Panel privado en español y agente para Windows 10/11. Muestra la IP del **Windows que ejecuta el agente**, interfaz, subred IPv4, puerta de enlace, DNS, dispositivos observados por IP/MAC e historial de primeras detecciones. No inventa dispositivos ni muestra datos de demostración como si fueran reales.

## Primera prueba en Windows

1. Instala **Python 3.11 o posterior** desde https://www.python.org/downloads/windows/ con el lanzador `py`.
2. En este repositorio: **Code → Download ZIP**. Descomprime todo en una carpeta de tu usuario, por ejemplo `Documentos\red`. No ejecutes desde dentro del ZIP.
3. Abre PowerShell en esa carpeta. Ejecuta:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Iniciar.ps1 -Sondear
   ```

   `Bypass` se limita a ese proceso; no cambia la política permanente del equipo. No requiere administrador. Si la política de tu empresa bloquea scripts, sigue su procedimiento; puedes ejecutar el agente directamente con `py -3 agent.py --probe`.
4. Abre **http://localhost:8765** en ese mismo Windows. Pega la clave que aparece en la consola.
5. Deja terminar la primera lectura. Conecta después un dispositivo que no estuviera presente. Espera uno o dos ciclos, aproximadamente 30–90 segundos; puede tardar más o no ser visible según el equipo/router.
6. Pulsa **Activar notificaciones** y permite los avisos. Sin Web Push configurado, estos avisos funcionan mientras el panel esté abierto y el navegador lo ejecute. El historial se guarda aunque cierres el panel.

Mantén el ordenador despierto, conectado a la misma red y la consola abierta. **Ctrl+C** detiene el agente. Cerrar sesión en el panel no detiene el agente ni desactiva suscripciones push. No se instala inicio automático ni se abre el cortafuegos.

`-Sondear` envía un ping por dirección cada ciclo, exclusivamente a la subred privada IPv4 de la interfaz seleccionada, de /24 o menor (hasta 254 hosts). Úsalo en tu red autorizada. No hace escaneo de puertos ni inspecciona tráfico. Para el modo pasivo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Iniciar.ps1
```

En modo pasivo solo se lee la tabla de vecinos de Windows y se puede descubrir muy poco. Para elegir un adaptador si tienes VPN o varias interfaces:

```powershell
Get-NetIPConfiguration
powershell -NoProfile -ExecutionPolicy Bypass -File .\Iniciar.ps1 -Sondear -Interfaz 12
```

Sustituye `12` por tu índice de interfaz. Por defecto se elige la interfaz con gateway y menor métrica de interfaz; no equivale necesariamente a la ruta efectiva si hay VPN. Redes mayores que /24 requieren modo pasivo; no se reduce su rango artificialmente.

## Qué significan los resultados

- La primera lectura crea la referencia inicial de cada red, sin notificaciones de los equipos que ya estaban presentes. En modo pasivo esa referencia puede ser incompleta.
- Un aviso significa **primera detección de una MAC**, no una conexión confirmada en el router. Un equipo conocido que se reconecta no genera otro aviso.
- Se usa la interfaz, subred, gateway y su MAC cuando es visible para separar historiales. Redes con la misma configuración pueden confundirse si el gateway no se ve.
- Las MAC aleatorias pueden producir avisos de equipos que ya conocías. Las IP pueden cambiar sin generar un nuevo dispositivo.
- Se conservan equipos históricos; “reciente” significa observado en menos de 3 minutos, no prueba de que siga conectado. Windows puede conservar entradas antiguas.
- Dispositivos dormidos, aislados por Wi-Fi, de otras VLAN, IPv6 o detrás de otro router pueden no aparecer. No se garantizan nombres comerciales, fabricante, sistema operativo ni todos los dispositivos.
- Para alertas fiables de altas y bajas, la siguiente integración es la API o los eventos DHCP/estación del router, según modelo.

## Notificaciones al móvil con el panel cerrado

El código incluye Web Push real, service worker, manifiesto PWA e iconos. **No está configurado ni probado en tu móvil todavía.** Hace falta un origen HTTPS estable que sirva el panel y reenvíe `/api/` al agente local; el teléfono debe acceder a ese origen al suscribirse. No basta con visitar GitHub ni con abrir `http://IP-del-PC:8765`.

1. Instala dependencias opcionales en el entorno que creó `Iniciar.ps1`:

   ```powershell
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe agent.py --init-push mailto:tu-correo@tu-dominio.com
   ```

   Sustituye el correo por un contacto tuyo. Las claves VAPID se generan una sola vez dentro de `data/`.
2. Configura un proxy HTTPS o acceso privado con certificado de confianza que reenvíe al `127.0.0.1:8765` del Windows. No expongas el puerto directamente a Internet. Debe conservar el encabezado Host del dominio HTTPS y servir toda la app en la raíz del dominio. La configuración concreta depende del dominio/proxy que elijas; no hay un túnel contratado ni configurado por este proyecto.
3. Antes de arrancar el agente, en esa misma consola, establece el origen exacto que controlas, sin barra final:

   ```powershell
   $env:RED_PUBLIC_ORIGIN = 'https://red.tu-dominio.com'
   .\.venv\Scripts\python.exe agent.py --probe
   ```

   El servidor sigue escuchando solo en loopback. El proxy debe residir en el mismo Windows o acceder a él mediante una configuración local apropiada. La API no habilita CORS entre dominios. Usa una URL estable: cambiar de origen requiere instalar/suscribir de nuevo.
4. Abre ese HTTPS en el móvil, introduce la clave y activa notificaciones. En iPhone/iPad, iOS/iPadOS 16.4 o posterior: Safari → Compartir → Añadir a pantalla de inicio → abrir desde ese icono → Activar notificaciones. En Android usa un navegador con Web Push y permite notificaciones; puedes instalar desde su menú.
5. Pulsa **Probar push**. Después cierra el panel y prueba otra detección. El Windows debe permanecer encendido y con Internet. El sistema operativo, permisos, ahorro de batería y servicio push condicionan la entrega; no hay garantía de entrega instantánea.

Los proveedores admitidos por esta primera versión son FCM/Chrome, Mozilla y Apple. Otros endpoints se rechazan. Se admiten hasta 20 suscripciones. Cada prueba se envía solo al dispositivo que la solicita. Los avisos no incluyen IP ni MAC en la pantalla bloqueada. Suscripciones caducadas (404/410) se eliminan; otros errores se registran sin datos sensibles y sin reintentos persistentes. Los eventos permanecen en el historial para su consulta. Si expira una suscripción, vuelve a pulsar Activar notificaciones.

## GitHub y publicación

GitHub almacena el código; el enlace del repositorio no ejecuta el agente. Esta versión se sirve desde el propio Windows para que panel y API compartan origen. **No está desplegada en GitHub Pages**. Pages solo serviría la parte estática; necesitaría un backend HTTPS y adaptar rutas/autenticación para conectarlo. No se ha cambiado la visibilidad del repositorio.

## Privacidad

`data/` contiene la clave de acceso, inventario, historial (últimos 200 eventos), claves VAPID y suscripciones. Está excluida de Git. No la publiques ni copies a una carpeta compartida. Protege la carpeta con los permisos de tu usuario de Windows; los archivos locales no están cifrados por esta app. No se envía el inventario a un servicio externo; los avisos push genéricos pasan por el proveedor del navegador cuando configuras esa función.

El panel exige la clave para leer datos y gestionar suscripciones. Se almacena en `sessionStorage`, no en la URL. Evita un dominio HTTPS compartido con otras aplicaciones. Para rotar la clave: detén el agente, elimina únicamente `data/token.txt` y arranca otra vez. El inventario conserva las MAC conocidas hasta que elimines `data/inventory.json` con el agente detenido; eso reinicia la referencia inicial. Conserva las claves VAPID mientras existan suscripciones. La app no incorpora cuentas multiusuario, auditoría empresarial ni rate limiting: esta es una primera prueba privada, no un servicio de producción abierto al público.

## Verificación

```powershell
py -3 -m unittest discover -s tests -v
```

Las pruebas verifican referencia inicial, detección nueva, persistencia, cambios de IP/gateway, límites de sondeo, validación de endpoints, autenticación, protección de archivos y disponibilidad de recursos. La lectura real de PowerShell y la entrega push requieren validación en tu Windows y móvil.
