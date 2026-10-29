import SwiftUI
import Charts

struct ContentView: View {
    var body: some View {
        TabView {
            OverviewView().tabItem { Label("Conexión", systemImage: "wifi") }
            DiagnosticView().tabItem { Label("Diagnóstico", systemImage: "waveform.path.ecg") }
            LocalNetworkView().tabItem { Label("Red local", systemImage: "network") }
            HelpView().tabItem { Label("Ayuda", systemImage: "info.circle") }
        }
    }
}

struct OverviewView: View {
    @EnvironmentObject private var network: NetworkStore
    @AppStorage("red.native.operator") private var manualOperator = ""
    @AppStorage("red.native.gateway") private var gateway = ""
    @State private var routerDraft = ""
    @State private var routerMessage = ""
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label("Tu conexión, a la vista", systemImage: "antenna.radiowaves.left.and.right")
                        .font(.title2.bold()).padding(.vertical, 8)
                    LabeledContent("Transporte", value: network.connection)
                    Text(network.pathStatus).font(.footnote).foregroundStyle(.secondary)
                    LabeledContent("Conexión considerada costosa", value: network.expensive ? "Sí" : "No")
                    LabeledContent("Modo de datos reducidos", value: network.constrained ? "Sí" : "No")
                }
                Section {
                    if network.addresses.isEmpty { Text("No hay direcciones disponibles.") }
                    ForEach(network.addresses) { address in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(address.interface + " · " + address.family).font(.caption).foregroundStyle(.secondary)
                            Text(address.address).font(.system(.body, design: .monospaced)).textSelection(.enabled)
                        }
                    }
                    Button("Actualizar direcciones") { network.refreshAddresses() }
                } header: { Text("Direcciones del iPhone · obtenidas del sistema") }
                  footer: { Text("Puede haber varias interfaces y direcciones de VPN. Esta lista no identifica por sí sola la ruta usada por cada conexión.") }
                Section {
                    LabeledContent("IP pública", value: network.publicIP?.ip ?? "Sin consultar")
                    LabeledContent("Operador / organización de salida", value: network.publicIP?.org ?? "Sin consultar")
                    LabeledContent("ASN", value: network.publicIP?.asn ?? "—")
                    LabeledContent("Ubicación aproximada", value: [network.publicIP?.city, network.publicIP?.countryName].compactMap { $0 }.joined(separator: ", "))
                    Button(network.lookingUp ? "Consultando…" : "Consultar IP y operador") { Task { await network.lookupIP() } }
                        .disabled(network.lookingUp)
                    Text(network.publicIPStatus).font(.footnote).foregroundStyle(.secondary)
                } header: { Text("Consulta externa opcional") }
                  footer: { Text("Al pulsar se envía una solicitud a ipapi.co, que recibe tu IP. La ubicación no es GPS. Los resultados permanecen solo en esta sesión.") }
                Section {
                    TextField("Operador contratado (manual)", text: $manualOperator)
                    TextField("IP del router (manual)", text: $routerDraft).keyboardType(.decimalPad)
                    Button("Guardar IP del router") {
                        let value = routerDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                        if value.isEmpty || NetworkStore.isIPv4(value) { gateway = value; routerMessage = "Anotación guardada en este iPhone." }
                        else { routerMessage = "Introduce una IPv4 válida." }
                    }
                    LabeledContent("Router anotado", value: gateway.isEmpty ? "Sin registrar" : gateway)
                    if !routerMessage.isEmpty { Text(routerMessage).font(.footnote) }
                } header: { Text("Anotaciones manuales") }
                  footer: { Text("No se detecta el gateway automáticamente en esta versión. Para consultarlo: Ajustes → Wi-Fi → ⓘ de tu red → Router. Estas anotaciones no cambian automáticamente al conectar a otra red.") }
            }
            .navigationTitle("RED")
            .onAppear { routerDraft = gateway; network.refreshAddresses() }
        }
    }
}

struct DiagnosticView: View {
    @EnvironmentObject private var network: NetworkStore
    @State private var target = "https://jara-cyber.github.io/red/probe.txt"
    private var valid: [HTTPMeasurement] { network.measurements.filter { $0.milliseconds != nil } }
    private var mean: String {
        let values = valid.compactMap(\.milliseconds)
        return values.isEmpty ? "—" : String(format: "%.0f ms", values.reduce(0, +) / Double(values.count))
    }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Destino HTTPS", selection: $target) {
                        Text("Tu GitHub Pages").tag("https://jara-cyber.github.io/red/probe.txt")
                        Text("Servidor de Apple").tag("https://www.apple.com/library/test/success.html")
                    }.disabled(network.testing)
                    Button(network.testing ? "Midiendo…" : "Medir 5 respuestas HTTP") {
                        Task { await network.testHTTP(target: target) }
                    }.disabled(network.testing)
                    Text(network.httpStatus).font(.footnote).foregroundStyle(.secondary)
                } footer: { Text("Prueba activa de cinco solicitudes HTTPS. Si Pages no está publicado, su prueba fallará. El destino recibe tu IP. No mide velocidad de descarga, señal wifi ni ping ICMP.") }
                Section("Respuesta HTTP · sesión actual") {
                    if valid.isEmpty { Text("Todavía no hay respuestas válidas para dibujar.").foregroundStyle(.secondary) }
                    else {
                        Chart(valid) { sample in
                            PointMark(x: .value("Fecha", sample.date), y: .value("Respuesta ms", sample.milliseconds ?? 0))
                        }.frame(height: 190).chartYAxisLabel("ms HTTP")
                        Text("Cada punto es una solicitud válida. Los fallos se muestran en la tabla, sin convertirlos en cero.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    LabeledContent("Media de respuestas válidas", value: mean)
                    LabeledContent("Solicitudes fallidas / total", value: "\(network.measurements.count - valid.count) / \(network.measurements.count)")
                    Button("Borrar mediciones", role: .destructive) { network.measurements = [] }.disabled(network.testing)
                }
                Section("Últimas solicitudes · hasta 60 en memoria") {
                    ForEach(network.measurements.reversed()) { sample in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(sample.milliseconds.map { String(format: "%.0f ms", $0) } ?? "Solicitud fallida").font(.headline)
                            Text(sample.detail).font(.caption)
                            Text(sample.date.formatted()).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                Section {
                    ShareLink(item: network.report) { Label("Compartir informe de diagnóstico", systemImage: "square.and.arrow.up") }
                    Text("El informe contiene IP y nombres de servicios observados. Revisa con quién lo compartes.").font(.footnote).foregroundStyle(.secondary)
                }
            }.navigationTitle("Diagnóstico")
        }
    }
}

