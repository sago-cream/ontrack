import Foundation

enum AppPreferenceKey {
    static let appearance = "ontrack_appearance"
    static let darkMode = "ontrack_dark_mode"
    static let language = "ontrack_language"
    static let messageFormat = "ontrack_message_format"
    static let electronicTicketOnly = "ontrack_electronic_ticket_only"
    static let messageTemplate = "ontrack_message_template"
}

enum AppLanguageSetting: String, CaseIterable, Identifiable {
    case system
    case zhTW
    case en

    var id: String { rawValue }

    static var current: AppLanguageSetting {
        guard let rawValue = UserDefaults.standard.string(forKey: AppPreferenceKey.language),
              let setting = AppLanguageSetting(rawValue: rawValue) else {
            return .system
        }

        return setting
    }

    var isZh: Bool {
        switch self {
        case .system:
            Locale.current.language.languageCode?.identifier == "zh"
        case .zhTW:
            true
        case .en:
            false
        }
    }
}

enum AppAppearanceSetting: String, CaseIterable, Identifiable {
    case system
    case light
    case dark
    case sage
    case amethyst
    case ember

    var id: String { rawValue }

    var requiresSupporter: Bool {
        switch self {
        case .system, .light, .dark:
            false
        case .sage, .amethyst, .ember:
            true
        }
    }

    static var current: AppAppearanceSetting {
        if let rawValue = UserDefaults.standard.string(forKey: AppPreferenceKey.appearance),
           let setting = AppAppearanceSetting(rawValue: rawValue) {
            return setting
        }

        if UserDefaults.standard.object(forKey: AppPreferenceKey.darkMode) != nil {
            return UserDefaults.standard.bool(forKey: AppPreferenceKey.darkMode) ? .dark : .light
        }

        return .light
    }
}

private enum AppLanguage {
    static var isZh: Bool {
        AppLanguageSetting.current.isZh
    }
}

struct Station: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let nameEn: String
    let lat: Double?
    let lon: Double?

    var displayName: String {
        AppLanguage.isZh ? name : nameEn.replacingOccurrences(of: "_", with: " ")
    }
}

