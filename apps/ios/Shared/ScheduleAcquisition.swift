import Foundation

struct ScheduleAcquisition {
    enum Intent {
        case foreground(refreshLive: Bool)
        case widget

        fileprivate var maximumAttempts: Int {
            switch self {
            case .foreground:
                3
            case .widget:
                2
            }
        }

        fileprivate var retryDelayNanoseconds: UInt64 {
            switch self {
            case .foreground:
                4_000_000_000
            case .widget:
                2_000_000_000
            }
        }

        fileprivate var refreshesLiveData: Bool {
            switch self {
            case let .foreground(refreshLive):
                refreshLive
            case .widget:
                false
            }
        }
    }

    typealias Fetch = (
        _ origin: Station,
        _ destination: Station,
        _ date: Date,
        _ refreshLive: Bool
    ) async throws -> ScheduleResponse

    typealias Sleep = (_ nanoseconds: UInt64) async throws -> Void

    private let fetch: Fetch
    private let sleep: Sleep

    init() {
        fetch = { origin, destination, date, refreshLive in
            try await APIClient.shared.schedule(
                origin: origin,
                destination: destination,
                date: date,
                refreshLive: refreshLive
            )
        }
        sleep = { nanoseconds in
            try await Task.sleep(nanoseconds: nanoseconds)
        }
    }

    init(
        fetch: @escaping Fetch,
        sleep: @escaping Sleep
    ) {
        self.fetch = fetch
        self.sleep = sleep
    }

    func load(
        route: StationChoice.Route,
        date: Date,
        intent: Intent
    ) async throws -> ScheduleResponse? {
        for attempt in 0..<intent.maximumAttempts {
            try Task.checkCancellation()
            let response = try await fetch(
                route.origin,
                route.destination,
                date,
                intent.refreshesLiveData && attempt == 0
            )

            guard response.meta?.scheduleCacheStatus == .warming else {
                return response
            }

            if attempt < intent.maximumAttempts - 1 {
                try await sleep(intent.retryDelayNanoseconds)
            }
        }

        return nil
    }
}