struct LocalNetworkView: View {
    @EnvironmentObject private var network: NetworkStore
    @State private var name = ""
    @State private var ip = ""
    @State private var mac = ""
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button(network.browsing ? "Detener búsqueda" : "Buscar servicios locales (30 s)") {
                        if network.browsing { network.stopBrowsing() } else { network.startBrowsing() }
                    }
                    if network.browsing { ProgressView() }
                    Text(network.browseStatus).font(.footnote).foregroundStyle(.secondary)
                    ForEach(network.services) { service in
                        VStack(alignment: .leading, spacing: 5) {
                            Label(service.name, systemImage: "server.rack")
                            Text(service.type + " · " + service.domain).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if network.services.isEmpty { Text("Sin servicios observados. Esto no significa que no haya dispositivos conectados.").font(.footnote) }
                } header: { Text("Bonjour · descubrimiento nativo") }
                  footer: { Text("Solo servicios anunciados como HTTP o estación de trabajo. Un equipo puede anunciar varios servicios o ninguno. No es una lista completa de dispositivos ni muestra sus MAC. La búsqueda se detiene al ocultar la app y no abre conexiones a los servicios.") }
                Section("Añadir dispositivo manual") {
                    TextField("Nombre", text: $name)
                    TextField("IPv4 anotada", text: $ip).keyboardType(.decimalPad)
                    TextField("MAC opcional", text: $mac).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    Button("Guardar dispositivo") {
                        if network.addDevice(name: name, ip: ip, mac: mac) { name = ""; ip = ""; mac = "" }
                    }
                    Text(network.deviceStatus).font(.footnote)
                }
                Section {
                    ForEach(network.manualDevices) { device in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(device.name).font(.headline)
                            Text(device.ip + (device.mac.isEmpty ? "" : " · " + device.mac)).font(.caption)
                            Text("Registro manual · sin estado en vivo").font(.caption).foregroundStyle(.secondary)
                        }
                    }.onDelete { network.deleteDevices(at: $0) }
                    if network.manualDevices.isEmpty { Text("Sin registros manuales.").foregroundStyle(.secondary) }
                } header: { Text("Inventario manual · guardado en este iPhone") }
                  footer: { Text("Desliza un registro para eliminarlo. Los datos no se sincronizan y no se asocian automáticamente a la wifi actual.") }
            }.navigationTitle("Red local")
        }
    }
}

struct HelpView: View {
    var body: some View {
        NavigationStack {
            List {
                Section("Qué obtiene esta app") {
                    Label("IP locales IPv4 e IPv6 del iPhone", systemImage: "checkmark.circle")
                    Label("Transporte de la ruta y datos reducidos", systemImage: "checkmark.circle")
                    Label("Servicios locales mediante Bonjour y permiso", systemImage: "checkmark.circle")
                    Label("Mediciones HTTP e IP pública opcionales", systemImage: "checkmark.circle")
                }
                Section("Límites de esta versión en iOS") {
                    Text("No escanea redes wifi cercanas, canales ni interferencias. No obtiene RSSI, SSID, BSSID, gateway o DNS automáticamente. No usa APIs privadas.")
                    Text("No descubre todos los dispositivos ni detecta altas y bajas de la wifi. No genera avisos de nuevos equipos y no vigila en segundo plano.")
                    Text("Convertir la interfaz en una app nativa permite nuevas funciones, pero no elimina las restricciones de iOS.")
                }
                Section("Permiso de red local") {
                    Text("Solo se solicita al iniciar Bonjour. Si lo rechazas, revisa Ajustes → Privacidad y seguridad → Red local. Estar en una red de invitados o con aislamiento puede impedir descubrir servicios.")
                }
                Section("Privacidad") {
                    Text("No necesitas cuenta. Las anotaciones manuales se guardan en UserDefaults del dispositivo y pueden formar parte de sus copias de seguridad. No se guardan contraseñas del router ni se suben inventarios a GitHub.")
                    Text("El diagnóstico contacta con el destino elegido. La consulta opcional de operador contacta con ipapi.co. Las mediciones y resultados públicos permanecen en memoria hasta cerrar el proceso.")
                }
                Section {
                    Link("Código del proyecto", destination: URL(string: "https://github.com/jara-cyber/red")!)
                }
            }.navigationTitle("Ayuda")
        }
    }
}