func isTaipeiCircularStation(_ station: Station) -> Bool {
    station.name
        .replacingOccurrences(of: "台", with: "臺")
        .replacingOccurrences(of: #"[\s()（）-]"#, with: "", options: .regularExpression)
        == "臺北環島"
}

struct TrainInfo: Decodable, Identifiable {
    let trainNo: String
    let trainType: String
    let direction: Int
    let originStation: String
    let destinationStation: String
    let departureTime: String
    let arrivalTime: String
    let tripLine: Int?
    let price: Int?
    let delay: Int?
    let status: TrainStatus

    var id: String { trainNo }

    var supportsElectronicTicket: Bool {
        let unsupportedMarkers = [
            "觀光", "團體", "太魯閣", "普悠瑪", "新自強",
            "3000", "專開", "商務", "親子", "郵輪",
        ]
        return !unsupportedMarkers.contains { trainType.contains($0) }
    }
}

enum TrainStatus: String, Decodable {
    case onTime = "on-time"
    case delayed
    case cancelled
    case unknown
}

struct ScheduleResponse: Decodable {
    let date: String
    let origin: Station
    let destination: Station
    let trains: [TrainInfo]
    let meta: ScheduleMeta?
}

struct ScheduleMeta: Decodable {
    let scheduleCacheStatus: ScheduleCacheStatus
    let scheduleSnapshotFetchedAt: String?
    let liveDataStatus: LiveDataStatus
    let liveDataFetchedAt: String?
    let liveDataAgeSeconds: Int?
}

enum ScheduleCacheStatus: String, Decodable {
    case hit
    case derived
    case warming
}

enum LiveDataStatus: String, Decodable {
    case fresh
    case stale
    case unavailable
    case notApplicable = "not-applicable"
}

enum TimeMode: String, CaseIterable, Identifiable {
    case now
    case departure
    case arrival
    case lastTrain

    var id: String { rawValue }

    var title: String {
        switch self {
        case .now:
            AppText.now
        case .departure:
            AppText.departure
        case .arrival:
            AppText.arrival
        case .lastTrain:
            AppText.lastTrain
        }
    }

    var scheduleMode: TimeMode {
        switch self {
        case .now, .lastTrain:
            .departure
        case .departure, .arrival:
            self
        }
    }
}

struct TimeSelection: Equatable {
    var mode: TimeMode
    var date: Date

    static let futureDayLimit = 7
    static let lastTrainHour = 23
    static let lastTrainMinute = 59

    static func current(mode: TimeMode = .now, date: Date = Date()) -> TimeSelection {
        TimeSelection(
            mode: mode,
            date: date
        )
    }

    var scheduleDate: Date {
        date
    }

    var scheduleTime: String {
        if mode == .lastTrain {
            return String(format: "%02d:%02d", Self.lastTrainHour, Self.lastTrainMinute)
        }

        return Formatters.displayTime.string(from: date)
    }
}

struct DisplaySchedule {
    let trains: [TrainInfo]
    let recommendedTrain: TrainInfo?
}

enum TrainDisplay {
    enum TrainTypeEmphasis {
        case neutral
        case mixed
        case primary
    }

    private static let trainTypeEN: [String: String] = [
        "自強": "TC",
        "莒光": "CK",
        "區間": "Local",
        "區間快": "F.Local",
        "太魯閣": "Taroko",
        "普悠瑪": "Puyuma",
        "新自強": "N.TC",
    ]

    static func trainType(_ trainType: String) -> String {
        let base = trainTypeBase(trainType)

        if AppLanguage.isZh {
            return base
        }

        return trainTypeEN[base] ?? base
    }

    static func trainTypeEmphasis(_ trainType: String) -> TrainTypeEmphasis {
        switch trainTypeBase(trainType) {
        case "自強", "太魯閣", "普悠瑪", "新自強":
            .primary
        case "區間快":
            .mixed
        default:
            .neutral
        }
    }

    private static func trainTypeBase(_ trainType: String) -> String {
        trainType
            .split(separator: "(", maxSplits: 1)
            .first
            .map(String.init)?
            .replacingOccurrences(of: "號", with: "") ?? trainType
    }

    static func trainIdentifier(trainType: String, number: String) -> String {
        let separator = AppLanguage.isZh ? "" : " "
        return "\(Self.trainType(trainType))\(separator)\(number)"
    }

    static func tripLine(_ tripLine: Int?) -> String? {
        switch tripLine {
        case 1:
            AppText.mountainLine
        case 2:
            AppText.coastLine
        default:
            nil
        }
    }

    static func price(_ price: Int?) -> String? {
        guard let price else { return nil }
        return "NT$\(price.formatted())"
    }

    static func adjustedTime(_ time: String, delay: Int?) -> String {
        addMinutes(delay ?? 0, to: time)
    }

    static func tripDuration(departure: String, arrival: String) -> String {
        let minutes = tripMinutes(departure: departure, arrival: arrival)
        let hours = minutes / 60
        let remainingMinutes = minutes % 60

        if hours == 0 {
            return "\(remainingMinutes)m"
        }

        return remainingMinutes == 0 ? "\(hours)h" : "\(hours)h\(remainingMinutes)m"
    }

    static func displaySchedule(trains: [TrainInfo], targetTime: String, timeMode: TimeMode) -> DisplaySchedule {
        let targetMinutes = timeToMinutes(targetTime)
        let comparisonMinutes: (TrainInfo) -> Int = { train in
            switch timeMode {
            case .now, .departure, .lastTrain:
                timeToMinutes(train.departureTime) + (train.delay ?? 0)
            case .arrival:
                timeToMinutes(train.arrivalTime)
            }
        }
        let orderedTrains = trains.enumerated()
            .sorted { lhs, rhs in
                let lhsMinutes = comparisonMinutes(lhs.element)
                let rhsMinutes = comparisonMinutes(rhs.element)
                return lhsMinutes == rhsMinutes ? lhs.offset < rhs.offset : lhsMinutes < rhsMinutes
            }
            .map(\.element)
        let nextCatchableIndex = orderedTrains.firstIndex {
            comparisonMinutes($0) >= targetMinutes
        }

        guard let nextCatchableIndex else {
            let displayTrains = Array(orderedTrains.suffix(3))
            return DisplaySchedule(trains: displayTrains, recommendedTrain: displayTrains.last)
        }

        let end = min(orderedTrains.count, nextCatchableIndex + 3)
        let displayTrains = Array(orderedTrains[nextCatchableIndex..<end])

        return DisplaySchedule(
            trains: displayTrains,
            recommendedTrain: displayTrains.first
        )
    }

    private static func tripMinutes(departure: String, arrival: String) -> Int {
        var diff = timeToMinutes(arrival) - timeToMinutes(departure)
        if diff < 0 {
            diff += 24 * 60
        }
        return diff
    }

    private static func addMinutes(_ minutes: Int, to time: String) -> String {
        let total = timeToMinutes(time) + minutes
        let hours = (total / 60) % 24
        let displayMinutes = total % 60
        return "\(String(format: "%02d", hours)):\(String(format: "%02d", displayMinutes))"
    }

    private static func timeToMinutes(_ time: String) -> Int {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else {
            return 0
        }

        return parts[0] * 60 + parts[1]
    }

}

enum ShareMessageTemplate {
    private struct TokenMatch {
        let range: NSRange
    }

    struct Preset: Identifiable {
        let id: String
        let title: String
        let template: String
    }

    struct Field: Identifiable {
        let id: String
        let title: String

        var token: String { "{{\(id)}}" }
    }

    static var defaultTemplate: String {
        AppLanguageSetting.current.isZh
            ? "{{arrivalTime}}到{{destination}}"
            : "Arrive at {{destination}} at {{arrivalTime}}"
    }

    static var presets: [Preset] {
        if AppLanguageSetting.current.isZh {
            return [
                Preset(
                    id: "arrival",
                    title: AppText.arrivalOnlyMessageFormat,
                    template: "{{arrivalTime}}到{{destination}}"
                ),
                Preset(
                    id: "route",
                    title: AppText.routeArrivalMessageFormat,
                    template: "{{origin}}→{{destination}} {{arrivalTime}}到"
                ),
                Preset(
                    id: "ride",
                    title: AppText.rideMessageFormat,
                    template: "我搭{{trainType}}{{trainNumber}} {{arrivalTime}}到{{destination}}"
                ),
            ]
        }

        return [
            Preset(
                id: "arrival",
                title: AppText.arrivalOnlyMessageFormat,
                template: "Arrive at {{destination}} at {{arrivalTime}}"
            ),
            Preset(
                id: "route",
                title: AppText.routeArrivalMessageFormat,
                template: "{{origin}} → {{destination}}, arriving {{arrivalTime}}"
            ),
            Preset(
                id: "ride",
                title: AppText.rideMessageFormat,
                template: "I'm taking {{trainType}} {{trainNumber}}, arriving {{arrivalTime}} at {{destination}}"
            ),
        ]
    }

    static var fields: [Field] {
        [
            Field(id: "arrivalTime", title: AppText.messageFieldTime),
            Field(id: "departureTime", title: AppText.departureTime),
            Field(id: "trainType", title: AppText.messageFieldTrainType),
            Field(id: "trainNumber", title: AppText.messageFieldTrainNumber),
            Field(id: "origin", title: AppText.origin),
            Field(id: "destination", title: AppText.destination),
            Field(id: "duration", title: AppText.messageFieldDuration),
            Field(id: "fare", title: AppText.messageFieldFare),
            Field(id: "delay", title: AppText.messageFieldDelay),
            Field(id: "line", title: AppText.messageFieldLine),
        ]
    }

    static var sampleValues: [String: String] {
        [
            "arrivalTime": "09:41",
            "departureTime": "08:35",
            "trainType": AppLanguageSetting.current.isZh ? "區間" : "Local",
            "trainNumber": "1120",
            "origin": AppText.exampleOriginStation,
            "destination": AppText.exampleDestinationStation,
            "duration": "1h6m",
            "fare": "NT$177",
            "delay": AppLanguageSetting.current.isZh ? "準點" : "On time",
            "line": AppText.mountainLine,
        ]
    }

    static func resolved(_ template: String, legacyFormatRaw: String) -> String {
        guard template.isEmpty else {
            return template
        }

        if legacyFormatRaw == "routeArrival" {
            return presets.first { $0.id == "route" }?.template ?? defaultTemplate
        }

        return defaultTemplate
    }

    static func render(_ template: String, values: [String: String]) -> String {
        var message = template
        for field in fields {
            message = message.replacingOccurrences(
                of: field.token,
                with: values[field.id] ?? ""
            )
        }
        return message.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func displayLength(_ template: String) -> Int {
        let rawLength = (template as NSString).length
        return tokenMatches(in: template).reduce(rawLength) {
            $0 - $1.range.length + 1
        }
    }

    static func templateRange(
        forDisplayRange displayRange: NSRange,
        in template: String
    ) -> NSRange {
        let matches = tokenMatches(in: template)
        let displayLength = displayLength(template)
        let start = min(displayRange.location, displayLength)
        let end = min(displayRange.location + displayRange.length, displayLength)
        let rawStart = templateOffset(
            forDisplayOffset: start,
            template: template,
            matches: matches
        )
        let rawEnd = templateOffset(
            forDisplayOffset: end,
            template: template,
            matches: matches
        )

        return NSRange(location: rawStart, length: rawEnd - rawStart)
    }

    static func values(
        train: TrainInfo,
        origin: Station?,
        destination: Station
    ) -> [String: String] {
        let delay = train.delay ?? 0
        return [
            "arrivalTime": TrainDisplay.adjustedTime(train.arrivalTime, delay: train.delay),
            "departureTime": TrainDisplay.adjustedTime(train.departureTime, delay: train.delay),
            "trainType": TrainDisplay.trainType(train.trainType),
            "trainNumber": train.trainNo,
            "origin": origin?.displayName ?? AppText.origin,
            "destination": destination.displayName,
            "duration": TrainDisplay.tripDuration(
                departure: train.departureTime,
                arrival: train.arrivalTime
            ),
            "fare": TrainDisplay.price(train.price) ?? "",
            "delay": delay > 0
                ? (AppLanguageSetting.current.isZh ? "誤點 \(delay) 分鐘" : "Delayed \(delay) minutes")
                : (AppLanguageSetting.current.isZh ? "準點" : "On time"),
            "line": TrainDisplay.tripLine(train.tripLine) ?? "",
        ]
    }

    static func message(
        template: String,
        legacyFormatRaw: String,
        train: TrainInfo,
        origin: Station?,
        destination: Station
    ) -> String {
        render(
            resolved(template, legacyFormatRaw: legacyFormatRaw),
            values: values(train: train, origin: origin, destination: destination)
        )
    }

    private static func tokenMatches(in template: String) -> [TokenMatch] {
        let source = template as NSString
        let expression = try? NSRegularExpression(
            pattern: #"\{\{(\w+)\}\}"#
        )

        return expression?
            .matches(
                in: template,
                range: NSRange(location: 0, length: source.length)
            )
            .compactMap { match in
                guard
                    match.numberOfRanges > 1,
                    fields.contains(where: {
                        $0.id == source.substring(with: match.range(at: 1))
                    })
                else {
                    return nil
                }

                return TokenMatch(range: match.range)
            } ?? []
    }

    private static func templateOffset(
        forDisplayOffset targetOffset: Int,
        template: String,
        matches: [TokenMatch]
    ) -> Int {
        let sourceLength = (template as NSString).length
        var rawCursor = 0
        var displayCursor = 0

        for match in matches {
            let plainTextLength = match.range.location - rawCursor
            if targetOffset <= displayCursor + plainTextLength {
                return rawCursor + targetOffset - displayCursor
            }

            rawCursor += plainTextLength
            displayCursor += plainTextLength

            if targetOffset <= displayCursor + 1 {
                return targetOffset == displayCursor
                    ? match.range.location
                    : NSMaxRange(match.range)
            }

            rawCursor = NSMaxRange(match.range)
            displayCursor += 1
        }

        return min(
            rawCursor + targetOffset - displayCursor,
            sourceLength
        )
    }
}

enum Formatters {
    static let taipeiTimeZone = TimeZone(identifier: "Asia/Taipei")!
    static var taipeiCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = taipeiTimeZone
        return calendar
    }

    static let scheduleDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = taipeiCalendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = taipeiTimeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static let displayTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = taipeiCalendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = taipeiTimeZone
        formatter.dateFormat = "HH:mm"
        return formatter
    }()
}

