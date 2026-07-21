import CoreLocation
import SwiftUI
import UIKit

private let taipeiMainStationName = "臺北"
private let taipeiCircularStationName = "臺北(環島)"
private let scheduleRefreshInterval: TimeInterval = 5 * 60
private let scheduleWarmupRetryDelayNanos: UInt64 = 4_000_000_000
private let locationRefreshInterval: TimeInterval = 2 * 60
private let manualOriginProtectionInterval: TimeInterval = 10 * 60
private let stationHistoryLimit = 24
private let timePickerMinuteInterval = 10
private let stationPickerAnimation = Animation.snappy(duration: 0.28, extraBounce: 0)
private let supportURL = URL(string: "https://ontrack.hsichen.dev/docs/support")!
private let privacyURL = URL(string: "https://ontrack.hsichen.dev/docs/privacy")!

private enum ShareMessageFormat: String, CaseIterable, Identifiable {
    case arrivalOnly
    case routeArrival

    var id: String { rawValue }

    var title: String {
        switch self {
        case .arrivalOnly:
            AppText.arrivalOnlyMessageFormat
        case .routeArrival:
            AppText.routeArrivalMessageFormat
        }
    }

    func message(train: TrainInfo, origin: Station?, destination: Station) -> String {
        let arrivalTime = TrainDisplay.adjustedTime(
            train.arrivalTime,
            delay: train.delay
        )

        switch self {
        case .arrivalOnly:
            return AppText.arrivalMessage(time: arrivalTime, station: destination.displayName)
        case .routeArrival:
            return AppText.routeArrivalMessage(
                origin: origin?.displayName ?? AppText.origin,
                destination: destination.displayName,
                time: arrivalTime
            )
        }
    }
}

private enum ActiveSheet: String, Identifiable {
    case timeEditor
    case settings

    var id: String { rawValue }
}

private enum AppIconSetting: String, CaseIterable, Identifiable {
    case primary
    case dark
    case sage
    case amethyst
    case ember

    var id: String { rawValue }

    var alternateIconName: String? {
        switch self {
        case .primary:
            nil
        case .dark:
            "AppIconDark"
        case .sage:
            "AppIconSage"
        case .amethyst:
            "AppIconAmethyst"
        case .ember:
            "AppIconEmber"
        }
    }

    var title: String {
        switch self {
        case .primary:
            AppText.defaultIcon
        case .dark:
            AppText.darkAppearance
        case .sage:
            AppText.sageTheme
        case .amethyst:
            AppText.amethystTheme
        case .ember:
            AppText.emberTheme
        }
    }

    var previewImageName: String {
        switch self {
        case .primary:
            "AppIconPreview"
        case .dark:
            "AppIconDarkPreview"
        case .sage:
            "AppIconSagePreview"
        case .amethyst:
            "AppIconAmethystPreview"
        case .ember:
            "AppIconEmberPreview"
        }
    }

    var accentColor: Color {
        switch self {
        case .primary:
            OnTrackPalette(setting: .light).primary
        case .dark:
            OnTrackPalette(setting: .dark).primary
        case .sage:
            OnTrackPalette(setting: .sage).primary
        case .amethyst:
            OnTrackPalette(setting: .amethyst).primary
        case .ember:
            OnTrackPalette(setting: .ember).primary
        }
    }

    @MainActor static var current: AppIconSetting {
        let alternateIconName = UIApplication.shared.alternateIconName
        return allCases.first { $0.alternateIconName == alternateIconName } ?? .primary
    }
}

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase

    @AppStorage("ontrack_origin_id") private var originId = ""
    @AppStorage("ontrack_destination_id") private var destinationId = ""
    @AppStorage("ontrack_cached_origin_id") private var cachedOriginId = ""
    @AppStorage("ontrack_manual_origin_selected_at") private var manualOriginSelectedAt = 0.0
    @AppStorage("ontrack_frequent_destinations") private var frequentDestinationRecordsData = ""
    @AppStorage("ontrack_recent_destination_ids") private var recentDestinationIDs = ""
    @AppStorage("ontrack_recent_origin_ids") private var recentOriginIDs = ""
    @AppStorage(AppPreferenceKey.language) private var languageCode = AppLanguageSetting.system.rawValue
    @AppStorage(AppPreferenceKey.appearance) private var appearanceRaw = AppAppearanceSetting.current.rawValue
    @AppStorage(AppPreferenceKey.messageFormat) private var messageFormatRaw = ShareMessageFormat.arrivalOnly.rawValue

    @StateObject private var locationService = LocationService()
    @StateObject private var supportPurchaseManager = SupportPurchaseManager()
    @State private var stations: [Station] = []
    @State private var timeSelection = TimeSelection.current()
    @State private var trains: [TrainInfo] = []
    @State private var selectedTrain: TrainInfo?
    @State private var isLoadingStations = false
    @State private var isLoadingSchedule = false
    @State private var isRefreshingLive = false
    @State private var errorMessage: String?
    @State private var stationPicker: StationPickerRole?
    @State private var originSource: OriginSelectionSource = .manual
    @State private var destinationSource: DestinationSelectionSource = .cached
    @State private var activeSheet: ActiveSheet?

    private let scheduleRefreshTimer = Timer.publish(
        every: scheduleRefreshInterval,
        on: .main,
        in: .common
    ).autoconnect()

    private let locationRefreshTimer = Timer.publish(
        every: locationRefreshInterval,
        on: .main,
        in: .common
    ).autoconnect()

    private var stationMap: [String: Station] {
        Dictionary(uniqueKeysWithValues: stations.map { ($0.id, $0) })
    }

    private var originStation: Station? {
        stationMap[originId]
    }

    private var destinationStation: Station? {
        stationMap[destinationId]
    }

    private var algorithmicDestinationStations: [Station] {
        DestinationAutofill.rankedDestinationIDs(
            originId: originId,
            excludedId: originId,
            recordsData: frequentDestinationRecordsData,
            legacyDestinationIDs: legacyRecentDestinationIDs,
            stations: stations
        )
        .compactMap { stationMap[$0] }
    }

    private var destinationHistoryStations: [Station] {
        DestinationAutofill.historyDestinationIDs(
            recordsData: frequentDestinationRecordsData,
            legacyDestinationIDs: legacyRecentDestinationIDs
        )
        .compactMap { stationMap[$0] }
    }

    private var algorithmicOriginStations: [Station] {
        guard let coordinate = locationService.coordinate else {
            return []
        }

        let userLocation = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        return stations
            .compactMap { station -> (station: Station, distance: CLLocationDistance)? in
                guard let latitude = station.lat, let longitude = station.lon else {
                    return nil
                }

                let stationLocation = CLLocation(latitude: latitude, longitude: longitude)
                return (station, userLocation.distance(from: stationLocation))
            }
            .sorted { $0.distance < $1.distance }
            .map(\.station)
    }

    private var originHistoryStations: [Station] {
        recentOriginIDs
            .split(separator: ",")
            .map(String.init)
            .compactMap { stationMap[$0] }
    }

    private var legacyRecentDestinationIDs: [String] {
        recentDestinationIDs
            .split(separator: ",")
            .map(String.init)
    }

    private var canLoadSchedule: Bool {
        originStation != nil && destinationStation != nil
    }

    private var shareMessage: String? {
        guard let selectedTrain, let destinationStation else {
            return nil
        }

        return AppText.plannedBoardingMessage(
            type: TrainDisplay.trainType(selectedTrain.trainType),
            number: selectedTrain.trainNo,
            time: TrainDisplay.adjustedTime(selectedTrain.arrivalTime, delay: selectedTrain.delay),
            station: destinationStation.displayName
        )
    }

    private var scheduleTaskID: String {
        [
            originId,
            destinationId,
            timeSelection.mode.rawValue,
            Formatters.scheduleDate.string(from: timeSelection.date),
            Formatters.displayTime.string(from: timeSelection.date),
            canLoadSchedule ? "ready" : "pending",
        ].joined(separator: "-")
    }

    private var timeEditorDateRange: ClosedRange<Date> {
        let calendar = Formatters.taipeiCalendar
        let today = calendar.startOfDay(for: Date())
        let maxDate = calendar.date(
            byAdding: .day,
            value: TimeSelection.futureDayLimit + 1,
            to: today
        ) ?? today

        return today...maxDate.addingTimeInterval(-1)
    }

#if DEBUG
    private var isShowcaseMode: Bool {
        ProcessInfo.processInfo.environment["ONTRACK_SHOWCASE_DATA"] == "1"
            || ProcessInfo.processInfo.arguments.contains("--showcase-data")
    }

    private var opensSupportScreenshot: Bool {
        ProcessInfo.processInfo.environment["ONTRACK_SCREENSHOT_TARGET"] == "support"
            || ProcessInfo.processInfo.arguments.contains("--screenshot-support")
    }
