import {
    nativeStorySchedule,
    nativeStoryStations,
    storySchedule,
    storyStations,
} from '../fixtures/storyFixtures';
import type { TranslationKey } from '../i18n/translations';
import type { TranslationParams } from '../i18n/types';
import { usesNativeUI } from '../native/platform';
import type { ScheduleResponse, Station } from '../types';

// In-flight request cache to prevent duplicate simultaneous requests
const inflightRequests = new Map<string, Promise<unknown>>();

const API_ORIGIN = process.env.NEXT_PUBLIC_ONTRACK_API_ORIGIN?.replace(
    /\/$/,
    ''
);

function apiUrl(path: string) {
    return API_ORIGIN ? `${API_ORIGIN}${path}` : path;
}

// Client-side cache for stations (rarely change, cache for 24 hours)
let stationsCache: { data: Station[]; expires: number } | null = null;
const STATIONS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface APIServerError {
    code: string;
    message: string;
    requestId?: string;
}

interface APIErrorBody {
    error?: APIServerError;
}

export class OnTrackAPIError extends Error {
    constructor(
        public readonly statusCode: number | null,
        public readonly serverError: APIServerError | null,
        message: string
    ) {
        super(message);
        this.name = 'OnTrackAPIError';
    }
}

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

export function isShowcaseMode() {
    return (
        (process.env.NODE_ENV !== 'production' ||
            process.env.NEXT_PUBLIC_ONTRACK_SHOWCASE_MODE === '1') &&
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('showcase')
    );
}

async function fetchJson<T>(url: string, retryCount = 0): Promise<T> {
    // Check if there's already an in-flight request for this URL
    const cacheKey = `${url}-${retryCount}`;
    if (inflightRequests.has(cacheKey)) {
        console.log('Reusing in-flight request for:', url);
        return inflightRequests.get(cacheKey) as Promise<T>;
    }

    // Create new request and cache it
    const requestPromise = (async () => {
        try {
            let response: Response;
            try {
                response = await fetch(url);
            } catch {
                throw new OnTrackAPIError(null, null, 'Network unavailable');
            }

            // Handle 429 Too Many Requests with exponential backoff
            if (response.status === 429 && retryCount < 3) {
                const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
                console.warn(
                    `Rate limited (429). Retrying in ${delay}ms (attempt ${retryCount + 1}/3)`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                // Clear cache before retry
                inflightRequests.delete(cacheKey);
                return fetchJson<T>(url, retryCount + 1);
            }

            if (!response.ok) {
                const errorBody = await readAPIErrorBody(response);
                throw new OnTrackAPIError(
                    response.status,
                    errorBody?.error ?? null,
                    `API Error ${response.status}`
                );
            }

            return response.json();
        } finally {
            // Clean up cache after request completes (success or failure)
            inflightRequests.delete(cacheKey);
        }
    })();

    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
}

async function readAPIErrorBody(
    response: Response
): Promise<APIErrorBody | null> {
    try {
        const body = (await response.json()) as unknown;

        if (
            typeof body !== 'object' ||
            body === null ||
            !('error' in body) ||
            typeof body.error !== 'object' ||
            body.error === null
        ) {
            return null;
        }

        const error = body.error as Record<string, unknown>;
        if (
            typeof error.code !== 'string' ||
            typeof error.message !== 'string'
        ) {
            return null;
        }

        return {
            error: {
                code: error.code,
                message: error.message,
                ...(typeof error.requestId === 'string'
                    ? { requestId: error.requestId }
                    : {}),
            },
        };
    } catch {
        return null;
    }
}

export function getUserSafeErrorMessage(
    error: unknown,
    t: Translate,
    fallbackKey: TranslationKey
) {
    if (!(error instanceof OnTrackAPIError)) {
        return t(fallbackKey);
    }

    const serverError = error.serverError;
    const message = serverError
        ? getServerErrorMessage(serverError, t)
        : getStatusErrorMessage(error.statusCode, t);

    if (!serverError?.requestId) {
        return message;
    }

    return `${message}\n${t('error.supportCode', {
        requestId: serverError.requestId,
    })}`;
}

function getServerErrorMessage(serverError: APIServerError, t: Translate) {
    switch (serverError.code) {
        case 'bad_request':
            return t('error.apiInvalidRequest');
        case 'service_capacity':
            return t('error.apiServiceUnavailable');
        case 'upstream_unavailable':
            return t('error.apiUpstreamUnavailable');
        case 'service_unavailable':
        case 'internal_error':
            return t('error.apiSystemDown');
        default:
            return serverError.message;
    }
}

function getStatusErrorMessage(statusCode: number | null, t: Translate) {
    if (statusCode === 429 || statusCode === 503) {
        return t('error.apiServiceUnavailable');
    }

    if (statusCode !== null && statusCode >= 500) {
        return t('error.apiSystemDown');
    }

    if (statusCode !== null) {
        return t('error.apiRequestFailed', { statusCode });
    }

    return t('error.apiNetworkUnavailable');
}

export const api = {
    getStations: async (): Promise<Station[]> => {
        if (isShowcaseMode()) {
            return usesNativeUI() ? nativeStoryStations : storyStations;
        }

        const now = Date.now();

        // Return cached data if still valid
        if (stationsCache && stationsCache.expires > now) {
            return stationsCache.data;
        }

        // Fetch fresh data
        const data = await fetchJson<Station[]>(apiUrl('/api/stations'));

        stationsCache = { data, expires: Date.now() + STATIONS_CACHE_TTL };
        return data;
    },

    getSchedule: async (
        origin: string,
        dest: string,
        date?: string,
        options: { refreshLive?: boolean } = {}
    ) => {
        if (isShowcaseMode()) {
            return usesNativeUI() ? nativeStorySchedule : storySchedule;
        }

        const params = new URLSearchParams({ origin, dest });
        if (date) params.append('date', date);
        if (options.refreshLive) params.append('refreshLive', '1');

        return fetchJson<ScheduleResponse>(
            apiUrl(`/api/schedule?${params.toString()}`)
        );
    },
};