enum AppText {
    private static var isZh: Bool {
        AppLanguage.isZh
    }

    static var now: String { isZh ? "現在" : "Now" }
    static var leaveNow: String { isZh ? "立即出發" : "Leave now" }
    static var departure: String { isZh ? "出發" : "Depart" }
    static var arrival: String { isZh ? "抵達" : "Arrive" }
    static var lastTrain: String { isZh ? "末班" : "Last" }
    static var queryTodayLastTrain: String { isZh ? "查詢今日末班車" : "Find today's last train" }
    static var chooseRoute: String { isZh ? "選擇路線" : "Choose a route" }
    static var noTrainsAvailable: String { isZh ? "查無可搭乘班次" : "No trains available" }
    static var origin: String { isZh ? "出發站" : "Origin" }
    static var destination: String { isZh ? "抵達站" : "Destination" }
    static var selectOrigin: String { isZh ? "選擇出發站" : "Select origin" }
    static var selectDestination: String { isZh ? "選擇抵達站" : "Select destination" }
    static var searchStation: String { isZh ? "搜尋車站" : "Search stations" }
    static var cancel: String { isZh ? "取消" : "Cancel" }
    static var clear: String { isZh ? "清除" : "Clear" }
    static var copyMessage: String { isZh ? "複製訊息" : "Copy message" }
    static var copied: String { isZh ? "已複製" : "Copied" }
    static var done: String { isZh ? "完成" : "Done" }
    static var loading: String { isZh ? "載入中" : "Loading" }
    static var notSelected: String { isZh ? "尚未選擇" : "Not selected" }
    static var selected: String { isZh ? "已選取" : "Selected" }
    static var shareInfo: String { isZh ? "分享資訊" : "Share info" }
    static var selectTrain: String { isZh ? "選擇列車" : "Select train" }
    static func delayedMinutes(_ minutes: Int) -> String {
        isZh ? "延誤\(minutes)分" : "Delayed \(minutes) min"
    }
    static var expandTrainPanel: String { isZh ? "展開班次面板" : "Expand train panel" }
    static var collapseTrainPanel: String { isZh ? "收合班次面板" : "Collapse train panel" }
    static var refreshLiveStatus: String { isZh ? "更新即時狀態" : "Refresh live status" }
    static var enableLocationAccess: String { isZh ? "開啟定位權限" : "Enable location access" }
    static var useCurrentLocation: String { isZh ? "使用目前位置" : "Use current location" }
    static var refreshLocatedOrigin: String { isZh ? "重新定位出發站" : "Refresh located origin" }
    static var mountainLine: String { isZh ? "山線" : "Mountain Line" }
    static var coastLine: String { isZh ? "海線" : "Coast Line" }
    static var shareText: String { isZh ? "分享到站資訊" : "Share arrival info" }
    static var shareVia: String { isZh ? "分享" : "Share" }
    static var swapStations: String { isZh ? "交換出發站和抵達站" : "Swap origin and destination" }
    static var today: String { isZh ? "今天" : "Today" }
    static var tomorrow: String { isZh ? "明天" : "Tomorrow" }
    static var date: String { isZh ? "日期" : "Date" }
    static var time: String { isZh ? "時間" : "Time" }
    static var timeMode: String { isZh ? "時間類型" : "Time mode" }
    static var settings: String { isZh ? "設定" : "Settings" }
    static var settingsUpdateAvailable: String {
        isZh ? "設定，有可用更新" : "Settings, update available"
    }
    static var updateAvailable: String { isZh ? "新版本！" : "Update available" }
    static func updateToVersion(_ version: String) -> String {
        isZh ? "更新至 \(version)" : "Update to \(version)"
    }
    static var ignoreThisVersion: String { isZh ? "忽略此版本" : "Ignore this version" }
    static var updatePreviewReleaseNotes: String {
        isZh
            ? "讓即時列車資訊更新更快，並提升小工具的穩定性。"
            : "Faster live-train updates and a more reliable widget."
    }
    static var language: String { isZh ? "語言" : "Language" }
    static var systemLanguage: String { isZh ? "系統" : "System" }
    static var traditionalChinese: String { "繁體中文" }
    static var english: String { "English" }
    static var theme: String { isZh ? "主題" : "Theme" }
    static var appIcon: String { isZh ? "App 圖示" : "App Icon" }
    static var defaultIcon: String { isZh ? "預設" : "Default" }
    static var systemAppearance: String { isZh ? "系統" : "System" }
    static var lightAppearance: String { isZh ? "亮色" : "Light" }
    static var darkAppearance: String { isZh ? "暗色" : "Dark" }
    static var sageTheme: String { isZh ? "鼠尾草" : "Sage" }
    static var amethystTheme: String { isZh ? "紫水晶" : "Amethyst" }
    static var emberTheme: String { isZh ? "餘燼" : "Ember" }
    static var defaultMessageFormat: String { isZh ? "預設訊息格式" : "Default message format" }
    static var trainFilters: String { isZh ? "列車篩選" : "Train filters" }
    static var electronicTicketOnly: String {
        isZh
            ? "僅顯示電子票證適用列車"
            : "Only show trains that accept electronic fare cards"
    }
    static var arrivalOnlyMessageFormat: String { isZh ? "抵達時間" : "Arrival only" }
    static var routeArrivalMessageFormat: String { isZh ? "路線與抵達" : "Route and arrival" }
    static var rideMessageFormat: String { isZh ? "我的搭乘" : "My ride" }
    static var customizeShareMessage: String { isZh ? "自訂分享訊息" : "Customize share message" }
    static var shareMessageEditor: String { isZh ? "分享訊息" : "Share Message" }
    static var shareMessageEditorIntro: String {
        isZh
            ? "輸入自己的文字，再點選下方欄位，以標籤加入會隨列車更新的資訊。"
            : "Write anything, then add the fields below as inline pills that update with the selected train."
    }
    static var preview: String { isZh ? "預覽" : "Preview" }
    static var message: String { isZh ? "訊息" : "Message" }
    static var messageEmptyPreview: String {
        isZh ? "加入文字或列車資訊來建立訊息" : "Add text or train details to build your message"
    }
    static var presets: String { isZh ? "預設格式" : "Presets" }
    static var back: String { isZh ? "返回" : "Back" }
    static var messageFieldTime: String { isZh ? "抵達時間" : "Arrival Time" }
    static var departureTime: String { isZh ? "出發時間" : "Departure Time" }
    static var messageFieldTrainType: String { isZh ? "列車類型" : "Train Type" }
    static var messageFieldTrainNumber: String { isZh ? "車次" : "Train Number" }
    static var messageFieldDuration: String { isZh ? "車程" : "Duration" }
    static var messageFieldFare: String { isZh ? "票價" : "Fare" }
    static var messageFieldDelay: String { isZh ? "誤點狀態" : "Delay" }
    static var messageFieldLine: String { isZh ? "路線" : "Line" }
    static var exampleOriginStation: String { isZh ? "新竹" : "Hsinchu" }
    static var exampleDestinationStation: String { isZh ? "臺北" : "Taipei" }
    static var supportOnTrack: String { isZh ? "支持 OnTrack" : "Support OnTrack" }
    static var supportOnTrackFootnote: String {
        isZh
            ? "幫助 OnTrack 持續開發並保持精準、快速。"
            : "A one-time tip helps keep OnTrack development going."
    }
    static var supportThanks: String { isZh ? "謝謝你支持 OnTrack" : "Thanks for supporting OnTrack" }
    static var supportThanksBody: String {
        isZh
            ? "你已解鎖 App 圖示，以及 Sage、Amethyst、Ember 主題。"
            : "You unlocked App Icon options plus the Sage, Amethyst, and Ember themes."
    }
    static var supported: String { isZh ? "已支持" : "Supported" }
    static var restorePurchases: String { isZh ? "恢復購買" : "Restore Purchases" }
    static var purchasePending: String { isZh ? "購買正在等待確認。" : "Purchase is pending confirmation." }
    static var purchaseUnavailable: String { isZh ? "目前無法購買" : "Purchase Unavailable" }
    static var purchaseProductUnavailable: String {
        isZh
            ? "目前 App Store 無法提供支持項目，請稍後再試。"
            : "Support purchases are not available from the App Store right now. Please try again later."
    }
    static var purchaseVerificationFailed: String {
        isZh
            ? "App Store 無法驗證這筆購買。若購買稍後出現，請使用恢復購買。"
            : "The App Store could not verify this purchase. If it appears later, use Restore Purchases."
    }
    static var purchaseNetworkUnavailable: String {
        isZh
            ? "無法連線到 App Store。請檢查網路後再試一次。"
            : "The App Store could not be reached. Check your connection and try again."
    }
    static var purchaseSystemUnavailable: String {
        isZh
            ? "App Store 購買服務暫時無法使用，請稍後再試。"
            : "The App Store purchase service is unavailable right now. Please try again later."
    }
    static var restoreUnavailable: String {
        isZh
            ? "目前無法檢查你的 App Store 購買紀錄，請稍後再試。"
            : "Could not check your App Store purchases right now. Please try again later."
    }
    static var noPurchasesRestored: String { isZh ? "沒有可恢復的購買。" : "No purchases to restore." }
    static var apiInvalidRequest: String {
        isZh
            ? "OnTrack 無法建立這次請求。請重新選擇車站後再試。"
            : "OnTrack could not build this request. Choose the stations again and try once more."
    }
    static var apiInvalidResponse: String {
        isZh
            ? "OnTrack 伺服器回傳了無法讀取的回應，請稍後再試。"
            : "OnTrack returned a response the app could not read. Please try again later."
    }
    static var apiInvalidData: String {
        isZh
            ? "OnTrack 收到的時刻表資料格式不正確，請稍後再試。"
            : "OnTrack received schedule data in an unexpected format. Please try again later."
    }
    static var apiNetworkUnavailable: String {
        isZh
            ? "無法連線到 OnTrack。請檢查網路後再試一次。"
            : "Could not reach OnTrack. Check your connection and try again."
    }
    static var apiServiceUnavailable: String {
        isZh
            ? "OnTrack 鐵路資料暫時忙碌，請稍後再試。"
            : "OnTrack railway data is temporarily at capacity. Please try again later."
    }
    static var apiUpstreamUnavailable: String {
        isZh
            ? "台鐵資料暫時無法使用。資料服務恢復後 OnTrack 就會正常運作。"
            : "Taiwan railway data is temporarily unavailable. OnTrack will work again when the data service recovers."
    }
    static var apiSystemDown: String {
        isZh
            ? "OnTrack 系統暫時無法取得鐵路資料，請稍後再試。"
            : "OnTrack cannot get railway data right now. Please try again later."
    }
    static var links: String { isZh ? "連結" : "Links" }
    static var support: String { isZh ? "支援" : "Support" }
    static var privacyPolicy: String { isZh ? "隱私權" : "Privacy Policy" }

