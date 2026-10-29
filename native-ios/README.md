# RED nativa para iPhone / iPad

Proyecto SwiftUI para **iOS 16 o posterior**, con APIs públicas y sin dependencias externas. Es una aplicación nativa, no un navegador que carga la web. La versión web de `docs/` sigue siendo independiente.

## Estado de esta entrega

Código fuente y proyecto Xcode preparados. **No compilado ni probado con el SDK de iOS en este entorno Linux.** No hay una IPA firmada, TestFlight o publicación en App Store. La siguiente validación necesaria es abrir y compilar el proyecto con Xcode en un Mac y probarlo en tu iPhone. La estructura del proyecto, las referencias a archivos, el esquema XML, el manifiesto y el icono se han verificado estáticamente.

## Abrir e instalar

1. En un **Mac**, instala una versión de Xcode compatible con la versión de iOS de tu iPhone y descarga el repositorio.
2. Abre `native-ios/RED.xcodeproj`.
3. Para probar la interfaz en simulador, selecciona el esquema **RED**, un simulador de iPhone y pulsa Run. El simulador usa la red del Mac: no representa las interfaces reales del teléfono ni valida el descubrimiento local en tu wifi.
4. Para instalar en tu iPhone, conéctalo al Mac. En Xcode → Settings → Apple Accounts añade tu cuenta Apple.
5. Selecciona el target **RED** → **Signing & Capabilities** → **Automatically manage signing** y elige tu Team. Si el identificador no está disponible, cambia `com.jara-cyber.red.native` por uno único.
6. Selecciona tu iPhone como destino, acepta en él la confianza del Mac y activa Developer Mode si lo requiere iOS. Pulsa Run. Xcode compila, firma e instala la aplicación.
7. En Red local pulsa Buscar y concede el permiso de red local cuando iOS lo solicite. Para revisarlo: Ajustes → Privacidad y seguridad → Red local.

Una cuenta personal puede permitir pruebas en tus propios dispositivos con las limitaciones de Apple; distribución por TestFlight/App Store y firma para distribución siguen su proceso de desarrollador. El enlace `github.io/red` abre la web, **no instala esta app nativa**. No se han añadido cuentas, certificados, perfiles ni credenciales al repositorio. Si solo dispones de Windows, este proyecto no puede compilarse localmente con el SDK oficial de iOS; necesitarás acceso a un Mac.

Comprobación de compilación en un Mac (desde `native-ios/`):

```sh
xcodebuild -project RED.xcodeproj -scheme RED -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

## Funciones reales

- Lee direcciones IPv4 e IPv6 de las interfaces activas del iPhone mediante `getifaddrs`. Puede mostrar VPN y varias interfaces; no afirma que todas sean la ruta actual de Internet.
- Observa el transporte de la ruta (Wi-Fi, datos móviles, Ethernet), disponibilidad, coste y modo de datos reducidos mediante `NWPathMonitor`.
- Consulta opcionalmente IP pública, organización de salida, ASN y ubicación aproximada con ipapi.co. El servicio recibe la IP solo al pulsar el botón. Una VPN/relay cambia lo que ve ese servicio.
- Ejecuta series de 5 solicitudes HTTP a un destino HTTPS seleccionado (GitHub Pages o Apple), con gráfica nativa, tiempos y fallos. No es un test de velocidad, de señal, de ICMP o de pérdida de paquetes. Pages debe estar disponible para su prueba. Hasta 60 muestras en memoria, sin monitor en segundo plano.
- Busca servicios Bonjour `_http._tcp` y `_workstation._tcp`, durante 30 segundos como máximo, con `NWBrowser` y el permiso Red local. Se detiene si la app deja de estar activa. No conecta con esos servicios.
- Permite anotar operador contratado, IP del router y dispositivos manuales, y compartir un informe con los datos consultados.

## Límites claros

El descubrimiento Bonjour **no es un inventario completo de dispositivos**: un equipo puede anunciar varios servicios o ninguno. No se resuelven sus IP ni se obtienen sus MAC en esta primera versión. Los resultados se mantienen como última observación al detener la búsqueda y no confirman presencia actual. Redes de invitados y aislamiento pueden impedir descubrimientos.

No se escanean SSID/BSSID cercanos, canales, RSSI, ruido o interferencias. No se solicita ubicación ni el entitlement de información wifi; no se usan APIs privadas. Gateway y DNS no se detectan automáticamente. El gateway se puede copiar de Ajustes → Wi-Fi → ⓘ → Router. No hay avisos de nuevos dispositivos ni vigilancia continua. **Ser nativa no permite saltarse los límites de iOS ni garantiza las herramientas de WiFi Analyzer para Android.**

## Validación en dispositivo pendiente

1. Verificar las IP contra Ajustes del iPhone, tanto en Wi-Fi como en datos móviles y, si la usas, VPN.
2. Consultar IP pública con y sin relay/VPN y comprobar manejo de ausencia de Internet o límite de ipapi.co.
3. Ejecutar una serie HTTP con cada destino: 404 se muestra como fallo y nunca como una medida de 0 ms.
4. Probar Bonjour con un servicio conocido, con permiso concedido y rechazado, y en una red con aislamiento. Una lista vacía no demuestra ausencia de dispositivos.
5. Iniciar búsqueda, cambiar de app y volver: debe estar detenida. Repetir después de 30 segundos.
6. Añadir y borrar dispositivos manuales, reiniciar la app y confirmar persistencia. Revisar el informe antes de compartirlo.

## Datos

Las anotaciones se guardan en UserDefaults y pueden entrar en copias de seguridad del dispositivo. No se almacenan claves de router ni se envían inventarios a GitHub. Datos de conexión, resultados Bonjour, consulta pública y mediciones permanecen en memoria. El informe incluye IP y nombres de servicios: el usuario decide si lo comparte. Los registros manuales no se separan automáticamente por red y no equivalen a dispositivos conectados en vivo.
