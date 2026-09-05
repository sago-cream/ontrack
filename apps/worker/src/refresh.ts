import {
    getSnapshot,
    getTopRouteInterests,
    hasAnyRecentRouteTimeInterest,
    hasRecentRelatedRouteTimeInterest,
    hasRecentRouteTimeInterest,
    pruneSnapshots,
    reserveLiveRefreshCall,
    upsertSnapshot,
} from './d1';
import { MANUAL_LIVE_REFRESH_CLIENT_DAILY_LIMIT } from './policy';
import { fetchTDX, fetchTDXWithCache } from './tdx';
import {
    getLookbackIso,
    getNextTaipeiDate,
    getTaipeiDate,
    getTaipeiHour,
    isTaipeiWeekend,
} from './time';
import type {
    DelaySnapshot,
    Env,
    ScheduleCacheStatus,
    Snapshot,
    Station,
    TDXFullTimetable,
    TDXODFare,
    TDXODFareResponse,
    TDXStation,
    TDXTimetableResponse,
} from './types';

export { getTaipeiDate } from './time';

export const STATIONS_KEY = 'stations';
export const LIVE_BOARD_KEY = 'train-live-board';
const ROUTE_TIMETABLE_RETENTION_DAYS = 2;
const FULL_TIMETABLE_RETENTION_DAYS = 2;
const POPULAR_ROUTE_PREWARM_LIMIT = 12;
const LIVE_BOARD_DEMAND_LOOKBACK_DAYS = 30;
const ROUTE_FARE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const LIVE_BOARD_BACKGROUND_DAILY_LIMIT = 125;
const LIVE_BOARD_MANUAL_DAILY_LIMIT = 15;
const LIVE_BOARD_MAX_AGE_SECONDS = {
    'peak': 10 * 60,
    'shoulder': 30 * 60,
    'non-active': 60 * 60,
} satisfies Record<LiveBoardActivityWindow, number>;
const dailyTimetableRefreshes = new Map<string, Promise<TDXFullTimetable[]>>();
const routeFareRefreshes = new Map<string, Promise<TDXODFare[]>>();
let liveBoardRefresh: Promise<DelaySnapshot> | null = null;
let liveBoardAdmission: Promise<DelaySnapshot | null> | null = null;

type LiveBoardActivityWindow = 'peak' | 'shoulder' | 'non-active';
type LiveBoardBudgetBucket = 'background' | 'manual';

export interface CachedRouteTimetable {
    timetables: TDXFullTimetable[];
    cacheStatus: ScheduleCacheStatus;
    snapshotFetchedAt: string | null;
}

export interface LiveBoardPolicy {
    activityWindow: LiveBoardActivityWindow;
    maxAgeSeconds: number;
    taipeiHour: number;
}

function getRoutePruneCutoffDate(date = new Date()) {
    return getTaipeiDate(
        new Date(
            date.getTime() -
                ROUTE_TIMETABLE_RETENTION_DAYS * 24 * 60 * 60 * 1000
        )
    );
}

function getFullTimetablePruneCutoffDate(date = new Date()) {
    return getTaipeiDate(
        new Date(
            date.getTime() - FULL_TIMETABLE_RETENTION_DAYS * 24 * 60 * 60 * 1000
        )
    );
}

export function getLiveBoardPolicy(date = new Date()): LiveBoardPolicy {
    const taipeiHour = getTaipeiHour(date);
    let activityWindow: LiveBoardActivityWindow;

    if (isTaipeiWeekend(date)) {
        activityWindow =
            taipeiHour >= 9 && taipeiHour < 20 ? 'shoulder' : 'non-active';
    } else if (
        (taipeiHour >= 6 && taipeiHour < 9) ||
        (taipeiHour >= 16 && taipeiHour < 20)
    ) {
        activityWindow = 'peak';
    } else if (
        (taipeiHour >= 9 && taipeiHour < 16) ||
        (taipeiHour >= 20 && taipeiHour < 23)
    ) {
        activityWindow = 'shoulder';
    } else {
        activityWindow = 'non-active';
    }

    return {
        activityWindow,
        maxAgeSeconds: LIVE_BOARD_MAX_AGE_SECONDS[activityWindow],
        taipeiHour,
    };
}

export function timetableKey(date: string) {
    return `daily-timetable:${date}`;
}

export function routeTimetableKey(date: string, origin: string, dest: string) {
    return `daily-timetable-od:${date}:${origin}:${dest}`;
}

export function routeFareKey(origin: string, dest: string) {
    return `route-fare:${origin}:${dest}`;
}

