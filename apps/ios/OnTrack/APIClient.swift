import Foundation

actor APIClient {
    static let shared = APIClient()

    private static let defaultBaseURL = URL(string: "https://ontrack.hsichen.dev")!

    private let baseURL = APIClient.resolveBaseURL()
    private let decoder = JSONDecoder()
    private let errorDecoder = JSONDecoder()

    func stations() async throws -> [Station] {
#if DEBUG
        if usesMockData {
            return MockAPI.stations
        }
#endif

        return try await get("/api/stations")
    }

    func schedule(
        origin: Station,
        destination: Station,
        date: Date = Date(),
        refreshLive: Bool = false
    ) async throws -> ScheduleResponse {
#if DEBUG
        if usesMockData {
            return MockAPI.schedule(origin: origin, destination: destination, date: date)
        }
#endif

        var components = URLComponents()
        components.path = "/api/schedule"
        components.queryItems = [
            URLQueryItem(name: "origin", value: origin.id),
            URLQueryItem(name: "dest", value: destination.id),
            URLQueryItem(name: "date", value: Formatters.scheduleDate.string(from: date)),
        ]
        if refreshLive {
            components.queryItems?.append(URLQueryItem(name: "refreshLive", value: "1"))
        }

        guard let url = components.url(relativeTo: baseURL)?.absoluteURL else {
            throw APIError.invalidURL
        }

        return try await get(url)
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIError.invalidURL
        }

        return try await get(url)
    }

    private func get<T: Decodable>(_ url: URL) async throws -> T {
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await URLSession.shared.data(from: url)
        } catch let error as URLError {
            if error.code == .cancelled || Task.isCancelled {
                throw CancellationError()
            }

            throw APIError.networkUnavailable(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorResponse = try? errorDecoder.decode(APIErrorResponse.self, from: data)
            throw APIError.requestFailed(
                statusCode: httpResponse.statusCode,
                serverError: errorResponse?.error
            )
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.invalidData
        }
    }

    private static func resolveBaseURL() -> URL {
#if DEBUG
        if let environmentURL = validBaseURL(
            ProcessInfo.processInfo.environment["ONTRACK_API_ORIGIN"]
        ) {
            return environmentURL
        }
#endif

        if let bundleURL = validBaseURL(
            Bundle.main.object(forInfoDictionaryKey: "OnTrackAPIOrigin") as? String
        ) {
            return bundleURL
        }

        return defaultBaseURL
    }

    private static func validBaseURL(_ value: String?) -> URL? {
        guard let trimmedValue = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmedValue.isEmpty,
              let url = URL(string: trimmedValue),
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              url.host != nil
        else {
            return nil
        }

        return url
    }

#if DEBUG
    private var usesMockData: Bool {
        ProcessInfo.processInfo.environment["ONTRACK_MOCK_DATA"] == "1"
            || ProcessInfo.processInfo.arguments.contains("--mock-data")
            || usesShowcaseData
    }

    private var usesShowcaseData: Bool {
        ProcessInfo.processInfo.environment["ONTRACK_SHOWCASE_DATA"] == "1"
            || ProcessInfo.processInfo.arguments.contains("--showcase-data")
    }
#endif
}

private struct APIErrorResponse: Decodable {
    let error: APIServerError
}

struct APIServerError: Decodable {
    let code: String
    let message: String
    let requestId: String?
}

#if DEBUG
private enum MockAPI {
    static let stations = [
        Station(id: "1000", name: "臺北", nameEn: "Taipei", lat: 25.04775, lon: 121.51711),
        Station(id: "1020", name: "板橋", nameEn: "Banqiao", lat: 25.01434, lon: 121.46377),
        Station(id: "1080", name: "桃園", nameEn: "Taoyuan", lat: 24.98888, lon: 121.31449),
        Station(id: "1100", name: "中壢", nameEn: "Zhongli_Taoyuan", lat: 24.95374, lon: 121.22589),
        Station(id: "1210", name: "新竹", nameEn: "Hsinchu", lat: 24.80157, lon: 120.97157),
        Station(id: "1250", name: "竹南", nameEn: "Zhunan", lat: 24.68654, lon: 120.88041),
        Station(id: "3160", name: "苗栗", nameEn: "Miaoli", lat: 24.57001, lon: 120.82233),
        Station(id: "3300", name: "臺中", nameEn: "Taichung", lat: 24.13728, lon: 120.68691),
        Station(id: "3360", name: "彰化", nameEn: "Changhua", lat: 24.08177, lon: 120.53854),
        Station(id: "4080", name: "嘉義", nameEn: "Chiayi", lat: 23.47915, lon: 120.44114),
        Station(id: "4220", name: "臺南", nameEn: "Tainan", lat: 22.99681, lon: 120.21295),
        Station(id: "4400", name: "高雄", nameEn: "Kaohsiung", lat: 22.63946, lon: 120.30292),
    ]

    static func schedule(origin: Station, destination: Station, date: Date) -> ScheduleResponse {
        ScheduleResponse(
            date: Formatters.scheduleDate.string(from: date),
            origin: origin,
            destination: destination,
            trains: mockTrains(origin: origin, destination: destination),
            meta: ScheduleMeta(
                scheduleCacheStatus: .hit,
                scheduleSnapshotFetchedAt: nil,
                liveDataStatus: .fresh,
                liveDataFetchedAt: nil,
                liveDataAgeSeconds: 0
            )
        )
    }