#endif

    var body: some View {
        NavigationStack {
            ZStack {
                palette.background
                    .ignoresSafeArea()

                GeometryReader { proxy in
                    let trainPanelRowCount = TrainPanelLayout.rowCount(
                        isLoading: isLoadingSchedule,
                        canLoadSchedule: canLoadSchedule,
                        trainCount: trains.count
                    )
                    let trainPanelBottomInset = TrainPanelLayout.bottomInset(
                        safeAreaInset: proxy.safeAreaInsets.bottom
                    )

                    ZStack(alignment: .bottom) {
                        ScrollView {
                            VStack(alignment: .leading, spacing: OnTrackTheme.space4) {
                                HStack(spacing: OnTrackTheme.space2) {
                                    IconPlainButton(
                                        systemName: "arrow.clockwise",
                                        isLoading: isRefreshingLive,
                                        action: refreshLiveSchedule
                                    )
                                    .disabled(!canLoadSchedule || isLoadingSchedule || isRefreshingLive)
                                    .accessibilityLabel(AppText.refreshLiveStatus)

                                    TimeSelectorView(
                                        selection: $timeSelection,
                                        onEdit: presentTimeEditor
                                    )
                                        .frame(maxWidth: .infinity)

                                    IconPlainButton(
                                        systemName: "gearshape",
                                        action: presentSettings
                                    )
                                    .accessibilityLabel(AppText.settings)
                                }
                                .padding(.horizontal, OnTrackTheme.space2)

                                RouteSelectorView(
                                    origin: originStation,
                                    destination: destinationStation,
                                    isLoading: isLoadingStations,
                                    originGlyphColor: palette.dimText,
                                    destinationGlyphColor: palette.primary,
                                    onPickOrigin: { openStationPicker(.origin) },
                                    onPickDestination: { openStationPicker(.destination) },
                                    onSwap: swapStations
                                )
                            }
                            .frame(maxWidth: OnTrackTheme.contentMaxWidth)
                            .padding(.horizontal, OnTrackTheme.space5)
                            .padding(.top, OnTrackTheme.space3)
                            .padding(.bottom, TrainPanelLayout.contentReserve(
                                rowCount: trainPanelRowCount,
                                bottomInset: trainPanelBottomInset
                            ))
                            .frame(maxWidth: .infinity)
                        }
                        .scrollIndicators(.hidden)

                        if stationPicker == nil {
                            TrainBoardingPanel(
                                message: shareMessage,
                                selectedTrain: selectedTrain,
                                destination: destinationStation,
                                trains: trains,
                                isLoading: isLoadingSchedule,
                                canLoadSchedule: canLoadSchedule,
                                onSelect: { selectedTrain = $0 }
                            )
                            .padding(.bottom, trainPanelBottomInset)
                            .transition(.move(edge: .bottom))
                        }
                    }
                }

                if let stationPicker {
                    StationSearchView(
                        title: stationPicker.title,
                        stations: stations,
                        selectedStation: stationPicker == .origin ? originStation : destinationStation,
                        algorithmicStations: stationPicker == .origin
                            ? algorithmicOriginStations
                            : algorithmicDestinationStations,
                        historyStations: stationPicker == .origin
                            ? originHistoryStations
                            : destinationHistoryStations,
                        onDismiss: dismissStationPicker
                    ) { station in
                        select(station: station, for: stationPicker)
                        dismissStationPicker()
                    }
                    .zIndex(1)
                    .transition(.asymmetric(
                        insertion: .move(edge: .bottom),
                        removal: .move(edge: .bottom)
                    ))
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await loadStations()
            }
            .task {
                await supportPurchaseManager.start()
            }
            .onAppear {
#if DEBUG
                guard !isShowcaseMode else {
                    return
                }
#endif
                refreshAutoDetectedOrigin()
            }
            .task(id: scheduleTaskID) {
                await loadSchedule()
            }
            .onReceive(scheduleRefreshTimer) { _ in
                Task {
                    await loadSchedule()
                }
            }
            .onReceive(locationRefreshTimer) { _ in
                guard scenePhase == .active else {
                    return
                }

                refreshAutoDetectedOrigin()
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else {
                    return
                }

                refreshAutoDetectedOrigin()
            }
            .onChange(of: locationService.coordinate) { _, coordinate in
                guard let coordinate else {
                    return
                }

                selectNearestOrigin(to: coordinate)
            }
            .onChange(of: locationService.locationErrorID) { _, errorID in
                guard errorID != nil else {
                    return
                }

                fallbackToCachedOrigin()
            }
            .alert("OnTrack", isPresented: hasError) {
                Button("OK", role: .cancel) {
                    errorMessage = nil
                }
            } message: {
                Text(errorMessage ?? "")
            }
            .sheet(item: $activeSheet) { sheet in
                sheetContent(sheet)
            }
        }
        .tint(palette.primary)
        .preferredColorScheme(appearanceSetting.preferredColorScheme)
        .environment(\.onTrackPalette, palette)
    }

    @ViewBuilder
    private func sheetContent(_ sheet: ActiveSheet) -> some View {
        switch sheet {
        case .timeEditor:
            TimeEditorSheet(
                selection: $timeSelection,
                dateRange: timeEditorDateRange
            )

        case .settings:
            SettingsSheet(
                languageCode: $languageCode,
                appearanceRaw: $appearanceRaw,
                messageFormatRaw: $messageFormatRaw,
                originName: originStation?.displayName,
                destinationName: destinationStation?.displayName,
                purchaseManager: supportPurchaseManager
            )
        }
    }

    private var appearanceSetting: AppAppearanceSetting {
        AppAppearanceSetting(rawValue: appearanceRaw) ?? AppAppearanceSetting.current
    }

    private var palette: OnTrackPalette {
        OnTrackPalette(setting: appearanceSetting)
    }

    private var hasError: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )
    }

    private func openStationPicker(_ role: StationPickerRole) {
        if role == .origin {
            promptForAutoDetectedOrigin()
        }

        activeSheet = nil

        withAnimation(stationPickerAnimation) {
            stationPicker = role
        }
    }

    private func dismissStationPicker() {
        withAnimation(stationPickerAnimation) {
            stationPicker = nil
        }
    }

    private func presentTimeEditor() {
        presentModalSheet(.timeEditor)
    }

    private func presentSettings() {
        presentModalSheet(.settings)
    }

    private func presentModalSheet(_ sheet: ActiveSheet) {
        activeSheet = sheet
    }

    private func loadStations() async {
        guard stations.isEmpty else {
            return
        }

        isLoadingStations = true
        defer { isLoadingStations = false }

        do {
            let loadedStations = try await APIClient.shared.stations()
            stations = loadedStations

#if DEBUG
            if isShowcaseMode {
                applyShowcaseState()
                return
            }
#endif

            resolveInitialStations(loadedStations)
            refreshAutoDetectedOrigin()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

#if DEBUG
    private func applyShowcaseState() {
        setOrigin("1000", source: .geo)
        destinationId = "1210"
        destinationSource = .cached
        languageCode = AppLanguageSetting.zhTW.rawValue
        appearanceRaw = AppAppearanceSetting.light.rawValue
        activeSheet = opensSupportScreenshot ? .settings : nil

        var components = Formatters.taipeiCalendar.dateComponents(
            [.year, .month, .day],
            from: Date()
        )
        components.hour = 9
        components.minute = 41
        components.second = 0

        if let showcaseDate = Formatters.taipeiCalendar.date(from: components) {
            timeSelection = TimeSelection(mode: .departure, date: showcaseDate)
        }
    }
#endif

    private func loadSchedule(refreshLive: Bool = false) async {
        guard canLoadSchedule, let originStation, let destinationStation else {
            return
        }

        isLoadingSchedule = true
        if refreshLive {
            isRefreshingLive = true
        }
        defer {
            isLoadingSchedule = false
            if refreshLive {
                isRefreshingLive = false
            }
        }

        do {
            var response: ScheduleResponse?
            for attempt in 0..<3 {
                let candidate = try await APIClient.shared.schedule(
                    origin: originStation,
                    destination: destinationStation,
                    date: timeSelection.scheduleDate,
                    refreshLive: refreshLive && attempt == 0
                )
                response = candidate

                guard candidate.meta?.scheduleCacheStatus == .warming, attempt < 2 else {
                    break
                }

                try? await Task.sleep(nanoseconds: scheduleWarmupRetryDelayNanos)
                if Task.isCancelled {
                    return
                }
            }

            guard let response, response.meta?.scheduleCacheStatus != .warming else {
                trains = []
                selectedTrain = nil
                return
            }

            let display = TrainDisplay.displaySchedule(
                trains: response.trains,
                targetTime: timeSelection.scheduleTime,
                timeMode: timeSelection.mode.scheduleMode
            )
            trains = display.trains
            selectedTrain = display.recommendedTrain
        } catch {
            trains = []
            selectedTrain = nil
            errorMessage = error.localizedDescription
        }
    }

    private func refreshLiveSchedule() {
        guard canLoadSchedule, !isLoadingSchedule, !isRefreshingLive else {
            return
        }

        Task {
            await loadSchedule(refreshLive: true)
        }
    }

    private func select(station: Station, for role: StationPickerRole) {
        switch role {
        case .origin:
            setOrigin(station.id, source: .manual, selectedAt: Date())
            autoFillDestinationIfNeeded()
        case .destination:
            destinationId = station.id
            destinationSource = .manual
            rememberDestination(station.id)
        }
    }

    private func swapStations() {
        guard !originId.isEmpty, !destinationId.isEmpty else {
            return
        }

        let currentOriginId = originId
        let currentDestinationId = destinationId

        setOrigin(currentDestinationId, source: .manual, selectedAt: Date())
        destinationId = currentOriginId
        destinationSource = .manual
        rememberDestination(currentOriginId)
    }

    private func resolveInitialStations(_ loadedStations: [Station]) {
        if originId.isEmpty, isKnownStation(cachedOriginId, in: loadedStations) {
            setOrigin(cachedOriginId, source: .cached)
        }

        if originId.isEmpty {
            setOrigin(
                loadedStations.first(where: { $0.name == taipeiMainStationName || $0.name == "台北" })?.id
                    ?? loadedStations.first?.id
                    ?? "",
                source: .manual
            )
        } else if isManualOriginProtected {
            originSource = .manual
        }

        autoFillDestinationIfNeeded(in: loadedStations)
    }

    private func promptForAutoDetectedOrigin() {
        requestAutoDetectedOrigin(allowPermissionPrompt: true)
    }

    private func refreshAutoDetectedOrigin() {
        requestAutoDetectedOrigin(allowPermissionPrompt: false)
    }

    private func requestAutoDetectedOrigin(allowPermissionPrompt: Bool) {
        guard !stations.isEmpty, !isManualOriginProtected else {
            return
        }

        let status = locationService.authorizationStatus
        guard status == .authorizedAlways || status == .authorizedWhenInUse || (allowPermissionPrompt && status == .notDetermined) else {
            return
        }

        locationService.requestLocation()
    }

    private func selectNearestOrigin(to coordinate: UserCoordinate) {
        guard !stations.isEmpty, !isManualOriginProtected else {
            return
        }

        let userLocation = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        let nearestStation = stations
            .compactMap { station -> (Station, CLLocationDistance)? in
                guard let latitude = station.lat, let longitude = station.lon else {
                    return nil
                }

                let stationLocation = CLLocation(latitude: latitude, longitude: longitude)
                return (station, userLocation.distance(from: stationLocation))
            }
            .min { $0.1 < $1.1 }?
            .0

        guard let nearestStation else {
            fallbackToCachedOrigin()
            return
        }

        setOrigin(resolvePreferredStationId(nearestStation.id), source: .geo)
        autoFillDestinationIfNeeded()
    }

    private func fallbackToCachedOrigin() {
        guard !isManualOriginProtected, isKnownStation(cachedOriginId, in: stations) else {
            return
        }

        setOrigin(cachedOriginId, source: .cached)
    }

    private func setOrigin(_ id: String, source: OriginSelectionSource, selectedAt: Date? = nil) {
        guard !id.isEmpty else {
            originId = ""
            return
        }

        originId = id
        cachedOriginId = id
        originSource = source

        if let selectedAt, source == .manual {
            manualOriginSelectedAt = selectedAt.timeIntervalSince1970
        } else if source != .manual {
            manualOriginSelectedAt = 0
        }

        if source == .geo || (source == .manual && selectedAt != nil) {
            rememberOrigin(id)
        }
    }

    private func autoFillDestinationIfNeeded(in candidateStations: [Station]? = nil) {
        let availableStations = candidateStations ?? stations
        guard !originId.isEmpty, !availableStations.isEmpty else {
            return
        }

        let hasKnownDestination = !destinationId.isEmpty && availableStations.contains { $0.id == destinationId }
        let shouldAutoFillDestination = destinationId.isEmpty
            || destinationId == originId
            || !hasKnownDestination
            || destinationSource == .auto

        guard shouldAutoFillDestination else {
            return
        }

        let autoFillDestinationId = DestinationAutofill.autoFillDestinationID(
            originId: originId,
            recordsData: frequentDestinationRecordsData,
            legacyDestinationIDs: legacyRecentDestinationIDs,
            stations: availableStations
        )

        guard !autoFillDestinationId.isEmpty else {
            destinationId = ""
            return
        }

        destinationId = autoFillDestinationId
        destinationSource = .auto
    }

    private func resolvePreferredStationId(_ stationId: String) -> String {
        guard stationMap[stationId]?.name == taipeiCircularStationName else {
            return stationId
        }

        return stations.first(where: { $0.name == taipeiMainStationName })?.id ?? stationId
    }

    private func isKnownStation(_ id: String, in stations: [Station]) -> Bool {
        !id.isEmpty && stations.contains { $0.id == id }
    }

    private var isManualOriginProtected: Bool {
        guard manualOriginSelectedAt > 0 else {
            return false
        }

        return Date().timeIntervalSince1970 - manualOriginSelectedAt < manualOriginProtectionInterval
    }

    private func rememberDestination(_ id: String) {
        guard !originId.isEmpty else {
            return
        }

        frequentDestinationRecordsData = DestinationAutofill.recordDestination(
            originId: originId,
            stationId: id,
            recordsData: frequentDestinationRecordsData,
            legacyDestinationIDs: legacyRecentDestinationIDs
        )
        recentDestinationIDs = ""
    }

    private func rememberOrigin(_ id: String) {
        var stationIDs = recentOriginIDs
            .split(separator: ",")
            .map(String.init)
            .filter { $0 != id }
        stationIDs.insert(id, at: 0)
        recentOriginIDs = stationIDs.prefix(stationHistoryLimit).joined(separator: ",")
    }
}

private enum OriginSelectionSource {
    case manual
    case cached
    case geo
}

private enum DestinationSelectionSource {
    case manual
    case cached
    case auto
}

private struct UserCoordinate: Equatable, Sendable {
    let latitude: Double
    let longitude: Double
}

@MainActor
private final class LocationService: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var coordinate: UserCoordinate?
    @Published var locationErrorID: UUID?
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        authorizationStatus = manager.authorizationStatus
    }

    func requestLocation() {
        locationErrorID = nil
        authorizationStatus = manager.authorizationStatus

        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .denied, .restricted:
            locationErrorID = UUID()
        @unknown default:
            locationErrorID = UUID()
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus

        Task { @MainActor [weak self] in
            guard let self else {
                return
            }

            authorizationStatus = status

            switch status {
            case .authorizedAlways, .authorizedWhenInUse:
                self.manager.requestLocation()
            case .denied, .restricted:
                locationErrorID = UUID()
            case .notDetermined:
                break
            @unknown default:
                locationErrorID = UUID()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            return
        }

        let updatedCoordinate = UserCoordinate(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude
        )

        Task { @MainActor [weak self] in
            self?.coordinate = updatedCoordinate
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor [weak self] in
            self?.locationErrorID = UUID()
        }
    }
}