function toStations(data: TDXStation[]): Station[] {
    return data.map((station) => ({
        id: station.StationID,
        name: station.StationName.Zh_tw,
        nameEn: station.StationName.En,
        lat: station.StationPosition?.PositionLat,
        lon: station.StationPosition?.PositionLon,
    }));
}

export async function refreshStations(env: Env) {
    const data = await fetchTDX<TDXStation[] | { Stations?: TDXStation[] }>(
        env,
        'v3/Rail/TRA/Station',
        {
            searchParams: {
                $select: 'StationID,StationName,StationPosition',
                $top: '999',
            },
            tier: 'basic',
            caller: 'station-refresh',
        }
    );

    const stations = toStations(
        Array.isArray(data) ? data : (data.Stations ?? [])
    );
    await upsertSnapshot(env, STATIONS_KEY, stations, null);
    return stations;
}

export async function refreshTimetable(env: Env, date = getTaipeiDate()) {
    const path =
        date === getTaipeiDate()
            ? 'v3/Rail/TRA/DailyTrainTimetable/Today'
            : `v3/Rail/TRA/DailyTrainTimetable/TrainDate/${date}`;
    const data = await fetchTDX<TDXTimetableResponse>(env, path, {
        searchParams: {
            $select: 'TrainInfo,StopTimes',
        },
        tier: 'basic',
        caller: 'daily-timetable-refresh',
    });
    const timetables = data.TrainTimetables ?? [];

    await upsertSnapshot(env, timetableKey(date), timetables, null);
    return timetables;
}

async function refreshRouteFares(
    env: Env,
    origin: string,
    dest: string
): Promise<TDXODFare[]> {
    const data = await fetchTDX<TDXODFareResponse | TDXODFare[]>(
        env,
        `v3/Rail/TRA/ODFare/${origin}/to/${dest}`,
        {
            tier: 'basic',
            caller: 'route-fare-refresh',
        }
    );
    const fares = Array.isArray(data) ? data : (data.ODFares ?? []);

    await upsertSnapshot(env, routeFareKey(origin, dest), fares, null);
    return fares;
}

export async function getRouteFares(
    env: Env,
    origin: string,
    dest: string
): Promise<TDXODFare[]> {
    const key = routeFareKey(origin, dest);
    const snapshot = await getSnapshot<TDXODFare[]>(env, key);
    if (
        snapshot &&
        getSnapshotAgeSeconds(snapshot) <= ROUTE_FARE_MAX_AGE_SECONDS
    ) {
        return snapshot.data;
    }

    const existingRefresh = routeFareRefreshes.get(key);
    if (existingRefresh) {
        return existingRefresh;
    }

    const refresh = refreshRouteFares(env, origin, dest)
        .catch((error) => {
            if (snapshot) {
                console.error('Failed to refresh route fares:', error);
                return snapshot.data;
            }

            throw error;
        })
        .finally(() => routeFareRefreshes.delete(key));
    routeFareRefreshes.set(key, refresh);
    return refresh;
}

export function filterRouteTimetables(
    timetables: TDXFullTimetable[],
    origin: string,
    dest: string
) {
    const routeTimetables: TDXFullTimetable[] = [];

    for (const timetable of timetables) {
        const stops = timetable.StopTimes || [];
        let originStop: TDXFullTimetable['StopTimes'][number] | null = null;
        let destStop: TDXFullTimetable['StopTimes'][number] | null = null;

        for (const stop of stops) {
            if (!originStop) {
                if (stop.StationID === origin) {
                    originStop = stop;
                }
                continue;
            }

            if (stop.StationID === dest) {
                destStop = stop;
                break;
            }
        }

        if (originStop && destStop) {
            routeTimetables.push({
                ...timetable,
                StopTimes: [originStop, destStop],
            });
        }
    }

    return routeTimetables;
}

async function refreshLiveBoardUncached(env: Env) {
    const previous = await getSnapshot<DelaySnapshot>(env, LIVE_BOARD_KEY);
    const response = await fetchTDXWithCache<{
        TrainLiveBoards?: { TrainNo: string; DelayTime?: number }[];
        TrainLiveBoardList?: { TrainNo: string; DelayTime?: number }[];
    }>(env, 'v3/Rail/TRA/TrainLiveBoard', {
        tier: 'basic',
        searchParams: {
            $select: 'TrainNo,DelayTime',
        },
        ifModifiedSince: previous?.last_modified,
        caller: 'live-board-refresh',
    });

    if (response.notModified && previous) {
        await upsertSnapshot(
            env,
            LIVE_BOARD_KEY,
            previous.data,
            response.lastModified
        );
        return previous.data;
    }

    const liveData =
        response.data?.TrainLiveBoards ??
        response.data?.TrainLiveBoardList ??
        [];
    const delays = Object.fromEntries(
        liveData.map((train) => [train.TrainNo, train.DelayTime ?? 0])
    );
    const snapshot: DelaySnapshot = { delays };

    await upsertSnapshot(env, LIVE_BOARD_KEY, snapshot, response.lastModified);

    return snapshot;
}

