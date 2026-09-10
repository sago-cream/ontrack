import Combine
import Foundation

struct AppUpdate: Equatable {
    let version: String
    let releaseNotes: String?
    let storeURL: URL
}

@MainActor
final class UpdateAvailabilityManager: ObservableObject {
    @Published private(set) var availableUpdate: AppUpdate?

    private static let appStoreID = "6784708806"
    private static let checkInterval: TimeInterval = 24 * 60 * 60
    private static let ignoredVersionKey = "ontrack_ignored_update_version"
    private static let lastCheckDateKey = "ontrack_update_last_checked_at"

    private let session: URLSession
    private let defaults: UserDefaults
    private var isChecking = false

    init(
        session: URLSession = .shared,
        defaults: UserDefaults = .standard
    ) {
        self.session = session
        self.defaults = defaults
    }

    var isUpdateAvailable: Bool {
        availableUpdate != nil
    }

    func checkIfNeeded(now: Date = Date()) async {
#if DEBUG
        if ProcessInfo.processInfo.environment["ONTRACK_UPDATE_AVAILABLE"] == "1"
            || ProcessInfo.processInfo.arguments.contains("--update-available") {
            if defaults.string(forKey: Self.ignoredVersionKey) != "0.5.0" {
                availableUpdate = AppUpdate(
                    version: "0.5.0",
                    releaseNotes: AppText.updatePreviewReleaseNotes,
                    storeURL: Self.storeURL
                )
            }
            return
        }
#endif

        guard !isChecking, shouldCheck(now: now) else {
            return
        }

        isChecking = true
        defer { isChecking = false }

        do {
            let request = URLRequest(
                url: Self.lookupURL,
                cachePolicy: .reloadRevalidatingCacheData,
                timeoutInterval: 10
            )
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200..<300).contains(httpResponse.statusCode) else {
                return
            }

            let lookup = try JSONDecoder().decode(AppStoreLookupResponse.self, from: data)
            defaults.set(now.timeIntervalSince1970, forKey: Self.lastCheckDateKey)
            availableUpdate = lookup.results
                .first
                .flatMap(resolveUpdate)
        } catch {
            // Update discovery is optional and should never interrupt normal use.
        }
    }

    func ignoreAvailableUpdate() {
        guard let availableUpdate else {
            return
        }

        defaults.set(availableUpdate.version, forKey: Self.ignoredVersionKey)
        self.availableUpdate = nil
    }

    private func shouldCheck(now: Date) -> Bool {
        let lastCheck = defaults.double(forKey: Self.lastCheckDateKey)
        return lastCheck == 0 || now.timeIntervalSince1970 - lastCheck >= Self.checkInterval
    }

    private func resolveUpdate(_ result: AppStoreLookupResult) -> AppUpdate? {
        guard result.version.compare(Self.installedVersion, options: .numeric) == .orderedDescending,
              result.version != defaults.string(forKey: Self.ignoredVersionKey),
              let storeURL = URL(string: result.trackViewURL) else {
            return nil
        }

        let releaseNotes = result.releaseNotes?
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return AppUpdate(
            version: result.version,
            releaseNotes: releaseNotes?.isEmpty == false ? releaseNotes : nil,
            storeURL: storeURL
        )
    }

    private static var installedVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    private static var lookupURL: URL {
        var components = URLComponents(string: "https://itunes.apple.com/lookup")!
        components.queryItems = [
            URLQueryItem(name: "id", value: appStoreID),
            URLQueryItem(name: "country", value: "tw"),
        ]
        return components.url!
    }

    private static var storeURL: URL {
        URL(string: "https://apps.apple.com/tw/app/ontrack/id\(appStoreID)")!
    }
}

private struct AppStoreLookupResponse: Decodable {
    let results: [AppStoreLookupResult]
}

private struct AppStoreLookupResult: Decodable {
    let version: String
    let releaseNotes: String?
    let trackViewURL: String

    private enum CodingKeys: String, CodingKey {
        case version
        case releaseNotes
        case trackViewURL = "trackViewUrl"
    }
}
