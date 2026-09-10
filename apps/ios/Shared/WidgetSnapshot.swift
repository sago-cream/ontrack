import Foundation
import WidgetKit

struct WidgetTrainSnapshot: Codable, Equatable {
    let trainIdentifier: String
    let departureTime: String
    let arrivalTime: String
    let delayMinutes: Int?
    let price: String?

    init(train: TrainInfo, liveDataIsFresh: Bool) {
        let delay = liveDataIsFresh ? train.delay : nil
        trainIdentifier = [
            "\(TrainDisplay.trainType(train.trainType)) \(train.trainNo)",
            TrainDisplay.tripLine(train.tripLine),
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
        departureTime = train.departureTime
        arrivalTime = train.arrivalTime
        delayMinutes = liveDataIsFresh ? max(0, delay ?? 0) : nil
        price = TrainDisplay.price(train.price)
    }

    init(
        trainIdentifier: String,
        departureTime: String,
        arrivalTime: String,
        delayMinutes: Int?,
        price: String? = nil
    ) {
        self.trainIdentifier = trainIdentifier
        self.departureTime = departureTime
        self.arrivalTime = arrivalTime
        self.delayMinutes = delayMinutes
        self.price = price
    }

    func removingLiveStatus() -> WidgetTrainSnapshot {
        WidgetTrainSnapshot(
            trainIdentifier: trainIdentifier,
            departureTime: departureTime,
            arrivalTime: arrivalTime,
            delayMinutes: nil,
            price: price
        )
    }
}

struct WidgetSnapshot: Codable, Equatable {
    let trainIdentifier: String
    let departureTime: String
    let arrivalTime: String
    let originName: String
    let destinationName: String
    let delayMinutes: Int?
    let shareMessage: String
    let updatedAt: Date
    let trainCards: [WidgetTrainSnapshot]?

    init(
        trainIdentifier: String,
        departureTime: String,
        arrivalTime: String,
        originName: String,
        destinationName: String,
        delayMinutes: Int?,
        shareMessage: String,
        updatedAt: Date,
        trainCards: [WidgetTrainSnapshot]? = nil
    ) {
        self.trainIdentifier = trainIdentifier
        self.departureTime = departureTime
        self.arrivalTime = arrivalTime
        self.originName = originName
        self.destinationName = destinationName
        self.delayMinutes = delayMinutes
        self.shareMessage = shareMessage
        self.updatedAt = updatedAt
        self.trainCards = trainCards
    }

    var copyURL: URL? {
        var components = URLComponents()
        components.scheme = "ontrack"
        components.host = "copy"
        components.queryItems = [
            URLQueryItem(name: "message", value: shareMessage),
        ]
        return components.url
    }

    var displayedTrainCards: [WidgetTrainSnapshot] {
        if let trainCards, !trainCards.isEmpty {
            return Array(trainCards.prefix(3))
        }

        return [
            WidgetTrainSnapshot(
                trainIdentifier: trainIdentifier,
                departureTime: departureTime,
                arrivalTime: arrivalTime,
                delayMinutes: delayMinutes,
                price: nil
            ),
        ]
    }
}

extension WidgetSnapshot {
    static let preview = WidgetSnapshot(
        trainIdentifier: "區間 125 · 山線",
        departureTime: "09:42",
        arrivalTime: "10:58",
        originName: "臺北",
        destinationName: "新竹",
        delayMinutes: 4,
        shareMessage: "10:58 到新竹",
        updatedAt: Date(),
        trainCards: [
            WidgetTrainSnapshot(
                trainIdentifier: "區間快 2005 · 山線",
                departureTime: "09:42",
                arrivalTime: "10:58",
                delayMinutes: 0,
                price: "NT$163"
            ),
            WidgetTrainSnapshot(
                trainIdentifier: "區間 1107 · 山線",
                departureTime: "09:50",
                arrivalTime: "11:33",
                delayMinutes: 2,
                price: "NT$163"
            ),
            WidgetTrainSnapshot(
                trainIdentifier: "區間 2133 · 山線",
                departureTime: "10:02",
                arrivalTime: "11:46",
                delayMinutes: 12,
                price: "NT$163"
            ),
        ]
    )
}

enum WidgetSnapshotStore {
    static let suiteName = "group.dev.hsichen.ontrack"
    static let widgetKind = "OnTrackTrainWidget"
    static let routeCardsWidgetKind = "OnTrackRouteCardsWidget"

    private static let snapshotKey = "ontrack_widget_snapshot"
    private static let widgetKinds = [widgetKind, routeCardsWidgetKind]

    static func load() -> WidgetSnapshot? {
        guard
            let data = UserDefaults(suiteName: suiteName)?.data(forKey: snapshotKey),
            let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
        else {
            return nil
        }

        return snapshot
    }

    static func save(_ snapshot: WidgetSnapshot) {
        saveWithoutReload(snapshot)
        reloadAllTimelines()
    }

    static func saveWithoutReload(_ snapshot: WidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else {
            return
        }

        UserDefaults(suiteName: suiteName)?.set(data, forKey: snapshotKey)
    }

    static func clear() {
        UserDefaults(suiteName: suiteName)?.removeObject(forKey: snapshotKey)
        reloadAllTimelines()
    }

    static func reloadAllTimelines() {
        for kind in widgetKinds {
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }
    }
}

enum WidgetAppearanceSetting: String {
    case system
    case light
    case dark
    case sage
    case amethyst
    case ember
}

enum WidgetAppearanceStore {
    private static let appearanceKey = "ontrack_widget_appearance"

    static func load() -> WidgetAppearanceSetting {
        guard
            let rawValue = UserDefaults(suiteName: WidgetSnapshotStore.suiteName)?
                .string(forKey: appearanceKey),
            let setting = WidgetAppearanceSetting(rawValue: rawValue)
        else {
            return .light
        }

        return setting
    }

    static func save(rawValue: String) {
        guard let setting = WidgetAppearanceSetting(rawValue: rawValue),
              let defaults = UserDefaults(suiteName: WidgetSnapshotStore.suiteName),
              defaults.string(forKey: appearanceKey) != setting.rawValue else {
            return
        }

        defaults.set(setting.rawValue, forKey: appearanceKey)
        WidgetSnapshotStore.reloadAllTimelines()
    }
}

struct WidgetRouteContext: Codable, Equatable {
    let originID: String
    let destinationID: String
    let cachedOriginID: String
    let frequentDestinationRecordsData: String
    let legacyDestinationIDs: [String]
    let messageFormatRaw: String
    let messageTemplate: String?
}

enum WidgetRouteContextStore {
    private static let contextKey = "ontrack_widget_route_context"

    static func load() -> WidgetRouteContext? {
        guard
            let data = UserDefaults(suiteName: WidgetSnapshotStore.suiteName)?.data(forKey: contextKey),
            let context = try? JSONDecoder().decode(WidgetRouteContext.self, from: data)
        else {
            return nil
        }

        return context
    }

    static func save(_ context: WidgetRouteContext) {
        guard let data = try? JSONEncoder().encode(context) else {
            return
        }

        UserDefaults(suiteName: WidgetSnapshotStore.suiteName)?.set(data, forKey: contextKey)
    }
}