    private static func mockTrains(origin: Station, destination: Station) -> [TrainInfo] {
        if ProcessInfo.processInfo.environment["ONTRACK_SHOWCASE_DATA"] == "1"
            || ProcessInfo.processInfo.arguments.contains("--showcase-data") {
            return showcaseTrains(origin: origin, destination: destination)
        }

        return (0..<54).map { index in
            let departureMinutes = 5 * 60 + index * 20
            let durationMinutes = index.isMultiple(of: 3) ? 66 : 78
            let delay = index % 7 == 2 ? 4 : nil

            return TrainInfo(
                trainNo: "\(100 + index)",
                trainType: trainType(for: index),
                direction: 0,
                originStation: origin.id,
                destinationStation: destination.id,
                departureTime: clockTime(departureMinutes),
                arrivalTime: clockTime(departureMinutes + durationMinutes),
                tripLine: index.isMultiple(of: 4) ? 2 : 1,
                price: trainPrice(for: index),
                delay: delay,
                status: delay == nil ? .onTime : .delayed
            )
        }
    }

    private static func showcaseTrains(origin: Station, destination: Station) -> [TrainInfo] {
        [
            TrainInfo(
                trainNo: "124",
                trainType: "區間快",
                direction: 0,
                originStation: origin.id,
                destinationStation: destination.id,
                departureTime: "09:20",
                arrivalTime: "10:38",
                tripLine: 2,
                price: 322,
                delay: nil,
                status: .onTime
            ),
            TrainInfo(
                trainNo: "125",
                trainType: "區間",
                direction: 0,
                originStation: origin.id,
                destinationStation: destination.id,
                departureTime: "09:38",
                arrivalTime: "10:54",
                tripLine: 1,
                price: 322,
                delay: 4,
                status: .delayed
            ),
            TrainInfo(
                trainNo: "126",
                trainType: "自強",
                direction: 0,
                originStation: origin.id,
                destinationStation: destination.id,
                departureTime: "09:54",
                arrivalTime: "11:10",
                tripLine: 1,
                price: 500,
                delay: nil,
                status: .onTime
            ),
            TrainInfo(
                trainNo: "127",
                trainType: "區間",
                direction: 0,
                originStation: origin.id,
                destinationStation: destination.id,
                departureTime: "10:08",
                arrivalTime: "11:26",
                tripLine: 1,
                price: 322,
                delay: nil,
                status: .onTime
            ),
            TrainInfo(
                trainNo: "128",
                trainType: "自強",
                direction: 0,
                originStation: origin.id,
                destinationStation: destination.id,
                departureTime: "10:22",
                arrivalTime: "11:38",
                tripLine: 1,
                price: 500,
                delay: nil,
                status: .onTime
            ),
            TrainInfo(
                trainNo: "129",
                trainType: "區間",
                direction: 0,
                originStation: origin.id,
                destinationStation: destination.id,
                departureTime: "10:38",
                arrivalTime: "11:56",
                tripLine: 2,
                price: 322,
                delay: nil,
                status: .onTime
            ),
            TrainInfo(
                trainNo: "130",
                trainType: "自強",
                direction: 0,
                originStation: origin.id,
                destinationStation: destination.id,
                departureTime: "10:52",
                arrivalTime: "12:08",
                tripLine: 1,
                price: 500,
                delay: nil,
                status: .onTime
            ),
            TrainInfo(
                trainNo: "131",
                trainType: "區間快",
                direction: 0,
                originStation: origin.id,
                destinationStation: destination.id,
                departureTime: "11:08",
                arrivalTime: "12:26",
                tripLine: 2,
                price: 322,
                delay: nil,
                status: .onTime
            ),
        ]
    }

    private static func trainType(for index: Int) -> String {
        switch index % 3 {
        case 0:
            return "自強"
        case 1:
            return "區間快"
        default:
            return "區間"
        }
    }

    private static func trainPrice(for index: Int) -> Int {
        index.isMultiple(of: 3) ? 500 : 322
    }

    private static func clockTime(_ minutes: Int) -> String {
        let hours = (minutes / 60) % 24
        let displayMinutes = minutes % 60
        return "\(String(format: "%02d", hours)):\(String(format: "%02d", displayMinutes))"
    }
}
#endif

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case invalidData
    case networkUnavailable(URLError)
    case requestFailed(statusCode: Int, serverError: APIServerError?)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            AppText.apiInvalidRequest
        case .invalidResponse:
            AppText.apiInvalidResponse
        case .invalidData:
            AppText.apiInvalidData
        case .networkUnavailable:
            AppText.apiNetworkUnavailable
        case .requestFailed(let statusCode, let serverError):
            requestFailedDescription(statusCode: statusCode, serverError: serverError)
        }
    }

    private func requestFailedDescription(
        statusCode: Int,
        serverError: APIServerError?
    ) -> String {
        if let serverError {
            return AppText.apiServerMessage(serverMessage(for: serverError), requestId: serverError.requestId)
        }

        if statusCode == 429 || statusCode == 503 {
            return AppText.apiServiceUnavailable
        }

        if statusCode >= 500 {
            return AppText.apiSystemDown
        }

        return AppText.apiRequestFailed(statusCode: statusCode)
    }

    private func serverMessage(for serverError: APIServerError) -> String {
        switch serverError.code {
        case "bad_request":
            return AppText.apiInvalidRequest
        case "service_capacity":
            return AppText.apiServiceUnavailable
        case "upstream_unavailable":
            return AppText.apiUpstreamUnavailable
        case "service_unavailable", "internal_error":
            return AppText.apiSystemDown
        default:
            return serverError.message
        }
    }
}