export async function refreshLiveBoard(env: Env) {
    if (liveBoardRefresh) {
        return liveBoardRefresh;
    }

    liveBoardRefresh = refreshLiveBoardUncached(env).finally(() => {
        liveBoardRefresh = null;
    });
    return liveBoardRefresh;
}

function logLiveBoardRefreshSkipped(
    reason: string,
    mode: LiveBoardBudgetBucket | 'cron-demand' | 'auto-demand',
    policy: LiveBoardPolicy
) {
    console.info(
        JSON.stringify({
            event: 'live_board_refresh_skipped',
            reason,
            mode,
            activityWindow: policy.activityWindow,
            taipeiHour: policy.taipeiHour,
            maxAgeSeconds: policy.maxAgeSeconds,
        })
    );
}

async function refreshLiveBoardWithBudget(
    env: Env,
    bucket: LiveBoardBudgetBucket,
    date = new Date(),
    clientBucket?: string
) {
    if (liveBoardRefresh) {
        return liveBoardRefresh;
    }

    if (liveBoardAdmission) {
        return liveBoardAdmission;
    }

    liveBoardAdmission = (async () => {
        if (liveBoardRefresh) {
            return liveBoardRefresh;
        }

        const limit =
            bucket === 'manual'
                ? LIVE_BOARD_MANUAL_DAILY_LIMIT
                : LIVE_BOARD_BACKGROUND_DAILY_LIMIT;
        if (bucket === 'manual' && clientBucket) {
            const clientReserved = await reserveLiveRefreshCall(
                env,
                clientBucket,
                MANUAL_LIVE_REFRESH_CLIENT_DAILY_LIMIT,
                date
            );

            if (!clientReserved) {
                logLiveBoardRefreshSkipped(
                    'client-daily-budget-exhausted',
                    bucket,
                    getLiveBoardPolicy(date)
                );
                return null;
            }
        }

        const reserved = await reserveLiveRefreshCall(env, bucket, limit, date);

        if (!reserved) {
            logLiveBoardRefreshSkipped(
                'daily-budget-exhausted',
                bucket,
                getLiveBoardPolicy(date)
            );
            return null;
        }

        return refreshLiveBoard(env);
    })().finally(() => {
        liveBoardAdmission = null;
    });

    return liveBoardAdmission;
}

export async function refreshLiveBoardForManual(
    env: Env,
    date = new Date(),
    clientBucket?: string
) {
    return refreshLiveBoardWithBudget(env, 'manual', date, clientBucket);
}

export async function refreshLiveBoardForAuto(
    env: Env,
    origin: string,
    dest: string,
    date = new Date()
) {
    const policy = getLiveBoardPolicy(date);
    const sinceIso = getLookbackIso(LIVE_BOARD_DEMAND_LOOKBACK_DAYS, date);
    const hasAnyDemand = await hasAnyRecentRouteTimeInterest(env, sinceIso);
    const hasRelatedDemand =
        !hasAnyDemand ||
        (await hasRecentRelatedRouteTimeInterest(
            env,
            origin,
            dest,
            policy.taipeiHour,
            sinceIso
        ));

    if (!hasRelatedDemand) {
        logLiveBoardRefreshSkipped(
            'no-related-route-hour-demand',
            'auto-demand',
            policy
        );
        return null;
    }

    return refreshLiveBoardWithBudget(env, 'background', date);
}

export async function refreshLiveBoardForCron(env: Env, date = new Date()) {
    const policy = getLiveBoardPolicy(date);
    const snapshot = await getLiveBoardSnapshot(env);
    if (snapshot && getSnapshotAgeSeconds(snapshot) <= policy.maxAgeSeconds) {
        logLiveBoardRefreshSkipped('fresh-enough', 'cron-demand', policy);
        return null;
    }

    const sinceIso = getLookbackIso(LIVE_BOARD_DEMAND_LOOKBACK_DAYS, date);
    const hasAnyDemand = await hasAnyRecentRouteTimeInterest(env, sinceIso);
    const hasTimeDemand =
        !hasAnyDemand ||
        (await hasRecentRouteTimeInterest(env, policy.taipeiHour, sinceIso));

    if (!hasTimeDemand) {
        logLiveBoardRefreshSkipped('no-hour-demand', 'cron-demand', policy);
        return null;
    }

    return refreshLiveBoardWithBudget(env, 'background', date);
}