private enum StationPickerRole: String, Identifiable {
    case origin
    case destination

    var id: String { rawValue }

    var title: String {
        switch self {
        case .origin:
            AppText.selectOrigin
        case .destination:
            AppText.selectDestination
        }
    }

}

private struct TimeSelectorView: View {
    @Environment(\.onTrackPalette) private var palette
    @Binding var selection: TimeSelection
    let onEdit: () -> Void

    private let syncTimer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    private var title: String {
        switch selection.mode {
        case .now:
            AppText.leaveNow
        case .departure, .arrival:
            "\(selection.mode.title) \(Formatters.displayTime.string(from: selection.date))"
        case .lastTrain:
            "\(selection.mode.title) \(Formatters.scheduleDate.string(from: selection.date))"
        }
    }

    var body: some View {
        Button(action: onEdit) {
            HStack(spacing: OnTrackTheme.space2) {
                Text(title)
                    .font(OnTrackFont.control)
                    .foregroundStyle(palette.text)

                Image(systemName: "chevron.down")
                    .font(OnTrackFont.compactSymbol)
                    .foregroundStyle(palette.dimText)
            }
            .padding(.horizontal, OnTrackTheme.space4)
            .frame(minHeight: OnTrackTheme.iconButtonSize)
            .onTrackPanelSurface(cornerRadius: OnTrackTheme.radiusControl, castsShadow: false)
        }
        .buttonStyle(OnTrackPressButtonStyle())
        .onAppear {
            syncNowIfNeeded()
        }
        .onReceive(syncTimer) { _ in
            syncNowIfNeeded()
        }
    }

    private func syncNowIfNeeded() {
        guard selection.mode == .now else {
            return
        }

        selection = .current(mode: .now)
    }
}

private struct TimeEditorSheet: View {
    private static let pickerHeight: CGFloat = 216

    private static var footerButtonHeight: CGFloat {
        OnTrackTheme.controlHeight
    }

    private static var detentHeight: CGFloat {
        OnTrackTheme.space5
            + OnTrackTheme.controlHeight
            + OnTrackTheme.space3
            + pickerHeight
            + footerButtonHeight
    }

    @Binding var selection: TimeSelection
    let dateRange: ClosedRange<Date>

    @Environment(\.dismiss) private var dismiss
    @Environment(\.onTrackPalette) private var palette
    @State private var draft: TimeSelection

    private var modeSelection: Binding<TimeMode> {
        Binding(
            get: {
                switch draft.mode {
                case .arrival:
                    .arrival
                case .lastTrain:
                    .lastTrain
                case .now, .departure:
                    .departure
                }
            },
            set: { mode in
                draft.mode = mode
                if mode == .lastTrain {
                    draft.date = Self.lastTrainDate(for: draft.date)
                }
            }
        )
    }

    private var isNowSelected: Bool {
        draft.mode == .now
    }

    private var isLastTrainSelected: Bool {
        draft.mode == .lastTrain
    }

    private static func lastTrainDate(for date: Date) -> Date {
        let calendar = Formatters.taipeiCalendar
        return calendar.date(
            bySettingHour: TimeSelection.lastTrainHour,
            minute: TimeSelection.lastTrainMinute,
            second: 0,
            of: date
        ) ?? date
    }

    private var selectedTime: Binding<Date> {
        Binding(
            get: { draft.date },
            set: { date in
                if draft.mode == .lastTrain {
                    draft.date = Self.lastTrainDate(for: date)
                    return
                }

                if draft.mode == .now {
                    draft.mode = .departure
                }

                draft.date = date
            }
        )
    }

    init(selection: Binding<TimeSelection>, dateRange: ClosedRange<Date>) {
        self._selection = selection
        self.dateRange = dateRange

        var initialDraft = selection.wrappedValue
        if initialDraft.mode == .lastTrain {
            initialDraft.date = Self.lastTrainDate(for: initialDraft.date)
        }
        self._draft = State(initialValue: initialDraft)
    }

    var body: some View {
        GeometryReader { proxy in
            content(
                availableWidth: proxy.size.width,
                bottomSafeAreaInset: max(0, proxy.safeAreaInsets.bottom)
            )
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
        }
        .presentationDetents([.height(Self.detentHeight)])
        .presentationDragIndicator(.automatic)
        .presentationBackground(palette.panel)
    }

    private func content(availableWidth: CGFloat, bottomSafeAreaInset: CGFloat) -> some View {
        VStack(spacing: 0) {
            timeEditorHeader(availableWidth: availableWidth)
                .padding(.horizontal, OnTrackTheme.space5)
                .padding(.top, OnTrackTheme.space5)

            timeEditorPicker
                .padding(.horizontal, OnTrackTheme.space5)
                .padding(.top, OnTrackTheme.space3)

            timeEditorFooter(bottomSafeAreaInset: bottomSafeAreaInset)
        }
        .background(palette.panel)
    }

    private func timeEditorHeader(availableWidth: CGFloat) -> some View {
        ZStack {
            HStack {
                Button {
                    draft = .current(mode: .now)
                } label: {
                    Image(systemName: "clock.arrow.trianglehead.2.counterclockwise.rotate.90")
                        .font(OnTrackFont.symbol)
                        .foregroundStyle(isNowSelected ? palette.primary : palette.dimText)
                        .frame(width: OnTrackTheme.controlHeight, height: OnTrackTheme.controlHeight)
                }
                .buttonStyle(OnTrackPressButtonStyle())
                .accessibilityLabel(AppText.now)

                Spacer()

                Button {
                    draft.mode = .lastTrain
                    draft.date = Self.lastTrainDate(for: draft.date)
                } label: {
                    Image(systemName: "moon")
                        .font(OnTrackFont.symbol)
                        .foregroundStyle(isLastTrainSelected ? palette.primary : palette.dimText)
                        .frame(width: OnTrackTheme.controlHeight, height: OnTrackTheme.controlHeight)
                }
                .buttonStyle(OnTrackPressButtonStyle())
                .accessibilityLabel(AppText.lastTrain)
            }

            Picker(AppText.timeMode, selection: modeSelection) {
                ForEach([TimeMode.departure, TimeMode.arrival]) { mode in
                    Text(mode.title).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .frame(
                width: min(
                    OnTrackTheme.timeModePickerMaxWidth,
                    max(
                        OnTrackTheme.timeModePickerMinWidth,
                        availableWidth - OnTrackTheme.controlHeight * 2
                    )
                )
            )
            .frame(minHeight: OnTrackTheme.controlHeight)
        }
        .frame(height: OnTrackTheme.controlHeight)
    }

    private var timeEditorPicker: some View {
        Group {
            if draft.mode == .lastTrain {
                Text(AppText.queryTodayLastTrain)
                    .font(OnTrackFont.control)
                    .foregroundStyle(palette.text)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .frame(height: Self.pickerHeight)
            } else {
                MinuteIntervalDatePicker(
                    selection: selectedTime,
                    dateRange: dateRange,
                    minuteInterval: timePickerMinuteInterval
                )
                .accessibilityLabel(AppText.time)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: Self.pickerHeight)
        .clipped()
        .tint(palette.primary)
    }

    private func timeEditorFooter(bottomSafeAreaInset: CGFloat) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Button(AppText.cancel) {
                    dismiss()
                }
                .font(OnTrackFont.control)
                .foregroundStyle(palette.text)
                .frame(maxWidth: .infinity)
                .frame(height: Self.footerButtonHeight)

                Rectangle()
                    .fill(palette.border)
                    .frame(width: 1, height: Self.footerButtonHeight)

                Button(AppText.done) {
                    selection = draft.mode == .now ? .current(mode: .now) : draft
                    dismiss()
                }
                .font(OnTrackFont.control)
                .foregroundStyle(palette.primary)
                .frame(maxWidth: .infinity)
                .frame(height: Self.footerButtonHeight)
            }

            if bottomSafeAreaInset > 0 {
                Color.clear
                    .frame(height: bottomSafeAreaInset)
            }
        }
        .background(palette.panel)
    }
}

private struct RouteSelectorView: View {
    @Environment(\.onTrackPalette) private var palette
    let origin: Station?
    let destination: Station?
    let isLoading: Bool
    let originGlyphColor: Color
    let destinationGlyphColor: Color
    let onPickOrigin: () -> Void
    let onPickDestination: () -> Void
    let onSwap: () -> Void
    @State private var swapFeedbackTrigger = 0

