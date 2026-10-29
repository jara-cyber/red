# RED · Analizador web de conexión

Versión estática para GitHub Pages en `docs/`, sin agente necesario. Dirección prevista: https://jara-cyber.github.io/red/.

## Funciones añadidas

- Series de 10 mediciones HTTP y monitor cada 15 segundos, pausado cuando la página está oculta.
- Gráfica de las últimas 30 muestras; historial de hasta 100, mínimo, media, máximo, variación entre respuestas válidas y fallos HTTP. No es ping ICMP, test de velocidad ni pérdida de paquetes.
- Etiquetas manuales de ubicación para comparar sesiones. Persistencia del historial opcional y exportación CSV con protección de fórmulas.
- IP pública, organización de salida, ASN, IPv4/IPv6 y ubicación aproximada mediante consulta explícita a ipapi.co. Una VPN o relay puede afectar al resultado.
- Inventario manual de dispositivos, router, operador contratado y DNS; búsqueda y exportación JSON. Se conserva solo en este navegador, no en GitHub.
- Calculadora IPv4/CIDR con máscara, rango, broadcast y tratamiento de /31 y /32.
- Registro manual de RSSI por ubicación, usando valores obtenidos fuera de esta web. Solo dura la sesión.
- Modo oscuro, navegación por secciones, tablas accesibles y ayuda sobre capacidades reales.

No detecta redes cercanas, canales, interferencias, señal wifi ni dispositivos conectados automáticamente. No envía notificaciones de nuevas conexiones. Los datos manuales y la demostración se identifican claramente. No se sincronizan entre navegadores ni se separan automáticamente al cambiar de wifi.

## Publicación

GitHub → Settings → Pages → Deploy from a branch → `main` → `/docs` → Save. Pages en repositorios privados depende del plan. No se cambia la visibilidad del repositorio automáticamente. Todos los recursos y el service worker están limitados a la ruta del proyecto y no modifican `/casa/`.

## Pruebas

`node --test tests/analyzer.test.cjs` verifica estadísticas, subredes y exportación CSV. La disponibilidad de campos del navegador depende de cada plataforma; en Safari/iPhone algunos aparecerán como no disponibles. No se usan librerías externas para las gráficas ni dependencias de compilación.

Los archivos del agente Windows anterior (`agent.py`, `web/`, `Iniciar.ps1`) siguen en el repositorio pero no se publican al seleccionar `/docs`. No son necesarios para esta versión web.


## Análisis de mediciones wifi aportadas

La nueva sección permite introducir o importar redes por CSV (SSID, BSSID opcional, banda 2.4/5, canal, RSSI y seguridad). Ofrece tabla filtrable y ordenable, gráficos esquemáticos de 20 MHz, comparación de solapamientos de los canales 1/6/11 y exportación CSV. Todo queda en memoria de la sesión salvo que lo exportes; no hay detección wifi, análisis espectral ni recomendación automática. El canal primario y un ancho supuesto de 20 MHz no describen redes anchas. Los canales admitidos por el formulario no implican autorización regulatoria para usarlos.

Para la importación usa las unidades exactas: RSSI en dBm, banda 2.4 o 5. No conviertas porcentajes de señal en dBm sin una medición válida. Las redes abiertas son etiquetas aportadas, no una auditoría automática. Las filas se validan antes de añadirlas; límite de 100 registros y 100 KB.

Pruebas adicionales: `node --test tests/wireless.test.cjs`.


## Aplicación nativa para iPhone

El proyecto SwiftUI está en [native-ios/](native-ios/README.md). Incluye IP locales del iPhone, estado de la ruta, diagnóstico HTTPS y descubrimiento de servicios Bonjour con permiso. Requiere compilar y firmar con Xcode en un Mac para instalarlo; no se instala desde GitHub Pages. La compilación iOS y prueba en dispositivo siguen pendientes. Consulta la guía para sus capacidades y límites.
