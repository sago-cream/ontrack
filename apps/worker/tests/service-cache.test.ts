import { expect, test } from 'bun:test';

import { mapTrainToAppTrainInfo } from '../src/index';
import { filterRouteTimetables, getCachedRouteTimetable } from '../src/refresh';
import type { Env, TDXFullTimetable } from '../src/types';

const raw: TDXFullTimetable = {
    TrainInfo: {
        TrainNo: '125',
        TrainTypeName: { Zh_tw: '區間' },
        Direction: 0,
        SuspendedFlag: 2,
    },
    StopTimes: [
        {
            StationID: '1000',
            StationName: { Zh_tw: '臺北' },
            SuspendedFlag: 0,
            DepartureTime: '09:38',
            ArrivalTime: '09:37',
        },
        {
            StationID: '1020',
            StationName: { Zh_tw: '板橋' },
            SuspendedFlag: 1,
            DepartureTime: '09:50',
            ArrivalTime: '09:49',
        },
        {
            StationID: '1210',
            StationName: { Zh_tw: '新竹' },
            SuspendedFlag: 0,
            DepartureTime: '10:55',
            ArrivalTime: '10:54',
        },
    ],
};

test('route slicing preserves interior suspension context', () => {
    const [derived] = filterRouteTimetables([raw], '1000', '1210');
    expect(derived.StopTimes).toHaveLength(2);
    expect(
        mapTrainToAppTrainInfo(derived, '1000', '1210', new Map())
    ).toMatchObject({ suspension: 'partial', suspendedStations: ['板橋'] });
});

test('a newer daily source replaces a derived route and preserves its actual age', async () => {
    const dailyTime = '2026-11-15T01:40:00.000Z';
    const row = (key: string, data: unknown, time: string) => ({
        key,
        data: JSON.stringify(data),
        fetched_at: time,
        last_modified: null,
        storage_kind: 'inline',
        chunk_count: 0,
    });
    const rows = new Map([
        [
            'daily-timetable:2026-11-15',
            row('daily-timetable:2026-11-15', [raw], dailyTime),
        ],
        [
            'daily-timetable-od:2026-11-15:1000:1210',
            row(
                'daily-timetable-od:2026-11-15:1000:1210',
                [],
                '2026-11-15T00:00:00.000Z'
            ),
        ],
    ]);
    let dailyFullReads = 0;
    const db = {
        prepare(query: string) {
            return {
                bind(...args: unknown[]) {
                    return {
                        query,
                        args,
                        async first() {
                            if (
                                String(args[0]) ===
                                    'daily-timetable:2026-11-15' &&
                                query.includes('storage_kind')
                            )
                                dailyFullReads++;
                            return rows.get(String(args[0])) ?? null;
                        },
                    };
                },
            };
        },
        async batch(statements: { query: string; args: unknown[] }[]) {
            for (const { query, args } of statements)
                if (query.includes('insert into tdx_snapshots')) {
                    rows.set(String(args[0]), {
                        key: String(args[0]),
                        data: String(args[1]),
                        last_modified: null,
                        fetched_at: String(args[3]),
                        storage_kind: 'inline',
                        chunk_count: 0,
                    });
                }
        },
    };
    const result = await getCachedRouteTimetable(
        { DB: db } as unknown as Env,
        '2026-11-15',
        '1000',
        '1210'
    );
    expect(result.cacheStatus).toBe('derived');
    expect(result.snapshotFetchedAt).toBe(dailyTime);
    expect(result.timetables[0].SuspendedStationNames).toEqual(['板橋']);
    expect(
        rows.get('daily-timetable-od:2026-11-15:1000:1210')?.fetched_at
    ).toBe(dailyTime);
    const before = dailyFullReads;
    const cached = await getCachedRouteTimetable(
        { DB: db } as unknown as Env,
        '2026-11-15',
        '1000',
        '1210'
    );
    expect(cached.cacheStatus).toBe('hit');
    expect(dailyFullReads).toBe(before);
});
