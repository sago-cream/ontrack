import { recordRouteInterest } from './d1';
import {
    getManualLiveRefreshClientBucket,
    normalizeScheduleDate,
    resolveScheduleStations,
} from './policy';
import {
    ensureRouteTimetable,
    ensureStations,
    getCachedRouteTimetable,
    getLiveBoardPolicy,
    getLiveBoardSnapshot,
    getRouteFares,
    getSnapshotAgeSeconds,
    getTaipeiDate,
    refreshDailySnapshots,
    refreshLiveBoardForAuto,
    refreshLiveBoardForCron,
    refreshLiveBoardForManual,
} from './refresh';
import { TDXServiceError } from './tdx';
import type {
    Env,
    LiveDataStatus,
    ScheduleMeta,
    TDXFullTimetable,
    TDXODFare,
    TDXStopTime,
    TrainInfo,
} from './types';

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), microphone=(), camera=()',
};
const DEFAULT_CORS_ALLOWED_ORIGINS = ['https://ontrack.hsichen.dev'];
const CORS_ALLOWED_METHODS = new Set(['GET']);
const CORS_ALLOWED_HEADERS = 'Authorization, Content-Type';
const CORS_MAX_AGE_SECONDS = '86400';
const ACTIVE_SCHEDULE_CRON = '*/10 * * * *';
let cachedCorsOriginsKey: string | undefined;
let cachedCorsOrigins: Set<string> | undefined;
const PUBLIC_DOCUMENT_PATHS = new Set([
    '/',
    '/app',
    '/docs',
    '/docs/features',
    '/docs/legal',
    '/docs/settings',
    '/docs/support',
    '/docs/privacy',
]);
type ApiErrorCode =
    | 'bad_request'
    | 'forbidden'
    | 'not_found'
    | 'unauthorized'
    | 'service_capacity'
    | 'upstream_unavailable'
    | 'service_unavailable'
    | 'internal_error';

function json(data: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(data), {
        ...init,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...SECURITY_HEADERS,
            ...init.headers,
        },
    });
}

function normalizeOrigin(origin: string) {
    try {
        return new URL(origin).origin;
    } catch {
        return null;
    }
}

function getCorsAllowedOrigins(env: Env) {
    const originsKey = env.CORS_ALLOWED_ORIGINS ?? '';
    if (cachedCorsOrigins && cachedCorsOriginsKey === originsKey) {
        return cachedCorsOrigins;
    }

    cachedCorsOriginsKey = originsKey;
    cachedCorsOrigins = new Set(
        [...DEFAULT_CORS_ALLOWED_ORIGINS, ...originsKey.split(',')]
            .map((origin) => normalizeOrigin(origin.trim()))
            .filter((origin): origin is string => Boolean(origin))
    );
    return cachedCorsOrigins;
}

function getAllowedCorsOrigin(request: Request, env: Env) {
    const origin = request.headers.get('Origin');
    if (!origin) {
        return null;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) {
        return null;
    }

    return getCorsAllowedOrigins(env).has(normalizedOrigin)
        ? normalizedOrigin
        : null;
}

function appendVary(headers: Headers, value: string) {
    const vary = headers.get('Vary');
    if (!vary) {
        headers.set('Vary', value);
        return;
    }

    const values = vary.split(',').map((item) => item.trim().toLowerCase());
    if (!values.includes(value.toLowerCase())) {
        headers.set('Vary', `${vary}, ${value}`);
    }
}