    var body: some View {
        VStack(spacing: 0) {
            StationTrigger(
                title: AppText.origin,
                station: origin,
                isLoading: isLoading,
                glyph: .origin,
                glyphColor: originGlyphColor,
                onTap: onPickOrigin
            )

            HStack(spacing: OnTrackTheme.space3) {
                Color.clear
                    .frame(width: OnTrackTheme.routeGlyphColumnWidth, height: OnTrackTheme.routeDividerHeight)
                Rectangle()
                    .fill(palette.border)
                    .frame(height: 1)
            }
            .padding(.leading, OnTrackTheme.space4)
            .padding(.trailing, OnTrackTheme.space4)
            .frame(height: OnTrackTheme.routeDividerHeight)

            StationTrigger(
                title: AppText.destination,
                station: destination,
                isLoading: isLoading,
                glyph: .destination,
                glyphColor: destinationGlyphColor,
                trailingAction: AnyView(
                    IconPlainButton(
                        systemName: "arrow.up.arrow.down",
                        action: {
                            swapFeedbackTrigger += 1
                            onSwap()
                        }
                    )
                    .disabled(origin == nil || destination == nil)
                    .accessibilityLabel(AppText.swapStations)
                ),
                onTap: onPickDestination
            )
        }
        .onTrackPanelSurface(castsShadow: false)
        .sensoryFeedback(.selection, trigger: swapFeedbackTrigger)
    }
}

private struct MinuteIntervalDatePicker: UIViewRepresentable {
    @Binding var selection: Date
    let dateRange: ClosedRange<Date>
    let minuteInterval: Int

    func makeCoordinator() -> Coordinator {
        Coordinator(selection: $selection)
    }

    func makeUIView(context: Context) -> UIDatePicker {
        let picker = UIDatePicker()

        picker.calendar = Formatters.taipeiCalendar
        picker.timeZone = Formatters.taipeiTimeZone
        picker.datePickerMode = .dateAndTime
        picker.preferredDatePickerStyle = .wheels
        picker.minuteInterval = minuteInterval
        picker.minimumDate = dateRange.lowerBound
        picker.maximumDate = dateRange.upperBound
        picker.date = clampedDate(selection)
        picker.addTarget(
            context.coordinator,
            action: #selector(Coordinator.dateChanged(_:)),
            for: .valueChanged
        )

        return picker
    }

    func updateUIView(_ picker: UIDatePicker, context: Context) {
        context.coordinator.selection = $selection
        picker.calendar = Formatters.taipeiCalendar
        picker.timeZone = Formatters.taipeiTimeZone
        picker.datePickerMode = .dateAndTime
        picker.preferredDatePickerStyle = .wheels
        picker.minimumDate = dateRange.lowerBound
        picker.maximumDate = dateRange.upperBound

        if picker.minuteInterval != minuteInterval {
            picker.minuteInterval = minuteInterval
        }

        let nextDate = clampedDate(selection)
        if abs(picker.date.timeIntervalSince(nextDate)) > 0.5 {
            picker.setDate(nextDate, animated: false)
        }
    }

    private func clampedDate(_ date: Date) -> Date {
        if date < dateRange.lowerBound {
            return dateRange.lowerBound
        }

        if date > dateRange.upperBound {
            return dateRange.upperBound
        }

        return date
    }

    final class Coordinator: NSObject {
        var selection: Binding<Date>

        init(selection: Binding<Date>) {
            self.selection = selection
        }

        @MainActor
        @objc func dateChanged(_ picker: UIDatePicker) {
            selection.wrappedValue = picker.date
        }
    }
}

private enum RouteGlyphKind {
    case origin
    case destination
}

private struct StationTrigger: View {
    @Environment(\.onTrackPalette) private var palette
    let title: String
    let station: Station?
    let isLoading: Bool
    let glyph: RouteGlyphKind
    let glyphColor: Color
    var trailingAction: AnyView?
    let onTap: () -> Void

    init(
        title: String,
        station: Station?,
        isLoading: Bool,
        glyph: RouteGlyphKind,
        glyphColor: Color,
        trailingAction: AnyView? = nil,
        onTap: @escaping () -> Void
    ) {
        self.title = title
        self.station = station
        self.isLoading = isLoading
        self.glyph = glyph
        self.glyphColor = glyphColor
        self.trailingAction = trailingAction
        self.onTap = onTap
    }

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            Button(action: onTap) {
                HStack(spacing: OnTrackTheme.space3) {
                    RouteGlyph(kind: glyph, color: glyphColor)

                    if isLoading {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text(station?.displayName ?? "")
                            .font(OnTrackFont.control)
                            .foregroundStyle(palette.text)
                            .lineLimit(1)
                    }

                    Spacer()
                }
                .padding(.leading, OnTrackTheme.space4)
                .padding(.trailing, OnTrackTheme.space4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(height: OnTrackTheme.routeRowHeight)
                .contentShape(Rectangle())
            }
            .buttonStyle(OnTrackPressButtonStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(title)
            .accessibilityValue(accessibilityValue)

            if let trailingAction {
                trailingAction
                    .padding(.trailing, OnTrackTheme.space2)
            }
        }
        .frame(height: OnTrackTheme.routeRowHeight)
    }

    private var accessibilityValue: String {
        if isLoading {
            return AppText.loading
        }

        return station?.displayName ?? AppText.notSelected
    }
}

private struct RouteGlyph: View {
    let kind: RouteGlyphKind
    let color: Color

    var body: some View {
        Group {
            switch kind {
            case .origin:
                Circle()
                    .strokeBorder(color, lineWidth: 1)
                    .frame(width: OnTrackTheme.space2, height: OnTrackTheme.space2)
            case .destination:
                Image(systemName: "flag")
                    .font(OnTrackFont.compactSymbol)
                    .foregroundStyle(color)
            }
        }
        .frame(width: OnTrackTheme.routeGlyphColumnWidth, height: 24)
    }
}

private struct TrainListView: View {
    let trains: [TrainInfo]
    let selectedTrain: TrainInfo?
    let isLoading: Bool
    let canLoadSchedule: Bool
    var usePlainEmptyState = false
    let onSelect: (TrainInfo) -> Void
    @State private var selectionFeedbackTrigger = 0

    var body: some View {
        Group {
            if !canLoadSchedule {
                emptyState(AppText.chooseRoute)
            } else if isLoading && trains.isEmpty {
                VStack(spacing: TrainPanelLayout.cardGap) {
                    ForEach(0..<3, id: \.self) { _ in
                        SkeletonTrainCard()
                    }
                }
            } else if trains.isEmpty {
                emptyState(AppText.noTrainsAvailable)
            } else {
                VStack(spacing: TrainPanelLayout.cardGap) {
                    ForEach(trains) { train in
                        TrainCard(
                            train: train,
                            isSelected: selectedTrain?.trainNo == train.trainNo
                        ) {
                            selectionFeedbackTrigger += 1
                            onSelect(train)
                        }
                    }
                }
            }
        }
        .sensoryFeedback(.selection, trigger: selectionFeedbackTrigger)
    }

    @ViewBuilder
    private func emptyState(_ message: String) -> some View {
        if usePlainEmptyState {
            PanelEmptyState(message: message)
        } else {
            EmptyPanel(message: message)
        }
    }
}

private struct TrainCard: View {
    @Environment(\.onTrackPalette) private var palette
    let train: TrainInfo
    let isSelected: Bool
    let onSelect: () -> Void

    private var isDelayed: Bool {
        (train.delay ?? 0) > 0
    }

