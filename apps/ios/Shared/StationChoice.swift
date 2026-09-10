import CoreLocation
import Foundation

struct StationCoordinate: Equatable, Sendable {
    let latitude: Double
    let longitude: Double
}

struct StationChoiceHistory {
    let recordsData: String
    let legacyDestinationIDs: [String]
}

struct StationChoice {
    struct Route {
        let origin: Station
        let destination: Station
    }

    struct RouteContext {
        let originID: String
        let destinationID: String
        let cachedOriginID: String
        let history: StationChoiceHistory
    }

    enum SuggestionKind: String {
        case algorithmic
        case history
        case regular
    }

    struct Suggestion: Identifiable {
        let station: Station
        let kind: SuggestionKind

        var id: String {
            "\(kind.rawValue)-\(station.id)"
        }
    }

    private let stations: [Station]
    private let stationMap: [String: Station]

    init(stations: [Station]) {
        self.stations = stations
        stationMap = Dictionary(uniqueKeysWithValues: stations.map { ($0.id, $0) })
    }

    func station(id: String) -> Station? {
        stationMap[id]
    }

    var defaultOrigin: Station? {
        stations.first { $0.name == "臺北" || $0.name == "台北" } ?? stations.first
    }

    func preferredStation(id: String) -> Station? {
        guard let station = stationMap[id] else {
            return nil
        }

        return preferredStation(station)
    }

    func nearbyStations(to coordinate: StationCoordinate) -> [Station] {
        let location = CLLocation(
            latitude: coordinate.latitude,
            longitude: coordinate.longitude
        )

        return stations
            .compactMap { station -> (station: Station, distance: CLLocationDistance)? in
                guard let latitude = station.lat, let longitude = station.lon else {
                    return nil
                }

                let stationLocation = CLLocation(latitude: latitude, longitude: longitude)
                return (station, location.distance(from: stationLocation))
            }
            .sorted { $0.distance < $1.distance }
            .map(\.station)
    }

    func destinationRecommendations(
        originID: String,
        history: StationChoiceHistory,
        now: Date = Date()
    ) -> [Station] {
        DestinationAutofill.rankedDestinationIDs(
            originId: originID,
            excludedId: originID,
            recordsData: history.recordsData,
            legacyDestinationIDs: history.legacyDestinationIDs,
            stations: stations,
            now: now
        )
        .compactMap { stationMap[$0] }
    }

    func destinationHistory(_ history: StationChoiceHistory) -> [Station] {
        DestinationAutofill.historyDestinationIDs(
            recordsData: history.recordsData,
            legacyDestinationIDs: history.legacyDestinationIDs
        )
        .compactMap { stationMap[$0] }
    }

    func recordingDestination(
        _ destinationID: String,
        from originID: String,
        history: StationChoiceHistory,
        now: Date = Date()
    ) -> StationChoiceHistory {
        StationChoiceHistory(
            recordsData: DestinationAutofill.recordDestination(
                originId: originID,
                stationId: destinationID,
                recordsData: history.recordsData,
                legacyDestinationIDs: history.legacyDestinationIDs,
                now: now
            ),
            legacyDestinationIDs: []
        )
    }

    func autoFilledDestination(
        originID: String,
        history: StationChoiceHistory,
        now: Date = Date()
    ) -> Station? {
        destinationRecommendations(originID: originID, history: history, now: now).first
    }

    func route(
        context: RouteContext,
        coordinate: StationCoordinate?,
        now: Date = Date()
    ) -> Route? {
        let locatedOrigin = coordinate.flatMap { nearbyStations(to: $0).first }
        let fallbackOrigin = stationMap[context.cachedOriginID] ?? stationMap[context.originID]
        guard let origin = (locatedOrigin ?? fallbackOrigin).map(preferredStation) else {
            return nil
        }

        let savedDestination = stationMap[context.destinationID]
        let destination: Station?

        if context.originID == origin.id, savedDestination?.id != origin.id {
            destination = savedDestination
        } else {
            destination = autoFilledDestination(
                originID: origin.id,
                history: context.history,
                now: now
            ) ?? savedDestination
        }

        guard let destination, destination.id != origin.id else {
            return nil
        }

        return Route(origin: origin, destination: destination)
    }

