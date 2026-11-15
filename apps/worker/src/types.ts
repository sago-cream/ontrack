export type TDXFormat = 'JSON' | 'XML';
export type TDXTier = 'basic' | 'advanced';
export type TDXCaller =
    | 'station-refresh'
    | 'daily-timetable-refresh'
    | 'route-fare-refresh'
    | 'live-board-refresh';

export interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    TDX_CLIENT_ID?: string;
    TDX_CLIENT_SECRET?: string;
    REFRESH_SECRET?: string;
    CORS_ALLOWED_ORIGINS?: string;
}

export interface Station {
    id: string;
    name: string;
    nameEn: string;
    lat?: number;
    lon?: number;
}

export interface TDXStation {
    StationID: string;
    StationName: {
        Zh_tw: string;
        En: string;
    };
    StationPosition?: {
        PositionLat?: number;
        PositionLon?: number;
    };
}

export interface TDXStopTime {
    StationID: string;
    StationName: { Zh_tw: string };
    DepartureTime: string | null;
    ArrivalTime: string | null;
    SuspendedFlag?: number;
}

export interface TDXFullTimetable {
    TrainInfo: {
        TrainNo: string;
        TrainTypeName: { Zh_tw: string };
        TrainTypeCode?: string;
        Direction: number;
        TripLine?: number;
        SuspendedFlag?: number;
    };
    StopTimes: TDXStopTime[];
    SuspendedStationNames?: string[];
}

export interface TDXTimetableResponse {
    TrainTimetables?: TDXFullTimetable[];
}

export interface TDXODFare {
    Direction: number;
    TrainType: number;
    Fares: Array<{
        TicketType: number;
        FareClass: number;
        CabinClass: number;
        Price: number;
    }>;
    TravelDistance: number;
}

export interface TDXODFareResponse {
    ODFares?: TDXODFare[];
}

export interface TrainInfo {
    trainNo: string;
    trainType: string;
    direction: number;
    originStation: string;
    destinationStation: string;
    departureTime: string;
    arrivalTime: string;
    tripLine: number;
    price: number | null;
    delay: number;
    status: 'on-time' | 'delayed' | 'cancelled' | 'unknown';
    suspension:
        | 'full'
        | 'origin-stop'
        | 'destination-stop'
        | 'partial'
        | 'unknown'
        | null;
    suspendedStations: string[];
}

export interface Snapshot<T> {
    key: string;
    data: T;
    last_modified: string | null;
    fetched_at: string;
}

export interface TDXOptions {
    searchParams?: Record<string, string>;
    tier?: TDXTier;
    format?: TDXFormat;
    ifModifiedSince?: string | null;
    caller?: TDXCaller;
}

export interface TDXResponse<T> {
    data: T | null;
    lastModified: string | null;
    notModified: boolean;
}

export interface DelaySnapshot {
    delays: Record<string, number>;
}

export type ScheduleCacheStatus = 'hit' | 'derived' | 'warming';
export type LiveDataStatus =
    | 'fresh'
    | 'stale'
    | 'unavailable'
    | 'not-applicable';

export interface ScheduleMeta {
    scheduleCacheStatus: ScheduleCacheStatus;
    scheduleSnapshotFetchedAt: string | null;
    liveDataStatus: LiveDataStatus;
    liveDataFetchedAt: string | null;
    liveDataAgeSeconds: number | null;
}
