/** Prototype policy; TDX fields are from its official Rail v3 OpenAPI schema. */
export interface Stop {
    StationID: string;
    StationName?: { Zh_tw: string };
    SuspendedFlag?: number;
}

export interface Timetable {
    TrainInfo: { TrainNo: string; SuspendedFlag?: number; Note?: string };
    StopTimes: Stop[];
}

export interface ServiceState {
    kind: 'normal' | 'cancelled' | 'partial' | 'unknown';
    cause: 'full' | 'endpoint' | 'partial' | 'missing' | 'stale' | 'normal';
    recommend: boolean;
    flaggedStations: string[];
}

export function assessService(
    timetable: Timetable,
    origin: string,
    destination: string,
    snapshot: {
        serviceDate: string;
        requestedDate: string;
        fetchedAt: string | null;
        now: number;
        maxAgeSeconds?: number;
    }
): ServiceState {
    const stops = timetable.StopTimes;
    const start = stops.findIndex((stop) => stop.StationID === origin);
    const end = stops.findIndex(
        (stop, index) => index > start && stop.StationID === destination
    );
    const flaggedStations = stops
        .filter((stop) => stop.SuspendedFlag === 1)
        .map((stop) => stop.StationName?.Zh_tw ?? stop.StationID);
    const result = (
        kind: ServiceState['kind'],
        cause: ServiceState['cause']
    ): ServiceState => ({
        kind,
        cause,
        recommend: kind !== 'cancelled',
        flaggedStations,
    });
    const age = snapshot.fetchedAt
        ? (snapshot.now - Date.parse(snapshot.fetchedAt)) / 1000
        : NaN;
    if (
        snapshot.serviceDate !== snapshot.requestedDate ||
        start < 0 ||
        end < 0
    ) {
        return { ...result('unknown', 'missing'), recommend: false };
    }
    if (!snapshot.fetchedAt) return result('unknown', 'missing');
    if (!Number.isFinite(age) || age < 0) {
        return { ...result('unknown', 'stale'), recommend: false };
    }
    if (age > (snapshot.maxAgeSeconds ?? 120)) {
        return result('unknown', 'stale');
    }
    if (timetable.TrainInfo.SuspendedFlag === 1)
        return result('cancelled', 'full');
    if (stops[start].SuspendedFlag === 1 || stops[end].SuspendedFlag === 1) {
        return result('cancelled', 'endpoint');
    }
    // A partial flag alone does not prove that the selected journey is cancelled.
    if (timetable.TrainInfo.SuspendedFlag === 2 || flaggedStations.length > 0) {
        return result('partial', 'partial');
    }
    if (
        timetable.TrainInfo.SuspendedFlag !== 0 ||
        stops[start].SuspendedFlag !== 0 ||
        stops[end].SuspendedFlag !== 0
    ) {
        return result('unknown', 'missing');
    }
    return result('normal', 'normal');
}

export interface Alert {
    AlertID: string;
    Title: string;
    Description: string;
    Status: number;
    StartTime?: string | null;
    EndTime?: string | null;
    UpdateTime: string;
    Direction?: number | null;
    Scope?: {
        Trains?: { TrainNo?: string }[];
        Routes?: { RouteID?: string }[];
        Lines?: { LineID?: string }[];
        Stations?: { StationID?: string }[];
        LineSections?: {
            LineID?: string;
            StartingStationID?: string;
            EndingStationID?: string;
        }[];
    };
}

export function relevantAlerts(
    alerts: Alert[],
    route: {
        trainNos: string[];
        routeIds: string[];
        lineIds: string[];
        stationIds: string[];
    },
    now: number
): Alert[] {
    return alerts.filter((alert) => {
        // Direction uses different semantics from TrainInfo.Direction. Do not compare them.
        if (alert.Status === 1) return false;
        if (
            alert.StartTime &&
            (!Number.isFinite(Date.parse(alert.StartTime)) ||
                Date.parse(alert.StartTime) > now)
        )
            return false;
        if (
            alert.EndTime &&
            (!Number.isFinite(Date.parse(alert.EndTime)) ||
                Date.parse(alert.EndTime) <= now)
        )
            return false;
        const scope = alert.Scope;
        if (!scope) return false;
        return Boolean(
            scope.Trains?.some(
                (train) =>
                    train.TrainNo && route.trainNos.includes(train.TrainNo)
            ) ||
            scope.Routes?.some(
                (item) => item.RouteID && route.routeIds.includes(item.RouteID)
            ) ||
            scope.Lines?.some(
                (line) => line.LineID && route.lineIds.includes(line.LineID)
            ) ||
            scope.Stations?.some(
                (stop) =>
                    stop.StationID && route.stationIds.includes(stop.StationID)
            ) ||
            scope.LineSections?.some(
                (section) =>
                    section.LineID && route.lineIds.includes(section.LineID)
            )
        );
    });
}
