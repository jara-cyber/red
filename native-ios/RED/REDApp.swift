import SwiftUI

@main
struct REDApp: App {
    @StateObject private var network = NetworkStore()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            ContentView().environmentObject(network)
                .tint(Color(red: 0.25, green: 0.48, blue: 0.32))
                .onChange(of: phase) { value in
                    if value != .active { network.stopBrowsing() }
                    else { network.refreshAddresses() }
                }
        }
    }
}