    static func leaveTip(price: String) -> String {
        isZh ? "留下 \(price) 小費" : "Leave a \(price) Tip"
    }

    static var leaveTip: String { isZh ? "留下小費" : "Leave a Tip" }

    static func arrivalMessage(time: String, station: String) -> String {
        isZh ? "\(time)到\(station)" : "Arrive at \(station) by \(time)"
    }

    static func routeArrivalMessage(origin: String, destination: String, time: String) -> String {
        isZh ? "\(origin)→\(destination) \(time)到" : "\(origin) to \(destination), arrive by \(time)"
    }

    static func apiRequestFailed(statusCode: Int) -> String {
        isZh
            ? "OnTrack 請求失敗（\(statusCode)），請稍後再試。"
            : "OnTrack request failed (\(statusCode)). Please try again later."
    }

    static func apiServerMessage(_ message: String, requestId: String?) -> String {
        guard let requestId, !requestId.isEmpty else {
            return message
        }

        return isZh
            ? "\(message)\n支援代碼：\(requestId)"
            : "\(message)\nSupport code: \(requestId)"
    }

    static func trainAccessibilityLabel(
        type: String,
        number: String,
        departure: String,
        arrival: String,
        duration: String,
        price: String?,
        tripLine: String?,
        delay: Int?,
        isSelected: Bool
    ) -> String {
        let status = isSelected ? selected : ""
        let delayText: String

        if let delay, delay > 0 {
            delayText = isZh ? "誤點 \(delay) 分鐘" : "Delayed \(delay) minutes"
        } else {
            delayText = isZh ? "準點" : "On time"
        }

        if isZh {
            return [status, "\(type) \(number)", "\(departure) 出發", "\(arrival) 抵達", "車程 \(duration)", price.map { "票價 \($0)" } ?? "", tripLine ?? "", delayText]
                .filter { !$0.isEmpty }
                .joined(separator: "，")
        }

        return [status, "\(type) \(number)", "Departs \(departure)", "Arrives \(arrival)", "Duration \(duration)", price.map { "Fare \($0)" } ?? "", tripLine ?? "", delayText]
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }
}