    var body: some View {
        Button(action: onSelect) {
            VStack(spacing: TrainPanelLayout.rowGap) {
                timeCluster
                    .frame(maxWidth: .infinity)
                    .frame(height: TrainPanelLayout.topRowHeight)

                HStack(spacing: OnTrackTheme.space2) {
                    HStack(spacing: OnTrackTheme.space1) {
                        trainIdentifier

                        if let tripLine = TrainDisplay.tripLine(train.tripLine) {
                            Text("•")
                                .accessibilityHidden(true)

                            Text(tripLine)
                        }
                    }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .lineLimit(1)

                    Text(TrainDisplay.price(train.price) ?? "")
                        .frame(alignment: .trailing)
                }
                .font(OnTrackFont.control)
                .foregroundStyle(palette.dimText)
                .monospacedDigit()
                .lineLimit(1)
                .frame(height: TrainPanelLayout.bottomRowHeight)
            }
            .padding(.horizontal, TrainPanelLayout.cardHorizontalInset)
            .padding(.vertical, TrainPanelLayout.cardVerticalInset)
            .frame(maxWidth: .infinity)
            .frame(height: TrainPanelLayout.trainCardHeight)
            .background(
                isSelected ? palette.primarySubtle : palette.panel,
                in: RoundedRectangle(cornerRadius: OnTrackTheme.radiusPanel)
            )
            .contentShape(RoundedRectangle(cornerRadius: OnTrackTheme.radiusPanel))
            .overlay {
                RoundedRectangle(cornerRadius: OnTrackTheme.radiusPanel)
                    .strokeBorder(palette.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    private var timeCluster: some View {
        HStack(spacing: OnTrackTheme.space1) {
            TimeColumn(
                time: train.departureTime,
                adjustedTime: isDelayed ? TrainDisplay.adjustedTime(train.departureTime, delay: train.delay) : nil,
                alignment: .leading
            )

            TripSeparator(
                duration: TrainDisplay.tripDuration(
                    departure: train.departureTime,
                    arrival: train.arrivalTime
                )
            )

            TimeColumn(
                time: train.arrivalTime,
                adjustedTime: isDelayed ? TrainDisplay.adjustedTime(train.arrivalTime, delay: train.delay) : nil,
                alignment: .trailing
            )
        }
    }

    private var trainIdentifier: some View {
        Text("\(TrainDisplay.trainType(train.trainType)) \(train.trainNo)")
        .minimumScaleFactor(0.85)
    }

    private var accessibilityLabel: String {
        AppText.trainAccessibilityLabel(
            type: TrainDisplay.trainType(train.trainType),
            number: train.trainNo,
            departure: train.departureTime,
            arrival: train.arrivalTime,
            duration: TrainDisplay.tripDuration(departure: train.departureTime, arrival: train.arrivalTime),
            price: TrainDisplay.price(train.price),
            tripLine: TrainDisplay.tripLine(train.tripLine),
            delay: train.delay,
            isSelected: isSelected
        )
    }
}

private struct TripSeparator: View {
    @Environment(\.onTrackPalette) private var palette
    private static let minimumLineWidth: CGFloat = 4

    let duration: String

    var body: some View {
        HStack(spacing: OnTrackTheme.space1) {
            separatorLine

            Text(duration)
                .font(OnTrackFont.caption)
                .foregroundStyle(palette.dimText)
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .layoutPriority(1)

            separatorLine
        }
        .frame(minWidth: TrainPanelLayout.tripSeparatorWidth, maxWidth: .infinity)
    }

    private var separatorLine: some View {
        Rectangle()
            .fill(palette.border)
            .frame(height: 1)
            .frame(minWidth: Self.minimumLineWidth, maxWidth: .infinity)
    }
}

private struct TimeColumn: View {
    @Environment(\.onTrackPalette) private var palette
    let time: String
    let adjustedTime: String?
    let alignment: Alignment

    var body: some View {
        ZStack {
            Text(time)
                .font(OnTrackFont.time)
                .foregroundStyle(palette.text)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.85)

            if let adjustedTime {
                Text(adjustedTime)
                    .font(OnTrackFont.captionStrong)
                    .foregroundStyle(OnTrackTheme.danger)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                    .offset(y: -TrainPanelLayout.delayTextOffset)
            }
        }
        .frame(
            width: TrainPanelLayout.timeColumnWidth,
            height: TrainPanelLayout.topRowHeight,
            alignment: alignment
        )
    }
}

private struct StationSearchView: View {
    @Environment(\.onTrackPalette) private var palette
    let title: String
    let stations: [Station]
    let selectedStation: Station?
    let algorithmicStations: [Station]
    let historyStations: [Station]
    let onDismiss: () -> Void
    let onSelect: (Station) -> Void

    @State private var searchText = ""
    @FocusState private var isSearchFocused: Bool

    private var trimmedSearch: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isSearching: Bool {
        !trimmedSearch.isEmpty
    }

    private var searchPlaceholder: String {
        selectedStation?.displayName ?? AppText.searchStation
    }

    private var matchingStations: [Station] {
        let normalizedSearch = trimmedSearch.replacingOccurrences(of: "台", with: "臺")
        let normalizedEnglishSearch = normalizedEnglishName(trimmedSearch)
        let allowsCircularStation = isCircularSearch(trimmedSearch)

        return stations
            .enumerated()
            .compactMap { index, station -> RankedStation? in
                let normalizedStationName = normalizedEnglishName(station.nameEn)
                let matches = station.name.localizedCaseInsensitiveContains(trimmedSearch)
                    || station.name.localizedCaseInsensitiveContains(normalizedSearch)
                    || normalizedStationName.contains(normalizedEnglishSearch)
                    || station.id.localizedCaseInsensitiveContains(trimmedSearch)

                guard matches, allowsCircularStation || station.name != taipeiCircularStationName else {
                    return nil
                }

                let isExactMatch = station.name == trimmedSearch
                    || station.name == normalizedSearch
                    || normalizedStationName == normalizedEnglishSearch
                let priority = isExactMatch ? 0 : 1
                return RankedStation(station: station, priority: priority, index: index)
            }
            .sorted { lhs, rhs in
                lhs.priority == rhs.priority ? lhs.index < rhs.index : lhs.priority < rhs.priority
            }
            .map(\.station)
    }

    private var searchMatches: [Station] {
        guard isSearching else {
            return []
        }

        return matchingStations.filter { $0.id != selectedStation?.id }
    }

    private var visibleAlgorithmicStations: [Station] {
        let coveredIDs = Set(searchMatches.map(\.id))
        return algorithmicStations
            .filter { $0.id != selectedStation?.id && !coveredIDs.contains($0.id) }
            .prefix(3)
            .map { $0 }
    }

    private var visibleHistoryStations: [Station] {
        let coveredIDs = Set(searchMatches.map(\.id) + visibleAlgorithmicStations.map(\.id))
        let uncoveredHistory = historyStations.filter {
            $0.id != selectedStation?.id && !coveredIDs.contains($0.id)
        }

        return searchMatches.isEmpty ? uncoveredHistory : Array(uncoveredHistory.prefix(2))
    }

    private var otherStations: [Station] {
        let coveredIDs = Set(
            searchMatches.map(\.id)
                + visibleAlgorithmicStations.map(\.id)
                + visibleHistoryStations.map(\.id)
        )

        return stations.filter { station in
            station.id != selectedStation?.id
                && !coveredIDs.contains(station.id)
                && station.name != taipeiCircularStationName
        }
    }

    private var resultRows: [StationSearchResult] {
        searchMatches.map { StationSearchResult(station: $0, role: .regular) }
            + visibleAlgorithmicStations.map { StationSearchResult(station: $0, role: .algorithmic) }
            + visibleHistoryStations.map { StationSearchResult(station: $0, role: .history) }
            + otherStations.map { StationSearchResult(station: $0, role: .regular) }
    }

    private func selectedStation(_ station: Station) -> Station {
        guard station.name == taipeiCircularStationName, !isCircularSearch(searchText) else {
            return station
        }

        return stations.first(where: { $0.name == taipeiMainStationName }) ?? station
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
    }

    private func dismissSearch() {
        isSearchFocused = false

        DispatchQueue.main.async {
            onDismiss()
        }
    }

    private func selectSearchResult(_ station: Station) {
        isSearchFocused = false
        let resolvedStation = selectedStation(station)

        DispatchQueue.main.async {
            onSelect(resolvedStation)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Text(title)
                    .font(OnTrackFont.control)
                    .foregroundStyle(palette.text)
                    .lineLimit(1)

                HStack {
                    Spacer()

                    Button(action: dismissSearch) {
                        Image(systemName: "xmark")
                            .font(OnTrackFont.symbol)
                            .foregroundStyle(palette.dimText)
                            .frame(width: OnTrackTheme.controlHeight, height: OnTrackTheme.controlHeight)
                    }
                    .buttonStyle(OnTrackPressButtonStyle())
                    .accessibilityLabel(AppText.cancel)
                }
            }
            .frame(minHeight: 52)
            .padding(.horizontal, OnTrackTheme.space3)

            VStack(spacing: 0) {
                HStack(spacing: OnTrackTheme.space3) {
                    Image(systemName: "magnifyingglass")
                        .font(OnTrackFont.symbol)
                        .foregroundStyle(palette.dimText)
                        .frame(width: 24)

                    TextField(searchPlaceholder, text: $searchText)
                        .focused($isSearchFocused)
                        .font(OnTrackFont.control)
                        .foregroundStyle(palette.text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.search)

                    if isSearching {
                        Button {
                            searchText = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(OnTrackFont.symbol)
                                .foregroundStyle(palette.dimText)
                                .frame(width: OnTrackTheme.controlHeight, height: OnTrackTheme.controlHeight)
                        }
                        .buttonStyle(OnTrackPressButtonStyle())
                        .accessibilityLabel(AppText.clear)
                    }
                }
                .padding(.leading, OnTrackTheme.space4)
                .padding(.trailing, OnTrackTheme.space2)
                .frame(minHeight: 64)
                .contentShape(Rectangle())
                .onTapGesture {
                    isSearchFocused = true
                }

                if !resultRows.isEmpty {
                    Rectangle()
                        .fill(palette.border)
                        .frame(height: 1)

                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(resultRows) { row in
                                StationSearchRow(
                                    station: row.station,
                                    role: row.role
                                ) {
                                    selectSearchResult(row.station)
                                }
                            }
                        }
                    }
                    .scrollDismissesKeyboard(.interactively)
                }
            }
            .onTrackPanelSurface()
            .padding(.horizontal, OnTrackTheme.space5)
            .padding(.bottom, OnTrackTheme.space2)
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .frame(maxWidth: OnTrackTheme.modalContentMaxWidth)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(palette.background.ignoresSafeArea())
        .tint(palette.primary)
        .task {
            isSearchFocused = true
        }
    }
}

private struct StationSearchResult: Identifiable {
    let station: Station
    let role: StationSearchRowRole

    var id: String {
        "\(role)-\(station.id)"
    }
}

private struct RankedStation {
    let station: Station
    let priority: Int
    let index: Int
}

private enum StationSearchRowRole {
    case algorithmic
    case history
    case regular

    var iconSystemName: String {
        switch self {
        case .algorithmic:
            if #available(iOS 26.0, *) {
                "sparkles.2"
            } else {
                "sparkles"
            }
        case .history:
            "clock"
        case .regular:
            "magnifyingglass"
        }
    }

}

