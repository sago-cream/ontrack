import CoreLocation
import Foundation

struct WidgetTimelineResult {
    let entries: [TrainWidgetEntry]
    let refreshAfter: Date
}

enum WidgetTimelineLoader {
    private static let refreshInterval: TimeInterval = 15 * 60
    private static let futureEntryWindow: TimeInterval = 3 * 60 * 60
    private static let liveDataFreshnessLimit = 15 * 60
    private static let warmupRetryDelay: UInt64 = 2_000_000_000

    static func load(now: Date = Date()) async -> WidgetTimelineResult {
        let fallbackSnapshot = freshenedFallbackSnapshot(now: now)
        let refreshAfter = now.addingTimeInterval(refreshInterval)

        do {
            async let stationsRequest = APIClient.shared.stations()
            async let coordinateRequest = WidgetLocationRequest().fetch()
            let (stations, coordinate) = try await (stationsRequest, coordinateRequest)

            guard
                let route = resolveRoute(
                    stations: stations,
                    coordinate: coordinate,
                    context: WidgetRouteContextStore.load(),
                    now: now
                ),
                let response = try await loadSchedule(route: route, now: now)
            else {
                return fallbackResult(snapshot: fallbackSnapshot, now: now)
            }

            let entries = timelineEntries(
                response: response,
                context: WidgetRouteContextStore.load(),
                now: now
            )

            guard let firstEntry = entries.first else {
                return fallbackResult(snapshot: fallbackSnapshot, now: now)
            }

            if let snapshot = firstEntry.snapshot {
                WidgetSnapshotStore.saveWithoutReload(snapshot)
            }

            return WidgetTimelineResult(entries: entries, refreshAfter: refreshAfter)
        } catch {
            return fallbackResult(snapshot: fallbackSnapshot, now: now)
        }
    }

    private static func loadSchedule(
        route: (origin: Station, destination: Station),
        now: Date
    ) async throws -> ScheduleResponse? {
        for attempt in 0..<2 {
            let response = try await APIClient.shared.schedule(
                origin: route.origin,
                destination: route.destination,
                date: now
            )

            if response.meta?.scheduleCacheStatus != .warming {
                return response
            }

            if attempt == 0 {
                try? await Task.sleep(nanoseconds: warmupRetryDelay)
            }
        }

        return nil
    }

    private static func resolveRoute(
        stations: [Station],
        coordinate: WidgetCoordinate?,
        context: WidgetRouteContext?,
        now: Date
    ) -> (origin: Station, destination: Station)? {
        let stationMap = Dictionary(uniqueKeysWithValues: stations.map { ($0.id, $0) })
        let locatedOrigin = coordinate.flatMap { nearestStation(to: $0, stations: stations) }
        let fallbackOrigin = context.flatMap {
            stationMap[$0.cachedOriginID] ?? stationMap[$0.originID]
        }
        guard let origin = preferredTaipeiStation(for: locatedOrigin ?? fallbackOrigin, stations: stations) else {
            return nil
        }

        let savedDestination = context.flatMap { stationMap[$0.destinationID] }
        let destination: Station?

        if context?.originID == origin.id,
           savedDestination?.id != origin.id {
            destination = savedDestination
        } else if let context {
            let predictedID = DestinationAutofill.autoFillDestinationID(
                originId: origin.id,
                recordsData: context.frequentDestinationRecordsData,
                legacyDestinationIDs: context.legacyDestinationIDs,
                stations: stations,
                now: now
            )
            destination = stationMap[predictedID] ?? savedDestination
        } else {
            destination = savedDestination
        }

        guard let destination, destination.id != origin.id else {
            return nil
        }

        return (origin, destination)
    }

    private static func nearestStation(
        to coordinate: WidgetCoordinate,
        stations: [Station]
    ) -> Station? {
        let userLocation = CLLocation(
            latitude: coordinate.latitude,
            longitude: coordinate.longitude
        )

        return stations
            .compactMap { station -> (Station, CLLocationDistance)? in
                guard let latitude = station.lat, let longitude = station.lon else {
                    return nil
                }

                let stationLocation = CLLocation(latitude: latitude, longitude: longitude)
                return (station, userLocation.distance(from: stationLocation))
            }
            .min { $0.1 < $1.1 }?
            .0
    }

    private static func preferredTaipeiStation(
        for station: Station?,
        stations: [Station]
    ) -> Station? {
        guard let station, isTaipeiCircularStation(station) else {
            return station
        }

        return stations.first { $0.name == "臺北" } ?? station
    }

    private static func timelineEntries(
        response: ScheduleResponse,
        context: WidgetRouteContext?,
        now: Date
    ) -> [TrainWidgetEntry] {
        let transitionDates = response.trains
            .filter { $0.status != .cancelled }
            .compactMap { departureDate(for: $0, scheduleDate: response.date) }
            .filter { $0 > now && $0 <= now.addingTimeInterval(futureEntryWindow) }
            .map { $0.addingTimeInterval(60) }

        var seenTrainNumbers = Set<String>()
        return ([now] + transitionDates).compactMap { entryDate in
            guard let snapshot = snapshot(
                response: response,
                context: context,
                entryDate: entryDate,
                fetchedAt: now
            ), seenTrainNumbers.insert(snapshot.trainIdentifier).inserted else {
                return nil
            }

            return TrainWidgetEntry(date: entryDate, snapshot: snapshot)
        }
    }

