import Foundation
import Combine
import Network
import Darwin

struct LocalAddress: Identifiable {
    var id: String { interface + ":" + address }
    let interface: String
    let address: String
    let family: String
}
struct ServiceRecord: Identifiable {
    let id: String
    let name: String
    let type: String
    let domain: String
}
struct HTTPMeasurement: Identifiable {
    let id = UUID()
    let date = Date()
    let milliseconds: Double?
    let detail: String
}
struct PublicIP: Decodable {
    let ip: String?
    let org: String?
    let asn: String?
    let city: String?
    let countryName: String?
    let error: Bool?
    enum CodingKeys: String, CodingKey { case ip, org, asn, city, error; case countryName = "country_name" }
}
struct ManualDevice: Codable, Identifiable {
    var id = UUID()
    let name: String
    let ip: String
    let mac: String
}

@MainActor
final class NetworkStore: ObservableObject {
    @Published var connection = "Comprobando…"
    @Published var pathStatus = "Sin comprobar"
    @Published var expensive = false
    @Published var constrained = false
    @Published var addresses: [LocalAddress] = []
    @Published var publicIP: PublicIP?
    @Published var publicIPStatus = "Consulta opcional; ipapi.co recibirá tu IP."
    @Published var lookingUp = false
    @Published var measurements: [HTTPMeasurement] = []
    @Published var testing = false
    @Published var httpStatus = "Sin mediciones"
    @Published var services: [ServiceRecord] = []
    @Published var browsing = false
    @Published var browseStatus = "Pulsa Buscar para descubrir servicios Bonjour HTTP y de estaciones de trabajo."
    @Published var manualDevices: [ManualDevice] = []
    @Published var deviceStatus = ""
    private let pathMonitor = NWPathMonitor()
    private var browsers: [NWBrowser] = []
    private var serviceSets: [String: [ServiceRecord]] = [:]
    private var stopTask: Task<Void, Never>?
    private var browseGeneration = UUID()
    private let deviceKey = "red.native.manualDevices.v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: deviceKey),
           let devices = try? JSONDecoder().decode([ManualDevice].self, from: data) {
            manualDevices = devices
        }
        pathMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                self.pathStatus = path.status == .satisfied ? "Ruta disponible (no garantiza Internet)" : "Sin ruta disponible"
                self.connection = path.usesInterfaceType(.wifi) ? "Wi-Fi" : path.usesInterfaceType(.cellular) ? "Datos móviles" : path.usesInterfaceType(.wiredEthernet) ? "Ethernet" : "Otra / sin conexión"
                self.expensive = path.isExpensive
                self.constrained = path.isConstrained
                self.refreshAddresses()
            }
        }
        pathMonitor.start(queue: DispatchQueue(label: "red.network.path"))
        refreshAddresses()
    }

    func refreshAddresses() {
        var pointer: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&pointer) == 0, let first = pointer else { addresses = []; return }
        defer { freeifaddrs(pointer) }
        var result: [LocalAddress] = []
        var cursor: UnsafeMutablePointer<ifaddrs>? = first
        while let entry = cursor {
            defer { cursor = entry.pointee.ifa_next }
            let item = entry.pointee
            guard let addr = item.ifa_addr else { continue }
            let family = Int32(addr.pointee.sa_family)
            guard (family == AF_INET || family == AF_INET6),
                  (item.ifa_flags & UInt32(IFF_UP)) != 0,
                  (item.ifa_flags & UInt32(IFF_LOOPBACK)) == 0 else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                result.append(LocalAddress(interface: String(cString: item.ifa_name), address: String(cString: host), family: family == AF_INET ? "IPv4" : "IPv6"))
            }
        }
        addresses = result.sorted { $0.id < $1.id }
    }

    func lookupIP() async {
        guard !lookingUp else { return }
        lookingUp = true
        defer { lookingUp = false }
        do {
            let client = session()
            defer { client.finishTasksAndInvalidate() }
            let (data, response) = try await client.data(from: URL(string: "https://ipapi.co/json/")!)
            guard let response = response as? HTTPURLResponse, (200...299).contains(response.statusCode) else { throw URLError(.badServerResponse) }
            let value = try JSONDecoder().decode(PublicIP.self, from: data)
            guard value.error != true, let ip = value.ip, !ip.isEmpty else { throw URLError(.cannotParseResponse) }
            publicIP = value
            publicIPStatus = "Consultado a las \(Date().formatted(date: .omitted, time: .shortened)). Una VPN o relay puede cambiar el resultado."
        } catch {
            publicIPStatus = "No se pudo consultar. El servicio puede estar bloqueado, limitado o sin conexión. Los resultados anteriores, si aparecen, no se han actualizado."
        }
    }

    private func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 10
        return URLSession(configuration: config)
    }

    func testHTTP(target: String) async {
        guard !testing, let url = URL(string: target), url.scheme == "https" else { return }
        testing = true
        defer { testing = false }
        let client = session()
        defer { client.finishTasksAndInvalidate() }
        for number in 1...5 {
            guard !Task.isCancelled else { httpStatus = "Prueba cancelada"; return }
            httpStatus = "Solicitud \(number) de 5…"
            var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            let start = ProcessInfo.processInfo.systemUptime
            do {
                let (_, response) = try await client.data(for: request)
                guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
                let ms = (ProcessInfo.processInfo.systemUptime - start) * 1000
                measurements.append(HTTPMeasurement(milliseconds: (200...299).contains(response.statusCode) ? ms : nil,
                                                    detail: "\(url.host ?? "Servidor") · HTTP \(response.statusCode)"))
            } catch {
                measurements.append(HTTPMeasurement(milliseconds: nil, detail: "\(url.host ?? "Servidor") · solicitud fallida"))
            }
            measurements = Array(measurements.suffix(60))
        }
        httpStatus = "Serie terminada. El tiempo incluye TLS, servidor y recorrido de red; no es ping al router."
    }

    func startBrowsing() {
        stopBrowsing()
        services = []; serviceSets = [:]; browsing = true
        browseStatus = "Buscando durante 30 s. iOS puede pedir acceso a la red local."
        let generation = UUID(); browseGeneration = generation
        for type in ["_http._tcp", "_workstation._tcp"] {
            let parameters = NWParameters.tcp
            parameters.includePeerToPeer = false
            let browser = NWBrowser(for: .bonjour(type: type, domain: "local."), using: parameters)
            browser.browseResultsChangedHandler = { [weak self] results, _ in
                let records = results.compactMap { result -> ServiceRecord? in
                    guard case let .service(name, serviceType, domain, _) = result.endpoint else { return nil }
                    return ServiceRecord(id: name + "|" + serviceType + "|" + domain, name: name, type: serviceType, domain: domain)
                }
                Task { @MainActor in
                    guard let self, self.browsing, self.browseGeneration == generation else { return }
                    self.serviceSets[type] = records
                    self.services = self.serviceSets.values.flatMap { $0 }.sorted { $0.id < $1.id }
                }
            }
            browser.stateUpdateHandler = { [weak self] state in
                let needsAttention: Bool
                switch state { case .failed, .waiting: needsAttention = true; default: needsAttention = false }
                if needsAttention {
                    Task { @MainActor in
                        guard let self, self.browsing, self.browseGeneration == generation else { return }
                        self.browseStatus = "La búsqueda no está disponible o está esperando. Comprueba Wi-Fi y el permiso Red local en Ajustes."
                    }
                }
            }
            browser.start(queue: .main)
            browsers.append(browser)
        }
        stopTask = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: 30_000_000_000) } catch { return }
            guard !Task.isCancelled else { return }
            self?.stopBrowsing()
        }
    }

    func stopBrowsing() {
        let wasBrowsing = browsing
        browsing = false; browseGeneration = UUID()
        stopTask?.cancel(); stopTask = nil
        browsers.forEach { $0.cancel() }; browsers = []
        if wasBrowsing { browseStatus = "Búsqueda detenida. Resultados de la última búsqueda; no confirman presencia actual ni representan todos los dispositivos." }
    }

    static func isIPv4(_ text: String) -> Bool {
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        return parts.count == 4 && parts.allSatisfy { part in
            !part.isEmpty && part.allSatisfy { $0.isASCII && $0.isNumber } && part.count <= 3 && UInt8(part) != nil
        }
    }

    func addDevice(name: String, ip: String, mac: String) -> Bool {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanIP = ip.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMAC = mac.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "-", with: ":").uppercased()
        guard !cleanName.isEmpty, cleanName.count <= 80, Self.isIPv4(cleanIP),
              cleanMAC.isEmpty || cleanMAC.range(of: "^(?:[A-F0-9]{2}:){5}[A-F0-9]{2}$", options: .regularExpression) != nil else {
            deviceStatus = "Revisa el nombre, IPv4 y MAC opcional."; return false
        }
        guard manualDevices.count < 100, !manualDevices.contains(where: { $0.ip == cleanIP || (!cleanMAC.isEmpty && $0.mac == cleanMAC) }) else {
            deviceStatus = "Ya existe esa IP/MAC o has alcanzado 100 registros."; return false
        }
        manualDevices.append(ManualDevice(name: cleanName, ip: cleanIP, mac: cleanMAC)); saveDevices()
        deviceStatus = "Guardado manualmente en este iPhone."; return true
    }
    func deleteDevices(at offsets: IndexSet) {
        for index in offsets.sorted(by: >) { manualDevices.remove(at: index) }; saveDevices()
    }
    private func saveDevices() {
        if let data = try? JSONEncoder().encode(manualDevices) { UserDefaults.standard.set(data, forKey: deviceKey) }
    }
    var report: String {
        var lines = ["RED · Informe nativo", Date().formatted(), "Conexión: \(connection)", pathStatus]
        lines += addresses.map { "\($0.interface) · \($0.family): \($0.address)" }
        if let value = publicIP { lines += ["IP pública consultada: \(value.ip ?? "—")", "Organización consultada: \(value.org ?? "—")"] }
        lines += ["Servicios observados en la última búsqueda (no inventario completo):"]
        lines += services.map { "\($0.name) · \($0.type)" }
        lines += ["Mediciones HTTP:"]
        lines += measurements.map { "\($0.date.formatted()) · \($0.milliseconds.map { String(format: "%.0f ms", $0) } ?? "Fallo") · \($0.detail)" }
        return lines.joined(separator: "\n")
    }
}
