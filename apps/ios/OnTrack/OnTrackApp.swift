import SwiftUI
import UIKit

@main
struct OnTrackApp: App {
    var body: some Scene {
        WindowGroup {
            appContent
        }
    }

    private var appContent: some View {
        ContentView()
            .onOpenURL(perform: handleWidgetURL)
    }

    private func handleWidgetURL(_ url: URL) {
        guard
            url.scheme == "ontrack",
            url.host == "copy",
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let message = components.queryItems?.first(where: { $0.name == "message" })?.value
        else {
            return
        }

        UIPasteboard.general.string = message
    }
}
