import Foundation

@main
enum ScheduleAcquisitionTests {
    static func main() async throws {
        try await returnsReadyScheduleWithoutRetry()
        try await retriesWarmingForegroundSchedule()
        try await stopsAfterWidgetRetryBudget()
        try await propagatesCancellationDuringBackoff()
        print("ScheduleAcquisitionTests passed")
    }

    private static func returnsReadyScheduleWithoutRetry() async throws {
        let script = FetchScript(responses: [response(status: .hit)])
        let acquisition = acquisition(script: script)

        let result = try await acquisition.load(
            route: route,
            date: Date(),
            intent: .foreground(refreshLive: true)
        )

        expect(result?.meta?.scheduleCacheStatus == .hit, "a ready schedule should return immediately")
        expect(script.refreshLiveValues == [true], "foreground refresh should refresh live data once")
        expect(script.sleepValues.isEmpty, "a ready schedule should not back off")
    }

    private static func retriesWarmingForegroundSchedule() async throws {
        let script = FetchScript(responses: [
            response(status: .warming),
            response(status: .warming),
            response(status: .hit),
        ])
        let result = try await acquisition(script: script).load(
            route: route,
            date: Date(),
            intent: .foreground(refreshLive: true)
        )

        expect(result?.meta?.scheduleCacheStatus == .hit, "foreground acquisition should retry warming data")
        expect(script.refreshLiveValues == [true, false, false], "only the first attempt should refresh live data")
        expect(script.sleepValues == [4_000_000_000, 4_000_000_000], "foreground backoff should retain its budget")
    }

    private static func stopsAfterWidgetRetryBudget() async throws {
        let script = FetchScript(responses: [
            response(status: .warming),
            response(status: .warming),
            response(status: .hit),
        ])
        let result = try await acquisition(script: script).load(
            route: route,
            date: Date(),
            intent: .widget
        )

        expect(result == nil, "widget acquisition should stop after two warming responses")
        expect(script.refreshLiveValues == [false, false], "widget acquisition should not force live refresh")
        expect(script.sleepValues == [2_000_000_000], "widget backoff should retain its shorter budget")
    }

    private static func propagatesCancellationDuringBackoff() async throws {
        let script = FetchScript(responses: [response(status: .warming)])
        let acquisition = ScheduleAcquisition(
            fetch: script.fetch,
            sleep: { _ in throw CancellationError() }
        )

        do {
            _ = try await acquisition.load(route: route, date: Date(), intent: .widget)
            fatalError("cancellation should escape schedule acquisition")
        } catch is CancellationError {
            return
        }
    }

    private static func acquisition(script: FetchScript) -> ScheduleAcquisition {
        ScheduleAcquisition(
            fetch: script.fetch,
            sleep: { nanoseconds in script.sleepValues.append(nanoseconds) }
        )
    }

    private static let origin = Station(
        id: "1000",
        name: "臺北",
        nameEn: "Taipei",
        lat: 25.04775,
        lon: 121.51711
    )
    private static let destination = Station(
        id: "1210",
        name: "新竹",
        nameEn: "Hsinchu",
        lat: 24.80157,
        lon: 120.97157
    )
    private static let route = StationChoice.Route(origin: origin, destination: destination)

    private static func response(status: ScheduleCacheStatus) -> ScheduleResponse {
        ScheduleResponse(
            date: "2026-08-25",
            origin: origin,
            destination: destination,
            trains: [],
            meta: ScheduleMeta(
                scheduleCacheStatus: status,
                scheduleSnapshotFetchedAt: nil,
                liveDataStatus: .fresh,
                liveDataFetchedAt: nil,
                liveDataAgeSeconds: 0
            )
        )
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else {
            fatalError(message)
        }
    }
}

private final class FetchScript {
    private var responses: [ScheduleResponse]
    var refreshLiveValues: [Bool] = []
    var sleepValues: [UInt64] = []

    init(responses: [ScheduleResponse]) {
        self.responses = responses
    }

    func fetch(
        origin: Station,
        destination: Station,
        date: Date,
        refreshLive: Bool
    ) async throws -> ScheduleResponse {
        refreshLiveValues.append(refreshLive)
        return responses.removeFirst()
    }
}