private struct StationSearchRow: View {
    @Environment(\.onTrackPalette) private var palette
    let station: Station
    let role: StationSearchRowRole
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: OnTrackTheme.space3) {
                Image(systemName: role.iconSystemName)
                    .font(OnTrackFont.symbol)
                    .foregroundStyle(palette.dimText)
                    .frame(width: 24)

                Text(station.displayName)
                    .font(OnTrackFont.control)
                    .foregroundStyle(palette.text)

                Spacer()
            }
            .frame(minHeight: 44)
            .padding(.horizontal, OnTrackTheme.space4)
            .padding(.vertical, OnTrackTheme.space2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private enum TrainPanelLayout {
    static let cardHeight: CGFloat = 64
    static let trainCardHeight: CGFloat = 76
    static let cardHorizontalInset = OnTrackTheme.space5
    static let cardVerticalInset = OnTrackTheme.space3
    static let topRowHeight = OnTrackTheme.space6
    static let bottomRowHeight = OnTrackTheme.space6
    static let rowGap = OnTrackTheme.space1 / 2
    static let timeColumnWidth = OnTrackTheme.space6 * 2 + OnTrackTheme.space2
    static let tripSeparatorWidth = OnTrackTheme.space6 * 2 + OnTrackTheme.space5
    static let delayTextOffset = OnTrackTheme.space3 + 2
    static let cardBorderAllowance: CGFloat = 1
    static let maxVisibleRows = 4
    static let loadingRows = 3

    static var cardGap: CGFloat {
        OnTrackTheme.space2
    }

    static var headerGap: CGFloat {
        OnTrackTheme.space2
    }

    static var stackGap: CGFloat {
        OnTrackTheme.space4
    }

    static func rowCount(isLoading: Bool, canLoadSchedule: Bool, trainCount: Int) -> Int {
        if isLoading && trainCount == 0 {
            return loadingRows
        }

        if !canLoadSchedule || trainCount == 0 {
            return 0
        }

        return trainCount
    }

    static func visibleTrainStackHeight(rowCount: Int) -> CGFloat {
        let visibleRows = min(maxVisibleRows, rowCount)
        guard visibleRows > 0 else { return 0 }

        return trainStackHeight(rowCount: visibleRows) + cardBorderAllowance * 2
    }

    static func bottomInset(safeAreaInset: CGFloat) -> CGFloat {
        safeAreaInset
    }

    static func contentReserve(rowCount: Int, bottomInset: CGFloat) -> CGFloat {
        visibleTrainStackHeight(rowCount: rowCount)
            + (rowCount > 0 ? stackGap : 0)
            + cardHeight
            + bottomInset
            + OnTrackTheme.space3
    }

    private static func trainStackHeight(rowCount: Int) -> CGFloat {
        let rows = CGFloat(max(0, rowCount))
        let gaps = CGFloat(max(0, rowCount - 1))

        return trainCardHeight * rows + cardGap * gaps
    }
}

private struct TrainBoardingPanel: View {
    @Environment(\.onTrackPalette) private var palette
    let message: String?
    let selectedTrain: TrainInfo?
    let destination: Station?
    let trains: [TrainInfo]
    let isLoading: Bool
    let canLoadSchedule: Bool
    let onSelect: (TrainInfo) -> Void

    var body: some View {
        VStack(spacing: TrainPanelLayout.stackGap) {
            if trainListRowCount > 0 {
                trainListSection
            }
            boardingSection
        }
        .frame(maxWidth: OnTrackTheme.contentMaxWidth)
        .padding(.horizontal, OnTrackTheme.space5)
        .frame(maxWidth: .infinity, alignment: .bottom)
    }

    private var trainListRowCount: Int {
        TrainPanelLayout.rowCount(
            isLoading: isLoading,
            canLoadSchedule: canLoadSchedule,
            trainCount: trains.count
        )
    }

    private var trainListSection: some View {
        VStack(alignment: .leading, spacing: TrainPanelLayout.headerGap) {
            panelSectionHeader(AppText.selectTrain)
            trainCards
        }
    }

    private var trainCards: some View {
        ScrollView {
            TrainListView(
                trains: trains,
                selectedTrain: selectedTrain,
                isLoading: isLoading,
                canLoadSchedule: canLoadSchedule,
                usePlainEmptyState: true
            ) { train in
                onSelect(train)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, TrainPanelLayout.cardBorderAllowance)
        }
        .scrollDisabled(trainListRowCount <= TrainPanelLayout.maxVisibleRows)
        .scrollIndicators(.hidden)
        .defaultScrollAnchor(.bottom)
        .frame(
            maxHeight: TrainPanelLayout.visibleTrainStackHeight(rowCount: trainListRowCount),
            alignment: .bottom
        )
        .clipped()
    }

    private var boardingSection: some View {
        VStack(alignment: .leading, spacing: TrainPanelLayout.headerGap) {
            panelSectionHeader(AppText.expectedBoarding)
            shareCard
        }
    }

    private var shareCard: some View {
        HStack(spacing: OnTrackTheme.space3) {
            VStack(alignment: .leading, spacing: 0) {
                Text(boardingSummary)
                    .font(OnTrackFont.control)
                    .foregroundStyle(selectedTrain == nil ? palette.dimText : palette.text)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .monospacedDigit()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(1)

            ShareLink(item: message ?? "") {
                Image(systemName: "square.and.arrow.up")
                    .font(OnTrackFont.symbol)
                    .foregroundStyle(message == nil ? palette.dimText : palette.primary)
                    .frame(width: OnTrackTheme.iconButtonSize, height: OnTrackTheme.iconButtonSize)
                    .contentShape(Rectangle())
            }
            .disabled(message == nil)
            .buttonStyle(OnTrackPressButtonStyle())
            .accessibilityLabel(AppText.shareVia)
        }
        .padding(.leading, OnTrackTheme.space5)
        .padding(.trailing, OnTrackTheme.space2)
        .padding(.vertical, OnTrackTheme.space2)
        .frame(maxWidth: .infinity)
        .frame(height: TrainPanelLayout.cardHeight)
        .onTrackPanelSurface(cornerRadius: OnTrackTheme.radiusPanel, castsShadow: false)
    }

    private var boardingSummary: String {
        guard let selectedTrain, let destination else {
            return canLoadSchedule ? AppText.noTrainsAvailable : AppText.chooseRoute
        }

        return AppText.boardingSummary(
            type: TrainDisplay.trainType(selectedTrain.trainType),
            number: selectedTrain.trainNo,
            time: TrainDisplay.adjustedTime(selectedTrain.arrivalTime, delay: selectedTrain.delay),
            station: destination.displayName
        )
    }

    private func panelSectionHeader(_ title: String) -> some View {
        Text(title)
            .font(OnTrackFont.control)
            .foregroundStyle(palette.dimText)
    }

}

private struct SettingsSheet: View {
    @Environment(\.dismiss) private var dismiss

    private let headerHeight = OnTrackTheme.space5 + OnTrackTheme.iconButtonSize + OnTrackTheme.routeDividerHeight

    @Binding var languageCode: String
    @Binding var appearanceRaw: String
    @Binding var messageFormatRaw: String
    let originName: String?
    let destinationName: String?
    @ObservedObject var purchaseManager: SupportPurchaseManager

    @State private var selectedAppIconRaw = AppIconSetting.current.rawValue
    @State private var showsSupportThanks = false

    var body: some View {
        GeometryReader { proxy in
            content(
                topSafeAreaInset: proxy.safeAreaInsets.top,
                bottomSafeAreaInset: proxy.safeAreaInsets.bottom
            )
                .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.automatic)
        .presentationBackground(palette.panel)
        .tint(palette.primary)
        .preferredColorScheme(appearanceSetting.preferredColorScheme)
        .onChange(of: purchaseManager.thankYouDialogID) { _, dialogID in
            showsSupportThanks = dialogID > 0
        }
        .alert(AppText.supportThanks, isPresented: $showsSupportThanks) {
            Button(AppText.done, role: .cancel) {}
        } message: {
            Text(AppText.supportThanksBody)
        }
        .environment(\.onTrackPalette, palette)
    }

    private func content(topSafeAreaInset: CGFloat, bottomSafeAreaInset: CGFloat) -> some View {
        ZStack(alignment: .top) {
            ScrollViewReader { scrollProxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if purchaseManager.isSupporter {
                            SettingsAppIconGroup(
                                selectedRawValue: $selectedAppIconRaw,
                                onSelect: setAppIcon
                            )

                            SettingsDivider()
                        }

                        SettingsOptionGroup(title: AppText.theme) {
                            ThemePicker(
                                settings: visibleAppearanceSettings,
                                selectedRawValue: appearanceRaw,
                                title: appearanceTitle
                            ) { setting in
                                setAppearance(setting)
                            }
                        }

                        SettingsDivider()

                        SettingsOptionGroup(title: AppText.defaultMessageFormat) {
                            ForEach(ShareMessageFormat.allCases) { format in
                                SettingsOptionButton(
                                    title: format.title,
                                    detail: messagePreview(for: format),
                                    isSelected: messageFormatRaw == format.rawValue
                                ) {
                                    messageFormatRaw = format.rawValue
                                }
                            }
                        }

                        SettingsDivider()

                        SettingsOptionGroup(title: AppText.language) {
                            ForEach(AppLanguageSetting.allCases) { setting in
                                SettingsOptionButton(
                                    title: languageTitle(setting),
                                    isSelected: languageCode == setting.rawValue
                                ) {
                                    languageCode = setting.rawValue
                                }
                            }
                        }

                        SettingsDivider()

                        SettingsSupportGroup(purchaseManager: purchaseManager)
                            .id(Self.supportScreenshotSectionID)

                        SettingsDivider()

                        SettingsOptionGroup(title: AppText.links) {
                            SettingsLinkRow(
                                title: AppText.support,
                                systemName: "questionmark.circle",
                                url: supportURL
                            )

                            SettingsLinkRow(
                                title: AppText.privacyPolicy,
                                systemName: "hand.raised",
                                url: privacyURL
                            )
                        }
                    }
                    .padding(.horizontal, OnTrackTheme.space5)
                    .padding(.top, topSafeAreaInset + headerHeight + OnTrackTheme.space4)
                    .padding(.bottom, OnTrackTheme.space5 + bottomSafeAreaInset)
                    .frame(maxWidth: OnTrackTheme.modalContentMaxWidth, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                .scrollIndicators(.hidden)
#if DEBUG
                .onAppear {
                    guard scrollsToSupportScreenshotSection else {
                        return
                    }

                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        scrollProxy.scrollTo(Self.supportScreenshotSectionID, anchor: .center)
                    }
                }
#endif
            }

            settingsHeader(topSafeAreaInset: topSafeAreaInset)
        }
        .background(palette.panel)
    }

    private static let supportScreenshotSectionID = "support-ontrack-screenshot-section"

    private func settingsHeader(topSafeAreaInset: CGFloat) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(AppText.settings)
                    .font(OnTrackFont.control)
                    .foregroundStyle(palette.text)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Button(action: dismiss.callAsFunction) {
                    Image(systemName: "xmark")
                        .font(OnTrackFont.symbol)
                        .foregroundStyle(palette.dimText)
                        .frame(width: OnTrackTheme.iconButtonSize, height: OnTrackTheme.iconButtonSize)
                        .contentShape(Rectangle())
                }
                .buttonStyle(OnTrackPressButtonStyle())
                .accessibilityLabel(AppText.cancel)
            }
            .padding(.top, topSafeAreaInset + OnTrackTheme.space5)
            .padding(.horizontal, OnTrackTheme.space5)
            .frame(maxWidth: OnTrackTheme.modalContentMaxWidth)
            .frame(maxWidth: .infinity)

            SettingsDivider()
        }
        .background(palette.panel)
    }

    private var appearanceSetting: AppAppearanceSetting {
        AppAppearanceSetting(rawValue: appearanceRaw) ?? AppAppearanceSetting.current
    }

    private var palette: OnTrackPalette {
        OnTrackPalette(setting: appearanceSetting)
    }

#if DEBUG
    private var scrollsToSupportScreenshotSection: Bool {
        ProcessInfo.processInfo.environment["ONTRACK_SCREENSHOT_TARGET"] == "support"
            || ProcessInfo.processInfo.arguments.contains("--screenshot-support")
    }
#endif

    private var visibleAppearanceSettings: [AppAppearanceSetting] {
        AppAppearanceSetting.allCases.filter { purchaseManager.isSupporter || !$0.requiresSupporter }
    }

    private var previewOriginName: String {
        originName ?? AppText.exampleOriginStation
    }

    private var previewDestinationName: String {
        destinationName ?? AppText.exampleDestinationStation
    }

    private func languageTitle(_ setting: AppLanguageSetting) -> String {
        switch setting {
        case .system:
            AppText.systemLanguage
        case .zhTW:
            AppText.traditionalChinese
        case .en:
            AppText.english
        }
    }

    private func appearanceTitle(_ setting: AppAppearanceSetting) -> String {
        switch setting {
        case .system:
            AppText.systemAppearance
        case .light:
            AppText.lightAppearance
        case .dark:
            AppText.darkAppearance
        case .sage:
            AppText.sageTheme
        case .amethyst:
            AppText.amethystTheme
        case .ember:
            AppText.emberTheme
        }
    }

    private func setAppearance(_ setting: AppAppearanceSetting) {
        appearanceRaw = setting.rawValue
    }

    private func messagePreview(for format: ShareMessageFormat) -> String {
        let time = "09:41"

        switch format {
        case .arrivalOnly:
            return AppText.arrivalMessage(time: time, station: previewDestinationName)
        case .routeArrival:
            return AppText.routeArrivalMessage(
                origin: previewOriginName,
                destination: previewDestinationName,
                time: time
            )
        }
    }

    private func setAppIcon(_ setting: AppIconSetting) {
        guard UIApplication.shared.supportsAlternateIcons,
              selectedAppIconRaw != setting.rawValue else {
            return
        }

        UIApplication.shared.setAlternateIconName(setting.alternateIconName) { error in
            guard error == nil else {
                return
            }

            DispatchQueue.main.async {
                selectedAppIconRaw = setting.rawValue
            }
        }
    }

}

