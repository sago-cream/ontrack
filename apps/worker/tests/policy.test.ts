import { describe, expect, test } from 'bun:test';

import {
    getManualLiveRefreshClientBucket,
    normalizeScheduleDate,
    resolveScheduleStations,
    shouldRefreshLiveBoardForManual,
} from '../src/policy';
import type { Station } from '../src/types';

const NOW = new Date('2026-07-04T04:00:00.000Z');

describe('normalizeScheduleDate', () => {
    test('defaults to the current Taipei date', () => {
        expect(normalizeScheduleDate(null, NOW)).toBe('2026-07-04');
    });

    test('accepts dates inside the supported seven-day window', () => {
        expect(normalizeScheduleDate('2026-07-04', NOW)).toBe('2026-07-04');
        expect(normalizeScheduleDate('2026-07-11', NOW)).toBe('2026-07-11');
    });

    test('rejects past and out-of-window dates', () => {
        expect(normalizeScheduleDate('2026-07-03', NOW)).toBeNull();
        expect(normalizeScheduleDate('2026-07-12', NOW)).toBeNull();
    });

    test('rejects impossible and malformed dates', () => {
        expect(normalizeScheduleDate('2026-02-31', NOW)).toBeNull();
        expect(normalizeScheduleDate('not-a-date', NOW)).toBeNull();
        expect(normalizeScheduleDate('2026-7-4', NOW)).toBeNull();
    });
});

const STATIONS: Station[] = [
    { id: '1000', name: '臺北', nameEn: 'Taipei' },
    { id: '1020', name: '板橋', nameEn: 'Banqiao' },
];

describe('resolveScheduleStations', () => {
    test('returns catalog stations for known IDs', () => {
        expect(resolveScheduleStations(STATIONS, '1000', '1020')).toEqual({
            originStation: STATIONS[0],
            destinationStation: STATIONS[1],
        });
    });

    test('rejects unknown origin or destination IDs', () => {
        expect(resolveScheduleStations(STATIONS, 'FAKE-1', '1020')).toBeNull();
        expect(resolveScheduleStations(STATIONS, '1000', 'FAKE-2')).toBeNull();
    });
});

describe('shouldRefreshLiveBoardForManual', () => {
    test('keeps live data cached through the five-minute boundary', () => {
        expect(shouldRefreshLiveBoardForManual(true, 0)).toBeFalse();
        expect(shouldRefreshLiveBoardForManual(true, 300)).toBeFalse();
    });

    test('refreshes live data older than five minutes', () => {
        expect(shouldRefreshLiveBoardForManual(true, 301)).toBeTrue();
        expect(shouldRefreshLiveBoardForManual(true, null)).toBeTrue();
    });

    test('never refreshes live data for another date', () => {
        expect(shouldRefreshLiveBoardForManual(false, null)).toBeFalse();
        expect(shouldRefreshLiveBoardForManual(false, 301)).toBeFalse();
    });
});

describe('getManualLiveRefreshClientBucket', () => {
    test('returns a stable hashed bucket for the same caller', async () => {
        const request = new Request('https://ontrack.test/api/schedule', {
            headers: {
                'cf-connecting-ip': '203.0.113.10',
                'user-agent': 'OnTrack Test',
            },
        });

        await expect(
            getManualLiveRefreshClientBucket(request)
        ).resolves.toMatch(/^manual-client:[a-f0-9]{32}$/);
        await expect(getManualLiveRefreshClientBucket(request)).resolves.toBe(
            await getManualLiveRefreshClientBucket(request)
        );
    });

    test('uses caller headers to partition buckets', async () => {
        const first = new Request('https://ontrack.test/api/schedule', {
            headers: {
                'cf-connecting-ip': '203.0.113.10',
                'user-agent': 'OnTrack Test',
            },
        });
        const second = new Request('https://ontrack.test/api/schedule', {
            headers: {
                'cf-connecting-ip': '203.0.113.11',
                'user-agent': 'OnTrack Test',
            },
        });

        expect(await getManualLiveRefreshClientBucket(first)).not.toBe(
            await getManualLiveRefreshClientBucket(second)
        );
    });

    test('falls back to the first forwarded address', async () => {
        const request = new Request('https://ontrack.test/api/schedule', {
            headers: {
                'x-forwarded-for': '203.0.113.10, 198.51.100.20',
                'user-agent': 'OnTrack Test',
            },
        });
        const equivalent = new Request('https://ontrack.test/api/schedule', {
            headers: {
                'cf-connecting-ip': '203.0.113.10',
                'user-agent': 'OnTrack Test',
            },
        });

        expect(await getManualLiveRefreshClientBucket(request)).toBe(
            await getManualLiveRefreshClientBucket(equivalent)
        );
    });
});