export async function ensureStations(env: Env) {
    const snapshot = await getSnapshot<Station[]>(env, STATIONS_KEY);
    return snapshot?.data ?? refreshStations(env);
}

export async function getLiveBoardSnapshot(env: Env) {
    return getSnapshot<DelaySnapshot>(env, LIVE_BOARD_KEY);
}

export function getSnapshotAgeSeconds(snapshot: Snapshot<unknown>) {
    return Math.max(
        0,
        Math.floor((Date.now() - Date.parse(snapshot.fetched_at)) / 1000)
    );
}

export async function ensureTimetable(env: Env, date: string) {
    const snapshot = await getSnapshot<TDXFullTimetable[]>(
        env,
        timetableKey(date)
    );
    if (snapshot) {
        return snapshot.data;
    }

    const existingRefresh = dailyTimetableRefreshes.get(date);
    if (existingRefresh) {
        return existingRefresh;
    }

    const refresh = refreshTimetable(env, date).finally(() =>
        dailyTimetableRefreshes.delete(date)
    );
    dailyTimetableRefreshes.set(date, refresh);
    return refresh;
}

async function deriveRouteFromDailySnapshot(
    env: Env,
    date: string,
    origin: string,
    dest: string,
    snapshot: Snapshot<TDXFullTimetable[]>
): Promise<CachedRouteTimetable> {
    const timetables = filterRouteTimetables(snapshot.data, origin, dest);
    try {
        await upsertSnapshot(
            env,
            routeTimetableKey(date, origin, dest),
            timetables,
            null
        );
    } catch (error) {
        console.error('Failed to cache derived route timetable:', error);
    }

    return {
        timetables,
        cacheStatus: 'derived',
        snapshotFetchedAt: snapshot.fetched_at,
    };
}

export async function getCachedRouteTimetable(
    env: Env,
    date: string,
    origin: string,
    dest: string
): Promise<CachedRouteTimetable> {
    const routeSnapshot = await getSnapshot<TDXFullTimetable[]>(
        env,
        routeTimetableKey(date, origin, dest)
    );
    if (routeSnapshot) {
        return {
            timetables: routeSnapshot.data,
            cacheStatus: 'hit',
            snapshotFetchedAt: routeSnapshot.fetched_at,
        };
    }

    const dailySnapshot = await getSnapshot<TDXFullTimetable[]>(
        env,
        timetableKey(date)
    );
    if (dailySnapshot) {
        return deriveRouteFromDailySnapshot(
            env,
            date,
            origin,
            dest,
            dailySnapshot
        );
    }

    return {
        timetables: [],
        cacheStatus: 'warming',
        snapshotFetchedAt: null,
    };
}

export async function ensureRouteTimetable(
    env: Env,
    date: string,
    origin: string,
    dest: string
) {
    const cached = await getCachedRouteTimetable(env, date, origin, dest);
    if (cached.cacheStatus !== 'warming') {
        return cached.timetables;
    }

    const dailyTimetables = await ensureTimetable(env, date);
    const routeTimetables = filterRouteTimetables(
        dailyTimetables,
        origin,
        dest
    );
    await upsertSnapshot(
        env,
        routeTimetableKey(date, origin, dest),
        routeTimetables,
        null
    );
    return routeTimetables;
}

export async function refreshDailySnapshots(env: Env) {
    const today = getTaipeiDate();
    const tomorrow = getNextTaipeiDate();

    await Promise.all([
        refreshStations(env),
        refreshTimetable(env, today),
        refreshTimetable(env, tomorrow),
        pruneSnapshots(
            env,
            getRoutePruneCutoffDate(),
            getFullTimetablePruneCutoffDate()
        ),
    ]);

    const routes = await getTopRouteInterests(env, POPULAR_ROUTE_PREWARM_LIMIT);
    await Promise.all(
        routes.flatMap((route) => [
            getCachedRouteTimetable(env, today, route.origin, route.dest),
            getCachedRouteTimetable(env, tomorrow, route.origin, route.dest),
        ])
    );
}
