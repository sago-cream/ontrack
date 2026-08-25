import Foundation

@main
enum StationChoiceTests {
    static func main() {
        hidesCircularTaipeiUntilExplicitlySearched()
        deduplicatesRecommendationAndHistoryRows()
        normalizesLocatedCircularTaipei()
        print("StationChoiceTests passed")
    }

    private static func hidesCircularTaipeiUntilExplicitlySearched() {
        let choice = StationChoice(stations: stations)

        expect(
            !choice.suggestions(
                query: "",
                selectedID: nil,
                recommendations: [],
                history: []
            ).contains { $0.station.id == "1000-C" },
            "circular Taipei should stay out of ordinary suggestions"
        )
        expect(
            choice.suggestions(
                query: "環島",
                selectedID: nil,
                recommendations: [],
                history: []
            ).first?.station.id == "1000-C",
            "an explicit circular search should find circular Taipei"
        )
    }

    private static func deduplicatesRecommendationAndHistoryRows() {
        let choice = StationChoice(stations: stations)
        let suggestions = choice.suggestions(
            query: "",
            selectedID: "1000",
            recommendations: [stations[2]],
            history: [stations[2]]
        )

        expect(
            suggestions.filter { $0.station.id == "1210" }.count == 1,
            "one station should not appear in recommendation and history rows"
        )
        expect(
            suggestions.first { $0.station.id == "1210" }?.kind == .algorithmic,
            "recommendations should keep their row kind"
        )
    }

    private static func normalizesLocatedCircularTaipei() {
        let choice = StationChoice(stations: stations)
        let route = choice.route(
            context: StationChoice.RouteContext(
                originID: "1000",
                destinationID: "1210",
                cachedOriginID: "1000",
                history: StationChoiceHistory(recordsData: "", legacyDestinationIDs: [])
            ),
            coordinate: StationCoordinate(latitude: 25.049, longitude: 121.516)
        )

        expect(route?.origin.id == "1000", "located circular Taipei should resolve to regular Taipei")
        expect(route?.destination.id == "1210", "a saved destination should survive route resolution")
    }

    private static let stations = [
        Station(id: "1000", name: "臺北", nameEn: "Taipei", lat: 25.04775, lon: 121.51711),
        Station(id: "1000-C", name: "臺北-環島", nameEn: "Taipei_Circular", lat: 25.049, lon: 121.516),
        Station(id: "1210", name: "新竹", nameEn: "Hsinchu", lat: 24.80157, lon: 120.97157),
    ]

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else {
            fatalError(message)
        }
    }
}