private struct SettingsAppIconGroup: View {
    @Environment(\.onTrackPalette) private var palette
    @Binding var selectedRawValue: String
    let onSelect: (AppIconSetting) -> Void

    private let columns = [
        GridItem(.adaptive(minimum: 56), spacing: OnTrackTheme.space3)
    ]

    var body: some View {
        SettingsOptionGroup(title: AppText.appIcon) {
            LazyVGrid(columns: columns, alignment: .leading, spacing: OnTrackTheme.space4) {
                ForEach(AppIconSetting.allCases) { setting in
                    Button {
                        onSelect(setting)
                    } label: {
                        VStack(spacing: OnTrackTheme.space2) {
                            AppIconPreview(setting: setting, isSelected: selectedRawValue == setting.rawValue)

                            Text(setting.title)
                                .font(OnTrackFont.caption)
                                .foregroundStyle(palette.dimText)
                                .lineLimit(1)
                                .minimumScaleFactor(0.76)
                        }
                    }
                    .buttonStyle(OnTrackPressButtonStyle())
                    .accessibilityLabel(setting.title)
                    .accessibilityAddTraits(selectedRawValue == setting.rawValue ? [.isSelected] : [])
                }
            }
            .padding(.vertical, OnTrackTheme.space2)
        }
    }
}

private struct AppIconPreview: View {
    @Environment(\.onTrackPalette) private var palette
    let setting: AppIconSetting
    let isSelected: Bool

    var body: some View {
        Image(setting.previewImageName)
            .renderingMode(.original)
            .resizable()
            .scaledToFill()
            .frame(width: 56, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(color: palette.surfaceShadow, radius: 6, x: 0, y: 3)
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(
                        isSelected ? setting.accentColor : palette.border,
                        lineWidth: isSelected ? 2 : 1
                    )
            }
    }
}

private struct ThemePicker: View {
    @Environment(\.onTrackPalette) private var palette
    let settings: [AppAppearanceSetting]
    let selectedRawValue: String
    let title: (AppAppearanceSetting) -> String
    let onSelect: (AppAppearanceSetting) -> Void

    private let columns = [
        GridItem(.adaptive(minimum: 64), spacing: OnTrackTheme.space3)
    ]

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: OnTrackTheme.space4) {
            ForEach(settings) { setting in
                Button {
                    onSelect(setting)
                } label: {
                    VStack(spacing: OnTrackTheme.space2) {
                        ThemeSwatch(setting: setting, isSelected: selectedRawValue == setting.rawValue)

                        Text(title(setting))
                            .font(OnTrackFont.caption)
                            .foregroundStyle(palette.dimText)
                            .lineLimit(1)
                            .minimumScaleFactor(0.76)
                    }
                }
                .buttonStyle(OnTrackPressButtonStyle())
                .accessibilityLabel(title(setting))
                .accessibilityAddTraits(selectedRawValue == setting.rawValue ? [.isSelected] : [])
            }
        }
        .padding(.vertical, OnTrackTheme.space2)
    }
}

private struct ThemeSwatch: View {
    @Environment(\.onTrackPalette) private var palette
    let setting: AppAppearanceSetting
    let isSelected: Bool

    var body: some View {
        Circle()
            .fill(setting.previewColor)
            .frame(width: OnTrackTheme.controlHeight, height: OnTrackTheme.controlHeight)
            .overlay {
                if setting == .system {
                    Circle()
                        .trim(from: 0.5, to: 1)
                        .fill(Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255))
                        .rotationEffect(.degrees(90))
                }
            }
            .overlay {
                Circle()
                    .strokeBorder(
                        isSelected ? OnTrackPalette(setting: setting).primary : palette.border,
                        lineWidth: isSelected ? 2 : 1
                    )
            }
    }
}

private struct SettingsSupportGroup: View {
    @Environment(\.onTrackPalette) private var palette
    @ObservedObject var purchaseManager: SupportPurchaseManager

    var body: some View {
        SettingsOptionGroup(title: AppText.supportOnTrack) {
            VStack(alignment: .leading, spacing: OnTrackTheme.space3) {
                VStack(spacing: 0) {
                    SettingsActionButton(
                        title: purchaseTitle,
                        systemName: purchaseManager.isSupporter ? "checkmark.circle" : "heart",
                        isLoading: purchaseManager.isLoading,
                        isDisabled: purchaseManager.isSupporter || purchaseManager.isLoading
                    ) {
                        Task {
                            await purchaseManager.purchaseSupporterPack()
                        }
                    }

                    SettingsActionButton(
                        title: AppText.restorePurchases,
                        systemName: "arrow.clockwise",
                        isDisabled: purchaseManager.isLoading
                    ) {
                        Task {
                            await purchaseManager.restorePurchases()
                        }
                    }
                }

                if let statusMessage = purchaseManager.statusMessage {
                    Text(statusMessage)
                        .font(OnTrackFont.caption)
                        .foregroundStyle(palette.dimText)
                }

                if !purchaseManager.isSupporter {
                    Text(AppText.supportOnTrackFootnote)
                        .font(OnTrackFont.caption)
                        .foregroundStyle(palette.dimText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, OnTrackTheme.space2)
        }
    }

    private var purchaseTitle: String {
        if purchaseManager.isSupporter {
            return AppText.supported
        }

        guard let displayPrice = purchaseManager.supporterDisplayPrice else {
            return AppText.leaveTip
        }

        return AppText.leaveTip(price: displayPrice)
    }
}

private struct SettingsActionButton: View {
    @Environment(\.onTrackPalette) private var palette
    let title: String
    let systemName: String
    var isLoading = false
    var isDisabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: OnTrackTheme.space3) {
                Group {
                    if isLoading {
                        ProgressView()
                            .controlSize(.small)
                            .tint(palette.dimText)
                    } else {
                        Image(systemName: systemName)
                            .font(OnTrackFont.symbol)
                            .foregroundStyle(palette.dimText)
                    }
                }
                .frame(width: OnTrackTheme.space6, height: OnTrackTheme.space6)

                Text(title)
                    .font(OnTrackFont.control)
                    .foregroundStyle(isDisabled ? palette.dimText : palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                Spacer()
            }
            .padding(.horizontal, OnTrackTheme.space4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: OnTrackTheme.controlHeight)
            .contentShape(RoundedRectangle(cornerRadius: OnTrackTheme.radiusControl))
        }
        .buttonStyle(OnTrackPressButtonStyle())
        .disabled(isDisabled)
    }
}

private struct SettingsOptionGroup<Content: View>: View {
    @Environment(\.onTrackPalette) private var palette
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: OnTrackTheme.space2) {
            Text(title)
                .font(OnTrackFont.label)
                .foregroundStyle(palette.dimText)
                .tracking(0.4)

            VStack(spacing: 0) {
                content
            }
        }
        .padding(.vertical, OnTrackTheme.space4)
    }
}

private struct SettingsOptionButton: View {
    @Environment(\.onTrackPalette) private var palette
    let title: String
    var detail: String?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: OnTrackTheme.space3) {
                Text(title)
                    .font(OnTrackFont.control)
                    .foregroundStyle(isSelected ? palette.primary : palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                Spacer()

                if let detail {
                    Text(detail)
                        .font(OnTrackFont.control)
                        .foregroundStyle(palette.dimText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                        .multilineTextAlignment(.trailing)
                        .layoutPriority(1)
                }

                Image(systemName: "checkmark")
                    .font(OnTrackFont.symbol)
                    .foregroundStyle(palette.primary)
                    .frame(width: OnTrackTheme.space5)
                    .opacity(isSelected ? 1 : 0)
                    .accessibilityHidden(!isSelected)
            }
            .padding(.horizontal, OnTrackTheme.space4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: OnTrackTheme.controlHeight)
            .background(
                isSelected ? palette.primarySubtle : Color.clear,
                in: RoundedRectangle(cornerRadius: OnTrackTheme.radiusControl)
            )
            .contentShape(RoundedRectangle(cornerRadius: OnTrackTheme.radiusControl))
        }
        .buttonStyle(OnTrackPressButtonStyle())
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

private struct SettingsDivider: View {
    @Environment(\.onTrackPalette) private var palette

    var body: some View {
        Rectangle()
            .fill(palette.border)
            .frame(height: 1)
    }
}

private struct SettingsLinkRow: View {
    @Environment(\.onTrackPalette) private var palette
    let title: String
    let systemName: String
    let url: URL

    var body: some View {
        Link(destination: url) {
            HStack(spacing: OnTrackTheme.space3) {
                Label(title, systemImage: systemName)
                    .font(OnTrackFont.control)
                    .foregroundStyle(palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                Spacer()

                Image(systemName: "arrow.up.right")
                    .font(OnTrackFont.symbol)
                    .foregroundStyle(palette.dimText)
            }
            .padding(.horizontal, OnTrackTheme.space4)
            .frame(minHeight: OnTrackTheme.controlHeight)
        }
    }
}

private struct IconSquareButton: View {
    let systemName: String
    var isLoading = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            IconSquare(systemName: systemName, isLoading: isLoading)
        }
        .buttonStyle(OnTrackPressButtonStyle())
    }
}

private struct IconPlainButton: View {
    @Environment(\.onTrackPalette) private var palette
    let systemName: String
    var isLoading = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(palette.dimText)
                } else {
                    Image(systemName: systemName)
                        .font(OnTrackFont.symbol)
                        .foregroundStyle(palette.dimText)
                }
            }
            .frame(width: OnTrackTheme.iconButtonSize, height: OnTrackTheme.iconButtonSize)
        }
        .buttonStyle(OnTrackPressButtonStyle())
    }
}

private struct IconSquare: View {
    @Environment(\.onTrackPalette) private var palette
    let systemName: String
    var isLoading = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
                    .controlSize(.small)
                    .tint(palette.dimText)
            } else {
                Image(systemName: systemName)
                    .font(OnTrackFont.symbol)
                    .foregroundStyle(palette.dimText)
            }
        }
            .frame(width: OnTrackTheme.iconButtonSize, height: OnTrackTheme.iconButtonSize)
            .onTrackPanelSurface(cornerRadius: OnTrackTheme.radiusControl)
    }
}

private struct PanelActionIcon: View {
    let systemName: String
    let color: Color

    var body: some View {
        Image(systemName: systemName)
            .font(OnTrackFont.symbol)
            .foregroundStyle(color)
            .frame(width: OnTrackTheme.iconButtonSize, height: OnTrackTheme.iconButtonSize)
            .contentShape(Rectangle())
    }
}

private struct EmptyPanel: View {
    @Environment(\.onTrackPalette) private var palette
    let message: String

    var body: some View {
        Text(message)
            .font(OnTrackFont.body)
            .foregroundStyle(palette.dimText)
            .frame(maxWidth: .infinity)
            .padding(OnTrackTheme.space5)
            .onTrackPanelSurface()
    }
}

private struct PanelEmptyState: View {
    @Environment(\.onTrackPalette) private var palette
    let message: String

