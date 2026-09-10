import Foundation

@main
enum WidgetSnapshotProjectionTests {
    static func main() {
        keepsFreshLiveStatusAndAdjustedShareText()
        removesExpiredLiveStatusBeforeProjection()
        ignoresCancelledRecommendedTrains()
        removesLiveStatusFromStoredSnapshots()
        print("WidgetSnapshotProjectionTests passed")
    }

    private static func keepsFreshLiveStatusAndAdjustedShareText() {
        let snapshot = project(
            source: .selected(primary: delayedTrain, cards: [delayedTrain]),
            projectedAt: fetchedAt
        )

        expect(snapshot?.delayMinutes == 5, "fresh live delay should reach the widget snapshot")
        expect(snapshot?.shareMessage.contains("10:05") == true, "fresh share text should use adjusted arrival")
    }

    private static func removesExpiredLiveStatusBeforeProjection() {
        let snapshot = project(
            source: .selected(primary: delayedTrain, cards: [delayedTrain]),
            projectedAt: fetchedAt.addingTimeInterval(901)
        )

        expect(snapshot?.delayMinutes == nil, "expired live delay should not reach the widget snapshot")
        expect(snapshot?.shareMessage.contains("10:00") == true, "expired share text should use scheduled arrival")
    }

    private static func ignoresCancelledRecommendedTrains() {
        let cancelled = train(number: "100", departure: "09:00", arrival: "09:50", delay: 0, status: .cancelled)
        let running = train(number: "200", departure: "09:10", arrival: "10:00", delay: 0, status: .onTime)
        let snapshot = project(
            source: .recommended(
                trains: [cancelled, running],
                targetTime: "08:55",
                timeMode: .departure
            ),
            projectedAt: fetchedAt
        )

        expect(snapshot?.trainIdentifier.contains("200") == true, "cancelled trains should not be recommended")
    }

    private static func removesLiveStatusFromStoredSnapshots() {
        let snapshot = project(
            source: .selected(primary: delayedTrain, cards: [delayedTrain]),
            projectedAt: fetchedAt
        )
        let displayed = WidgetSnapshotProjection.storedSnapshot(
            snapshot,
            displayedAt: fetchedAt.addingTimeInterval(901)
        )

        expect(displayed?.delayMinutes == nil, "stale stored primary delay should be removed")
        expect(displayed?.trainCards?.first?.delayMinutes == nil, "stale stored card delays should be removed")
    }

    private static func project(
        source: WidgetSnapshotProjection.TrainSource,
        projectedAt: Date
    ) -> WidgetSnapshot? {
        WidgetSnapshotProjection.snapshot(
            source: source,
            origin: origin,
            destination: destination,
            meta: freshMeta,
            projectedAt: projectedAt,
            fetchedAt: fetchedAt,
            message: WidgetSnapshotProjection.MessageSettings(
                template: "{{arrivalTime}} {{destination}}",
                legacyFormatRaw: "arrivalOnly"
            )
        )
    }

    private static let fetchedAt = Date(timeIntervalSince1970: 1_787_616_000)
    private static let origin = Station(
        id: "1000",
        name: "臺北",
        nameEn: "Taipei",
        lat: nil,
        lon: nil
    )
    private static let destination = Station(
        id: "1210",
        name: "新竹",
        nameEn: "Hsinchu",
        lat: nil,
        lon: nil
    )
    private static let delayedTrain = train(
        number: "200",
        departure: "09:10",
        arrival: "10:00",
        delay: 5,
        status: .delayed
    )
    private static let freshMeta = ScheduleMeta(
        scheduleCacheStatus: .hit,
        scheduleSnapshotFetchedAt: nil,
        liveDataStatus: .fresh,
        liveDataFetchedAt: nil,
        liveDataAgeSeconds: 0
    )

    private static func train(
        number: String,
        departure: String,
        arrival: String,
        delay: Int,
        status: TrainStatus
    ) -> TrainInfo {
        TrainInfo(
            trainNo: number,
            trainType: "區間",
            direction: 0,
            originStation: origin.name,
            destinationStation: destination.name,
            departureTime: departure,
            arrivalTime: arrival,
            tripLine: 1,
            price: 177,
            delay: delay,
            status: status
        )
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else {
            fatalError(message)
        }
    }
}
