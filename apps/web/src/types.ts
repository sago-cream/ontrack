export interface Station {
    id: string;
    name: string;
    nameEn: string;
    lat?: number;
    lon?: number;
}

export interface TrainInfo {
    trainNo: string;
    trainType: string;
    direction: number; // 0: Shunxing (Clockwise), 1: Nixing (Counter-clockwise)
    originStation: string;
    destinationStation: string;
    departureTime: string; // HH:mm
    arrivalTime: string; // HH:mm
    tripLine?: number; // 1: Mountain Line, 2: Coast Line
    price?: number | null; // Adult fare in TWD
    delay?: number; // Minutes, 0 = On Time, undefined = Unknown
    status: 'on-time' | 'delayed' | 'cancelled' | 'unknown';
    suspension?:
        | 'full'
        | 'origin-stop'
        | 'destination-stop'
        | 'partial'
        | 'unknown'
        | null;
    suspendedStations?: string[];
}

export interface ScheduleResponse {
    date: string;
    origin: Station;
    destination: Station;
    trains: TrainInfo[];
    meta?: {
        scheduleCacheStatus: 'hit' | 'derived' | 'warming';
        scheduleSnapshotFetchedAt: string | null;
        liveDataStatus: 'fresh' | 'stale' | 'unavailable' | 'not-applicable';
        liveDataFetchedAt: string | null;
        liveDataAgeSeconds: number | null;
    };
}