    private static func snapshot(
        response: ScheduleResponse,
        context: WidgetRouteContext?,
        entryDate: Date,
        fetchedAt: Date
    ) -> WidgetSnapshot? {
        let liveDataIsFresh = isLiveDataFresh(
            response.meta,
            entryDate: entryDate,
            fetchedAt: fetchedAt
        )
        let trains = response.trains
            .filter { $0.status != .cancelled }
            .map { train in
                TrainInfo(
                    trainNo: train.trainNo,
                    trainType: train.trainType,
                    direction: train.direction,
                    originStation: train.originStation,
                    destinationStation: train.destinationStation,
                    departureTime: train.departureTime,
                    arrivalTime: train.arrivalTime,
                    tripLine: train.tripLine,
                    price: train.price,
                    delay: liveDataIsFresh ? train.delay : nil,
                    status: liveDataIsFresh ? train.status : .unknown
                )
            }
        let display = TrainDisplay.displaySchedule(
            trains: trains,
            targetTime: Formatters.displayTime.string(from: entryDate),
            timeMode: .departure
        )
        guard let train = display.recommendedTrain else {
            return nil
        }

        let primaryTrain = WidgetTrainSnapshot(
            train: train,
            liveDataIsFresh: liveDataIsFresh
        )
        let trainCards = Array(display.trains.prefix(3)).map {
            WidgetTrainSnapshot(
                train: $0,
                liveDataIsFresh: liveDataIsFresh
            )
        }
        let shareMessage = ShareMessageTemplate.message(
            template: context?.messageTemplate ?? "",
            legacyFormatRaw: context?.messageFormatRaw ?? "arrivalOnly",
            train: train,
            origin: response.origin,
            destination: response.destination
        )

        return WidgetSnapshot(
            trainIdentifier: primaryTrain.trainIdentifier,
            departureTime: primaryTrain.departureTime,
            arrivalTime: primaryTrain.arrivalTime,
            originName: response.origin.displayName,
            destinationName: response.destination.displayName,
            delayMinutes: primaryTrain.delayMinutes,
            shareMessage: shareMessage,
            updatedAt: fetchedAt,
            trainCards: trainCards
        )
    }

    private static func isLiveDataFresh(
        _ meta: ScheduleMeta?,
        entryDate: Date,
        fetchedAt: Date
    ) -> Bool {
        guard meta?.liveDataStatus == .fresh else {
            return false
        }

        let initialAge = max(0, meta?.liveDataAgeSeconds ?? 0)
        let elapsed = max(0, Int(entryDate.timeIntervalSince(fetchedAt)))
        return initialAge + elapsed <= liveDataFreshnessLimit
    }

    private static func departureDate(for train: TrainInfo, scheduleDate: String) -> Date? {
        guard
            let day = Formatters.scheduleDate.date(from: scheduleDate),
            let time = Formatters.displayTime.date(from: train.departureTime)
        else {
            return nil
        }

        let calendar = Formatters.taipeiCalendar
        let dayComponents = calendar.dateComponents([.year, .month, .day], from: day)
        let timeComponents = calendar.dateComponents([.hour, .minute], from: time)
        var components = DateComponents()
        components.year = dayComponents.year
        components.month = dayComponents.month
        components.day = dayComponents.day
        components.hour = timeComponents.hour
        components.minute = timeComponents.minute
        components.timeZone = Formatters.taipeiTimeZone

        return calendar.date(from: components)?.addingTimeInterval(
            TimeInterval(max(0, train.delay ?? 0) * 60)
        )
    }

    private static func fallbackResult(snapshot: WidgetSnapshot?, now: Date) -> WidgetTimelineResult {
        WidgetTimelineResult(
            entries: [TrainWidgetEntry(date: now, snapshot: snapshot)],
            refreshAfter: now.addingTimeInterval(refreshInterval)
        )
    }

    private static func freshenedFallbackSnapshot(now: Date) -> WidgetSnapshot? {
        guard let snapshot = WidgetSnapshotStore.load() else {
            return nil
        }

        guard now.timeIntervalSince(snapshot.updatedAt) > TimeInterval(liveDataFreshnessLimit) else {
            return snapshot
        }

        return WidgetSnapshot(
            trainIdentifier: snapshot.trainIdentifier,
            departureTime: snapshot.departureTime,
            arrivalTime: snapshot.arrivalTime,
            originName: snapshot.originName,
            destinationName: snapshot.destinationName,
            delayMinutes: nil,
            shareMessage: snapshot.shareMessage,
            updatedAt: snapshot.updatedAt,
            trainCards: snapshot.trainCards?.map { $0.removingLiveStatus() }
        )
    }
}

private struct WidgetCoordinate: Sendable {
    let latitude: Double
    let longitude: Double
}

@MainActor
private final class WidgetLocationRequest: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<WidgetCoordinate?, Never>?
    private var timeoutTask: Task<Void, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func fetch() async -> WidgetCoordinate? {
        guard manager.isAuthorizedForWidgetUpdates else {
            return nil
        }

        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            manager.requestLocation()
            timeoutTask = Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                self?.finish(with: nil)
            }
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard let coordinate = locations.last?.coordinate else {
            return
        }

        Task { @MainActor [weak self] in
            self?.finish(with: WidgetCoordinate(
                latitude: coordinate.latitude,
                longitude: coordinate.longitude
            ))
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor [weak self] in
            self?.finish(with: nil)
        }
    }

    private func finish(with coordinate: WidgetCoordinate?) {
        timeoutTask?.cancel()
        timeoutTask = nil
        continuation?.resume(returning: coordinate)
        continuation = nil
    }
}