    var body: some View {
        Text(message)
            .font(OnTrackFont.body)
            .foregroundStyle(palette.dimText)
            .frame(maxWidth: .infinity, minHeight: TrainPanelLayout.cardHeight)
            .padding(.horizontal, OnTrackTheme.space4)
            .onTrackPanelSurface()
    }
}

private struct SkeletonTrainCard: View {
    @Environment(\.onTrackPalette) private var palette

    var body: some View {
        RoundedRectangle(cornerRadius: OnTrackTheme.radiusPanel)
            .fill(palette.panel)
            .frame(height: TrainPanelLayout.trainCardHeight)
            .onTrackSurfaceRing(castsShadow: false)
            .opacity(0.7)
    }
}

private struct OnTrackPressButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(isEnabled ? 1 : 0.48)
            .scaleEffect(isEnabled && configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private enum OnTrackFont {
    private static let compact = Font.system(size: 12)
    private static let standard = Font.system(size: 18)

    static let body = standard
    static let caption = compact
    static let captionStrong = compact.weight(.bold)
    static let compactSymbol = compact.weight(.bold)
    static let control = standard.weight(.semibold)
    static let label = compact.weight(.medium)
    static let symbol = standard.weight(.semibold)
    static let time = standard.weight(.bold)
}

private extension View {
    func onTrackPanelSurface(
        cornerRadius: CGFloat = OnTrackTheme.radiusPanel,
        ringColor: Color? = nil,
        castsShadow: Bool = true
    ) -> some View {
        modifier(OnTrackPanelSurfaceModifier(
            cornerRadius: cornerRadius,
            ringColor: ringColor,
            castsShadow: castsShadow
        ))
    }

    func onTrackSurfaceRing(
        cornerRadius: CGFloat = OnTrackTheme.radiusPanel,
        ringColor: Color? = nil,
        castsShadow: Bool = true
    ) -> some View {
        modifier(OnTrackSurfaceRingModifier(
            cornerRadius: cornerRadius,
            ringColor: ringColor,
            castsShadow: castsShadow
        ))
    }

    func onTrackCircleSurface() -> some View {
        modifier(OnTrackCircleSurfaceModifier())
    }
}

private struct OnTrackPanelSurfaceModifier: ViewModifier {
    @Environment(\.onTrackPalette) private var palette

    let cornerRadius: CGFloat
    let ringColor: Color?
    let castsShadow: Bool

    func body(content: Content) -> some View {
        content
            .background(palette.panel, in: RoundedRectangle(cornerRadius: cornerRadius))
            .modifier(OnTrackSurfaceRingModifier(
                cornerRadius: cornerRadius,
                ringColor: ringColor,
                castsShadow: castsShadow
            ))
    }
}

private struct OnTrackSurfaceRingModifier: ViewModifier {
    @Environment(\.onTrackPalette) private var palette

    let cornerRadius: CGFloat
    let ringColor: Color?
    let castsShadow: Bool

    func body(content: Content) -> some View {
        content
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(ringColor ?? palette.border, lineWidth: 1)
            }
            .shadow(
                color: castsShadow ? palette.surfaceShadow : .clear,
                radius: castsShadow ? 8 : 0,
                x: 0,
                y: castsShadow ? 4 : 0
            )
    }
}

private struct OnTrackCircleSurfaceModifier: ViewModifier {
    @Environment(\.onTrackPalette) private var palette

    func body(content: Content) -> some View {
        content
            .background(palette.panel, in: Circle())
            .overlay {
                Circle()
                    .stroke(palette.border, lineWidth: 1)
            }
            .shadow(color: palette.surfaceShadow, radius: 8, x: 0, y: 4)
    }
}

private extension AppAppearanceSetting {
    var preferredColorScheme: ColorScheme? {
        switch self {
        case .system:
            nil
        case .light, .sage:
            .light
        case .dark, .amethyst, .ember:
            .dark
        }
    }

    var previewColor: Color {
        switch self {
        case .system:
            Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255)
        case .light:
            .white
        case .dark:
            Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255)
        case .sage:
            Color(red: 101 / 255, green: 145 / 255, blue: 87 / 255)
        case .amethyst:
            Color(red: 173 / 255, green: 150 / 255, blue: 218 / 255)
        case .ember:
            Color(red: 209 / 255, green: 105 / 255, blue: 35 / 255)
        }
    }
}

private struct OnTrackPalette: Equatable {
    private static let lightAccent = UIColor(red: 53 / 255, green: 125 / 255, blue: 233 / 255, alpha: 1)
    private static let darkAccent = UIColor(red: 96 / 255, green: 165 / 255, blue: 250 / 255, alpha: 1)

    let setting: AppAppearanceSetting

    var background: Color {
        switch setting {
        case .sage:
            return Color(red: 246 / 255, green: 250 / 255, blue: 244 / 255)
        case .amethyst:
            return Color(red: 24 / 255, green: 22 / 255, blue: 32 / 255)
        case .ember:
            return Color(red: 35 / 255, green: 31 / 255, blue: 31 / 255)
        case .system, .light, .dark:
            break
        }

        return Self.adaptiveColor(
            light: UIColor(red: 248 / 255, green: 250 / 255, blue: 252 / 255, alpha: 1),
            dark: UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1)
        )
    }

    var panel: Color {
        switch setting {
        case .sage:
            return Color(red: 255 / 255, green: 255 / 255, blue: 252 / 255)
        case .amethyst:
            return Color(red: 38 / 255, green: 34 / 255, blue: 50 / 255)
        case .ember:
            return Color(red: 48 / 255, green: 42 / 255, blue: 42 / 255)
        case .system, .light, .dark:
            break
        }

        return Self.adaptiveColor(
            light: .white,
            dark: UIColor(red: 30 / 255, green: 41 / 255, blue: 59 / 255, alpha: 1)
        )
    }

    var border: Color {
        switch setting {
        case .sage:
            return Color(red: 101 / 255, green: 145 / 255, blue: 87 / 255).opacity(0.18)
        case .amethyst:
            return Color(red: 173 / 255, green: 150 / 255, blue: 218 / 255).opacity(0.18)
        case .ember:
            return Color(red: 209 / 255, green: 105 / 255, blue: 35 / 255).opacity(0.16)
        case .system, .light, .dark:
            break
        }

        return Self.adaptiveColor(
            light: UIColor.black.withAlphaComponent(0.10),
            dark: UIColor.white.withAlphaComponent(0.10)
        )
    }

    var text: Color {
        switch setting {
        case .sage:
            return Color(red: 25 / 255, green: 42 / 255, blue: 24 / 255)
        case .amethyst:
            return Color(red: 245 / 255, green: 240 / 255, blue: 255 / 255)
        case .ember:
            return Color(red: 255 / 255, green: 246 / 255, blue: 239 / 255)
        case .system, .light, .dark:
            break
        }

        return Self.adaptiveColor(
            light: UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1),
            dark: UIColor(red: 241 / 255, green: 245 / 255, blue: 249 / 255, alpha: 1)
        )
    }

    var dimText: Color {
        switch setting {
        case .sage:
            return Color(red: 83 / 255, green: 105 / 255, blue: 74 / 255)
        case .amethyst:
            return Color(red: 189 / 255, green: 178 / 255, blue: 213 / 255)
        case .ember:
            return Color(red: 205 / 255, green: 184 / 255, blue: 172 / 255)
        case .system, .light, .dark:
            break
        }

        return Self.adaptiveColor(
            light: UIColor(red: 71 / 255, green: 85 / 255, blue: 105 / 255, alpha: 1),
            dark: UIColor(red: 148 / 255, green: 163 / 255, blue: 184 / 255, alpha: 1)
        )
    }

    var primary: Color {
        switch setting {
        case .sage:
            Color(red: 101 / 255, green: 145 / 255, blue: 87 / 255)
        case .amethyst:
            Color(red: 173 / 255, green: 150 / 255, blue: 218 / 255)
        case .ember:
            Color(red: 209 / 255, green: 105 / 255, blue: 35 / 255)
        case .light:
            Color(Self.lightAccent)
        case .dark:
            Color(Self.darkAccent)
        case .system:
            Self.adaptiveColor(light: Self.lightAccent, dark: Self.darkAccent)
        }
    }

    var primarySubtle: Color {
        switch setting {
        case .sage:
            return Color(red: 101 / 255, green: 145 / 255, blue: 87 / 255).opacity(0.14)
        case .amethyst:
            return Color(red: 173 / 255, green: 150 / 255, blue: 218 / 255).opacity(0.22)
        case .ember:
            return Color(red: 209 / 255, green: 105 / 255, blue: 35 / 255).opacity(0.22)
        case .light:
            return Color(Self.lightAccent).opacity(0.12)
        case .dark:
            return Color(Self.darkAccent).opacity(0.20)
        case .system:
            return Self.adaptiveColor(
                light: Self.lightAccent.withAlphaComponent(0.12),
                dark: Self.darkAccent.withAlphaComponent(0.20)
            )
        }
    }

    var surfaceShadow: Color {
        switch setting {
        case .sage:
            return Color(red: 34 / 255, green: 65 / 255, blue: 28 / 255).opacity(0.07)
        case .amethyst:
            return Color.black.opacity(0.18)
        case .ember:
            return Color.black.opacity(0.18)
        case .system, .light, .dark:
            break
        }

        return Self.adaptiveColor(
            light: UIColor.black.withAlphaComponent(0.04),
            dark: UIColor.black.withAlphaComponent(0.12)
        )
    }

    private static func adaptiveColor(light: UIColor, dark: UIColor) -> Color {
        Color(UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark ? dark : light
        })
    }
}

private struct OnTrackPaletteKey: EnvironmentKey {
    static let defaultValue = OnTrackPalette(setting: .light)
}

private extension EnvironmentValues {
    var onTrackPalette: OnTrackPalette {
        get { self[OnTrackPaletteKey.self] }
        set { self[OnTrackPaletteKey.self] = newValue }
    }
}

private enum OnTrackTheme {
    static let danger = Color(red: 239 / 255, green: 68 / 255, blue: 68 / 255)
    static let success = Color(red: 34 / 255, green: 197 / 255, blue: 94 / 255)

    static let radiusControl: CGFloat = 8
    static let radiusPanel: CGFloat = 12
    static let controlHeight: CGFloat = 44
    static let iconButtonSize: CGFloat = 44
    static let routeGlyphColumnWidth: CGFloat = 24
    static let routeDividerHeight: CGFloat = 1
    static let routeRowHeight: CGFloat = 56
    static let contentMaxWidth: CGFloat = 520
    static let modalContentMaxWidth: CGFloat = 640
    static let timeModePickerMaxWidth: CGFloat = 260
    static let timeModePickerMinWidth: CGFloat = 192

    static let space1: CGFloat = 4
    static let space2: CGFloat = 8
    static let space3: CGFloat = 12
    static let space4: CGFloat = 16
    static let space5: CGFloat = 20
    static let space6: CGFloat = 24

}

#Preview {
    ContentView()
}