function withCorsHeaders(response: Response, request: Request, env: Env) {
    const allowedOrigin = getAllowedCorsOrigin(request, env);
    if (!allowedOrigin) {
        return response;
    }

    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    headers.set(
        'Access-Control-Allow-Methods',
        [...CORS_ALLOWED_METHODS, 'OPTIONS'].join(', ')
    );
    headers.set(
        'Access-Control-Allow-Headers',
        request.headers.get('Access-Control-Request-Headers') ??
            CORS_ALLOWED_HEADERS
    );
    headers.set('Access-Control-Max-Age', CORS_MAX_AGE_SECONDS);
    appendVary(headers, 'Origin');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function isAllowedCorsRequest(request: Request, env: Env) {
    return (
        !request.headers.has('Origin') ||
        (Boolean(getAllowedCorsOrigin(request, env)) &&
            CORS_ALLOWED_METHODS.has(request.method.toUpperCase()))
    );
}

function handleCorsPreflight(request: Request, env: Env) {
    const requestedMethod = request.headers.get(
        'Access-Control-Request-Method'
    );

    if (
        !getAllowedCorsOrigin(request, env) ||
        !requestedMethod ||
        !CORS_ALLOWED_METHODS.has(requestedMethod.toUpperCase())
    ) {
        return new Response(null, {
            status: 403,
            headers: SECURITY_HEADERS,
        });
    }

    return withCorsHeaders(
        new Response(null, {
            status: 204,
            headers: SECURITY_HEADERS,
        }),
        request,
        env
    );
}

function jsonError(
    code: ApiErrorCode,
    message: string,
    status: number,
    requestId: string,
    init: ResponseInit = {}
) {
    return json(
        {
            error: {
                code,
                message,
                requestId,
            },
        },
        {
            ...init,
            status,
        }
    );
}

function assetNotFound(request: Request) {
    const acceptsHtml = request.headers.get('accept')?.includes('text/html');

    return new Response(acceptsHtml ? 'Not found' : null, {
        status: 404,
        headers: {
            ...(acceptsHtml
                ? { 'Content-Type': 'text/plain; charset=utf-8' }
                : {}),
            ...SECURITY_HEADERS,
        },
    });
}

function getNormalizedPathname(url: URL) {
    return url.pathname !== '/' && url.pathname.endsWith('/')
        ? url.pathname.slice(0, -1)
        : url.pathname;
}

function isUnknownDocumentPath(url: URL) {
    const pathname = getNormalizedPathname(url);

    return !pathname.includes('.') && !PUBLIC_DOCUMENT_PATHS.has(pathname);
}

function getRequestId(request: Request) {
    return (
        request.headers.get('cf-ray') ??
        request.headers.get('x-request-id') ??
        crypto.randomUUID()
    );
}

function shouldRefreshLiveBoardForCron(date: Date) {
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();

    if ((hour >= 6 && hour <= 8) || (hour >= 16 && hour <= 19)) {
        return minute % 10 === 0;
    }

    if ((hour >= 9 && hour <= 15) || (hour >= 20 && hour <= 22)) {
        return minute % 30 === 0;
    }

    return (hour <= 5 || hour === 23) && minute === 0;
}

function shouldRefreshDailySnapshotsForCron(date: Date) {
    return date.getUTCHours() === 19 && date.getUTCMinutes() === 50;
}

function waitUntilLogged(
    ctx: ExecutionContext,
    task: Promise<unknown>,
    label: string
) {
    ctx.waitUntil(
        task.catch((error) => {
            console.error(`${label} failed:`, error);
        })
    );
}

function isValidStationId(id: unknown): id is string {
    return (
        typeof id === 'string' && /^[A-Z0-9-]+$/i.test(id) && id.length <= 10
    );
}

function getTrainPrice(timetable: TDXFullTimetable, routeFares: TDXODFare[]) {
    const trainType = Number(timetable.TrainInfo.TrainTypeCode);
    if (!Number.isFinite(trainType)) {
        return null;
    }

    const matchingFare = routeFares.find(
        (fare) =>
            fare.Direction === timetable.TrainInfo.Direction &&
            fare.TrainType === trainType
    );
    const adultFare = matchingFare?.Fares.find(
        (fare) =>
            fare.TicketType === 1 &&
            fare.FareClass === 1 &&
            fare.CabinClass === 1
    );

    return adultFare && Number.isFinite(adultFare.Price)
        ? adultFare.Price
        : null;
}

export function mapTrainToAppTrainInfo(
    timetable: TDXFullTimetable,
    origin: string,
    dest: string,
    delayMap: Map<string, number>,
    routeFares: TDXODFare[] = []
): TrainInfo | null {
    const stops = timetable.StopTimes || [];
    let originStop: TDXStopTime | null = null;
    let destStop: TDXStopTime | null = null;

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

    if (!originStop || !destStop) {
        return null;
    }

    const trainNo = timetable.TrainInfo.TrainNo;
    const delay = delayMap.get(trainNo);
    const status =
        delay === undefined ? 'unknown' : delay > 0 ? 'delayed' : 'on-time';

    return {
        trainNo,
        trainType: timetable.TrainInfo.TrainTypeName.Zh_tw,
        direction: timetable.TrainInfo.Direction,
        originStation: originStop.StationName.Zh_tw,
        destinationStation: destStop.StationName.Zh_tw,
        departureTime: originStop.DepartureTime,
        arrivalTime: destStop.ArrivalTime,
        tripLine: timetable.TrainInfo.TripLine ?? 0,
        price: getTrainPrice(timetable, routeFares),
        delay: delay || 0,
        status,
    };
}

async function handleStations(env: Env) {
    const stations = await ensureStations(env);

    return json(stations, {
        headers: {
            'Cache-Control':
                'public, s-maxage=86400, stale-while-revalidate=604800',
        },
    });
}

function getLiveDataStatus(
    isToday: boolean,
    liveBoard: Awaited<ReturnType<typeof getLiveBoardSnapshot>>,
    maxAgeSeconds: number
): {
    status: LiveDataStatus;
    fetchedAt: string | null;
    ageSeconds: number | null;
} {
    if (!isToday) {
        return {
            status: 'not-applicable',
            fetchedAt: null,
            ageSeconds: null,
        };
    }

    if (!liveBoard) {
        return {
            status: 'unavailable',
            fetchedAt: null,
            ageSeconds: null,
        };
    }

    const ageSeconds = getSnapshotAgeSeconds(liveBoard);
    return {
        status: ageSeconds <= maxAgeSeconds ? 'fresh' : 'stale',
        fetchedAt: liveBoard.fetched_at,
        ageSeconds,
    };
}

async function handleSchedule(
    request: Request,
    url: URL,
    env: Env,
    ctx: ExecutionContext,
    requestId: string
) {
    const origin = url.searchParams.get('origin');
    const dest = url.searchParams.get('dest');
    const date = url.searchParams.get('date');
    const forceLiveRefresh = url.searchParams.get('refreshLive') === '1';

    if (!origin || !dest) {
        return jsonError(
            'bad_request',
            'Choose both an origin and destination, then try again.',
            400,
            requestId
        );
    }

    if (!isValidStationId(origin) || !isValidStationId(dest)) {
        return jsonError(
            'bad_request',
            'One of the selected stations is invalid. Choose the stations again.',
            400,
            requestId
        );
    }

    const queryDate = normalizeScheduleDate(date);
    if (!queryDate) {
        return jsonError(
            'bad_request',
            'The selected date is invalid. Choose a date again.',
            400,
            requestId
        );
    }

    const isToday = queryDate === getTaipeiDate();
    const requestedAt = new Date();
    const livePolicy = getLiveBoardPolicy(requestedAt);
    const stations = await ensureStations(env);
    const scheduleStations = resolveScheduleStations(stations, origin, dest);
    if (!scheduleStations) {
        return jsonError(
            'bad_request',
            'One of the selected stations is invalid. Choose the stations again.',
            400,
            requestId
        );
    }

    const { originStation, destinationStation } = scheduleStations;

    waitUntilLogged(
        ctx,
        recordRouteInterest(env, origin, dest, requestedAt),
        'Route interest update'
    );

    const [routeResult, liveBoardSnapshot, routeFares] = await Promise.all([
        getCachedRouteTimetable(env, queryDate, origin, dest),
        isToday ? getLiveBoardSnapshot(env) : Promise.resolve(null),
        getRouteFares(env, origin, dest).catch((error) => {
            console.error('Failed to load route fares:', error);
            return [];
        }),
    ]);
    let liveBoard = liveBoardSnapshot;
    let liveData = getLiveDataStatus(
        isToday,
        liveBoard,
        livePolicy.maxAgeSeconds
    );

    if (routeResult.cacheStatus === 'warming') {
        waitUntilLogged(
            ctx,
            ensureRouteTimetable(env, queryDate, origin, dest),
            'Route timetable warmup'
        );
    }

    const shouldAttemptLiveRefresh =
        liveData.status === 'stale' || liveData.status === 'unavailable';
    if (forceLiveRefresh && isToday && shouldAttemptLiveRefresh) {
        try {
            await refreshLiveBoardForManual(
                env,
                requestedAt,
                await getManualLiveRefreshClientBucket(request)
            );
            liveBoard = await getLiveBoardSnapshot(env);
            liveData = getLiveDataStatus(
                isToday,
                liveBoard,
                livePolicy.maxAgeSeconds
            );
        } catch (error) {
            console.error('Manual live board refresh failed:', error);
        }
    } else if (shouldAttemptLiveRefresh) {
        waitUntilLogged(
            ctx,
            refreshLiveBoardForAuto(env, origin, dest, requestedAt),
            'Live board refresh'
        );
    }

    const delayMap =
        liveData.status === 'fresh' && liveBoard
            ? new Map(Object.entries(liveBoard.data.delays))
            : new Map<string, number>();
    const trains = routeResult.timetables
        .map((t) =>
            mapTrainToAppTrainInfo(t, origin, dest, delayMap, routeFares)
        )
        .filter((t): t is TrainInfo => t !== null)
        .sort((a, b) => a.departureTime.localeCompare(b.departureTime));
    const meta: ScheduleMeta = {
        scheduleCacheStatus: routeResult.cacheStatus,
        scheduleSnapshotFetchedAt: routeResult.snapshotFetchedAt,
        liveDataStatus: liveData.status,
        liveDataFetchedAt: liveData.fetchedAt,
        liveDataAgeSeconds: liveData.ageSeconds,
    };

    return json(
        {
            date: queryDate,
            origin: originStation,
            destination: destinationStation,
            trains,
            meta,
        },
        {
            status: routeResult.cacheStatus === 'warming' ? 202 : 200,
            headers: {
                'Cache-Control':
                    forceLiveRefresh || routeResult.cacheStatus === 'warming'
                        ? 'no-store'
                        : 'public, s-maxage=60, stale-while-revalidate=300',
            },
        }
    );
}

async function handleRefresh(request: Request, env: Env, requestId: string) {
    if (!env.REFRESH_SECRET) {
        return jsonError(
            'not_found',
            'This OnTrack endpoint is not available.',
            404,
            requestId
        );
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${env.REFRESH_SECRET}`) {
        return jsonError(
            'unauthorized',
            'This OnTrack request is not authorized.',
            401,
            requestId
        );
    }

    await Promise.all([
        refreshDailySnapshots(env),
        refreshLiveBoardForManual(env),
    ]);
    return json({ ok: true });
}

async function handleApi(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const requestId = getRequestId(request);

    try {
        if (url.pathname === '/api/stations') {
            return handleStations(env);
        }

        if (url.pathname === '/api/schedule') {
            return handleSchedule(request, url, env, ctx, requestId);
        }

        if (url.pathname === '/api/refresh') {
            return handleRefresh(request, env, requestId);
        }

        return jsonError(
            'not_found',
            'This OnTrack endpoint is not available.',
            404,
            requestId
        );
    } catch (error) {
        console.error(
            JSON.stringify({
                event: 'worker_api_error',
                requestId,
                path: url.pathname,
                errorName: error instanceof Error ? error.name : typeof error,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
            })
        );

        if (error instanceof TDXServiceError) {
            if (error.kind === 'capacity') {
                return jsonError(
                    'service_capacity',
                    'OnTrack railway data is temporarily at capacity. Please try again later.',
                    503,
                    requestId
                );
            }

            if (error.kind === 'upstream') {
                return jsonError(
                    'upstream_unavailable',
                    'Taiwan railway data is temporarily unavailable. OnTrack will work again when the data service recovers.',
                    503,
                    requestId
                );
            }
        }

        return jsonError(
            'service_unavailable',
            'OnTrack railway data is temporarily unavailable. Please try again later.',
            503,
            requestId
        );
    }
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname.startsWith('/api/')) {
            if (request.method === 'OPTIONS') {
                return handleCorsPreflight(request, env);
            }

            if (!isAllowedCorsRequest(request, env)) {
                return jsonError(
                    'forbidden',
                    'This OnTrack origin is not allowed.',
                    403,
                    getRequestId(request)
                );
            }

            return withCorsHeaders(
                await handleApi(request, env, ctx),
                request,
                env
            );
        }

        if (isUnknownDocumentPath(url)) {
            return assetNotFound(request);
        }

        const response = await env.ASSETS.fetch(request).catch(() => null);
        if (!response) {
            return assetNotFound(request);
        }

        const headers = new Headers(response.headers);
        Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
            headers.set(key, value);
        });

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    },

    async scheduled(controller, env, ctx) {
        if (controller.cron !== ACTIVE_SCHEDULE_CRON) {
            return;
        }

        const scheduledAt = new Date(controller.scheduledTime);
        const refreshes: Promise<unknown>[] = [];

        if (shouldRefreshLiveBoardForCron(scheduledAt)) {
            refreshes.push(refreshLiveBoardForCron(env));
        }

        if (shouldRefreshDailySnapshotsForCron(scheduledAt)) {
            refreshes.push(refreshDailySnapshots(env));
        }

        ctx.waitUntil(Promise.all(refreshes));
    },
} satisfies ExportedHandler<Env>;
