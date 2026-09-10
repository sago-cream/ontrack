import { getTaipeiDate } from './time';
import type { Station } from './types';

export const SCHEDULE_FUTURE_DAY_LIMIT = 7;
export const MANUAL_LIVE_REFRESH_CLIENT_DAILY_LIMIT = 3;
export const MANUAL_LIVE_REFRESH_MAX_AGE_SECONDS = 5 * 60;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function addUtcDays(date: Date, days: number) {
    const nextDate = new Date(date);
    nextDate.setUTCDate(nextDate.getUTCDate() + days);
    return nextDate;
}

function dateStringToUtcDate(date: string) {
    const match = DATE_PATTERN.exec(date);
    if (!match) {
        return null;
    }

    const [, year, month, day] = match;
    const parsedDate = new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day))
    );

    return parsedDate.toISOString().slice(0, 10) === date ? parsedDate : null;
}

export function normalizeScheduleDate(
    date: string | null,
    now = new Date()
): string | null {
    if (!date) {
        return getTaipeiDate(now);
    }

    const parsedDate = dateStringToUtcDate(date);
    if (!parsedDate) {
        return null;
    }

    const today = getTaipeiDate(now);
    const maxDate = addUtcDays(
        dateStringToUtcDate(today) ?? new Date(),
        SCHEDULE_FUTURE_DAY_LIMIT
    )
        .toISOString()
        .slice(0, 10);

    return date >= today && date <= maxDate ? date : null;
}

export function resolveScheduleStations(
    stations: Station[],
    origin: string,
    dest: string
) {
    const stationMap = new Map(
        stations.map((station) => [station.id, station])
    );
    const originStation = stationMap.get(origin);
    const destinationStation = stationMap.get(dest);

    return originStation && destinationStation
        ? { originStation, destinationStation }
        : null;
}

export function shouldRefreshLiveBoardForManual(
    isToday: boolean,
    liveDataAgeSeconds: number | null
) {
    return (
        isToday &&
        (liveDataAgeSeconds === null ||
            liveDataAgeSeconds > MANUAL_LIVE_REFRESH_MAX_AGE_SECONDS)
    );
}

function toHex(buffer: ArrayBuffer) {
    return [...new Uint8Array(buffer)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function getClientAddress(request: Request) {
    const connectingIp = request.headers.get('cf-connecting-ip');
    if (connectingIp) {
        return connectingIp;
    }

    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0]?.trim() || 'unknown';
    }

    return request.headers.get('true-client-ip') ?? 'unknown';
}

export async function getManualLiveRefreshClientBucket(request: Request) {
    const identity = JSON.stringify({
        ip: getClientAddress(request),
        userAgent:
            request.headers.get('user-agent')?.slice(0, 200) ?? 'unknown',
    });
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(identity)
    );

    return `manual-client:${toHex(digest).slice(0, 32)}`;
}