    func suggestions(
        query: String,
        selectedID: String?,
        recommendations: [Station],
        history: [Station]
    ) -> [Suggestion] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let searchMatches = trimmedQuery.isEmpty
            ? []
            : matchingStations(query: trimmedQuery).filter { $0.id != selectedID }
        let coveredSearchIDs = Set(searchMatches.map(\.id))
        let visibleRecommendations = recommendations
            .filter {
                $0.id != selectedID
                    && !coveredSearchIDs.contains($0.id)
                    && !Self.isCircularStation($0)
            }
            .prefix(3)
        let coveredRecommendationIDs = Set(visibleRecommendations.map(\.id))
        let uncoveredHistory = history.filter {
            $0.id != selectedID
                && !coveredSearchIDs.contains($0.id)
                && !coveredRecommendationIDs.contains($0.id)
                && !Self.isCircularStation($0)
        }
        let visibleHistory = searchMatches.isEmpty
            ? uncoveredHistory
            : Array(uncoveredHistory.prefix(2))
        let coveredIDs = Set(
            searchMatches.map(\.id)
                + visibleRecommendations.map(\.id)
                + visibleHistory.map(\.id)
        )
        let otherStations = stations.filter {
            $0.id != selectedID
                && !coveredIDs.contains($0.id)
                && !Self.isCircularStation($0)
        }

        return searchMatches.map { Suggestion(station: $0, kind: .regular) }
            + visibleRecommendations.map { Suggestion(station: $0, kind: .algorithmic) }
            + visibleHistory.map { Suggestion(station: $0, kind: .history) }
            + otherStations.map { Suggestion(station: $0, kind: .regular) }
    }

    static func isCircularStation(_ station: Station) -> Bool {
        station.name
            .replacingOccurrences(of: "台", with: "臺")
            .replacingOccurrences(of: #"[\s()（）-]"#, with: "", options: .regularExpression)
            == "臺北環島"
    }

    private func preferredStation(_ station: Station) -> Station {
        guard Self.isCircularStation(station) else {
            return station
        }

        return stations.first { $0.name == "臺北" } ?? station
    }

    private func matchingStations(query: String) -> [Station] {
        let normalizedQuery = query.replacingOccurrences(of: "台", with: "臺")
        let normalizedEnglishQuery = normalizedEnglishName(query)
        let allowsCircularStation = isCircularSearch(query)

        return stations
            .enumerated()
            .compactMap { index, station -> (station: Station, priority: Int, index: Int)? in
                let normalizedStationName = normalizedEnglishName(station.nameEn)
                let matches = station.name.localizedCaseInsensitiveContains(query)
                    || station.name.localizedCaseInsensitiveContains(normalizedQuery)
                    || normalizedStationName.contains(normalizedEnglishQuery)
                    || station.id.localizedCaseInsensitiveContains(query)

                guard matches, allowsCircularStation || !Self.isCircularStation(station) else {
                    return nil
                }

                let exactMatch = station.name == query
                    || station.name == normalizedQuery
                    || normalizedStationName == normalizedEnglishQuery
                return (station, exactMatch ? 0 : 1, index)
            }
            .sorted { lhs, rhs in
                lhs.priority == rhs.priority ? lhs.index < rhs.index : lhs.priority < rhs.priority
            }
            .map(\.station)
    }

    private func normalizedEnglishName(_ value: String) -> String {
        value
            .replacingOccurrences(of: "_", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private func isCircularSearch(_ value: String) -> Bool {
        let normalizedValue = value
            .replacingOccurrences(of: "台", with: "臺")
            .lowercased()

        return normalizedValue.contains("環島")
            || normalizedValue.contains("circular")
            || normalizedValue.contains("circle")
            || normalizedValue.contains("loop")
            || normalizedValue.contains("round island")
            || normalizedValue.contains("around island")
            || normalizedValue.contains("surround island")
    }
}
