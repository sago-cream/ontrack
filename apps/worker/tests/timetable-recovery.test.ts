import { expect, spyOn, test } from 'bun:test';

import {
    ensureRouteTimetable,
    ensureTimetable,
    getCachedRouteTimetable,
    refreshTimetable,
    routeTimetableKey,
    timetableKey,
} from '../src/refresh';
import type { Env, TDXFullTimetable } from '../src/types';

const date = '2026-11-24';
const dailyKey = timetableKey(date);
const routeKey = routeTimetableKey(date, '1210', '1000');
const train: TDXFullTimetable = {
    TrainInfo: {
        TrainNo: '1234',
        TrainTypeName: { Zh_tw: '區間' },
        Direction: 0,
    },
    StopTimes: ['1210', '1000'].map((id) => ({
        StationID: id,
        StationName: { Zh_tw: id },
        DepartureTime: '10:00',
        ArrivalTime: '11:00',
    })),
};

function row(key: string, data: TDXFullTimetable[], fetchedAt: string) {
    return {
        key,
        data: JSON.stringify(data),
        last_modified: null,
        fetched_at: fetchedAt,
        storage_kind: 'inline',
        chunk_count: 0,
    };
}

function database(initialRows: ReturnType<typeof row>[]) {
    const rows = new Map(initialRows.map((value) => [value.key, value]));
    let writes = 0;
    const db = {
        prepare(query: string) {
            return {
                bind(...args: unknown[]) {
                    return {
                        query,
                        args,
                        async first() {
                            return rows.get(String(args[0])) ?? null;
                        },
                    };
                },
            };
        },
        async batch(statements: { query: string; args: unknown[] }[]) {
            for (const { query, args } of statements) {
                if (query.includes('insert into tdx_snapshots')) {
                    writes++;
                    rows.set(String(args[0]), {
                        ...row(String(args[0]), [], String(args[3])),
                        data: String(args[1]),
                    });
                }
            }
        },
    } as unknown as D1Database;
    return { env: { DB: db } as Env, rows, writes: () => writes };
}

for (const payload of [{ TrainTimetables: [] }, {}, { TrainTimetables: {} }]) {
    test(`rejects invalid national data without replacing a valid snapshot: ${JSON.stringify(payload)}`, async () => {
        const existing = row(dailyKey, [train], '2026-11-23T19:50:00.000Z');
        const db = database([existing]);
        const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(
            Response.json(payload)
        );
        try {
            await expect(refreshTimetable(db.env, date)).rejects.toMatchObject({
                name: 'TDXServiceError',
                kind: 'invalid-response',
            });
            expect(db.rows.get(dailyKey)).toEqual(existing);
            expect(db.writes()).toBe(0);
        } finally {
            fetch.mockRestore();
        }
    });
}

test('does not report a poisoned empty route and daily snapshot as ready', async () => {
    const db = database([
        row(dailyKey, [], '2026-11-23T19:50:00.000Z'),
        row(routeKey, [], '2026-11-24T11:00:00.000Z'),
    ]);
    expect(await getCachedRouteTimetable(db.env, date, '1210', '1000')).toEqual(
        {
            timetables: [],
            cacheStatus: 'warming',
            snapshotFetchedAt: null,
        }
    );
    expect(db.writes()).toBe(0);
});

test('refetches an empty national snapshot and repairs its empty route', async () => {
    const db = database([
        row(dailyKey, [], '2026-11-23T19:50:00.000Z'),
        row(routeKey, [], '2026-11-24T11:00:00.000Z'),
    ]);
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(
        Response.json({ TrainTimetables: [train] })
    );
    try {
        expect(
            await ensureRouteTimetable(db.env, date, '1210', '1000')
        ).toEqual([train]);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(
            (await getCachedRouteTimetable(db.env, date, '1210', '1000'))
                .timetables
        ).toEqual([train]);
        expect(JSON.parse(db.rows.get(dailyKey)!.data)).toEqual([train]);
    } finally {
        fetch.mockRestore();
    }
});

test('replaces an empty route when its daily source has recovered', async () => {
    const db = database([
        row(dailyKey, [train], '2026-11-24T11:10:00.000Z'),
        row(routeKey, [], '2026-11-24T11:00:00.000Z'),
    ]);
    expect(
        await getCachedRouteTimetable(db.env, date, '1210', '1000')
    ).toMatchObject({ timetables: [train], cacheStatus: 'derived' });
    expect(db.writes()).toBe(1);
});

test('keeps a genuinely empty route cached against a valid national source', async () => {
    const db = database([
        row(
            dailyKey,
            [{ ...train, StopTimes: [...train.StopTimes].reverse() }],
            '2026-11-24T10:00:00.000Z'
        ),
        row(routeKey, [], '2026-11-24T11:00:00.000Z'),
    ]);
    expect(
        await getCachedRouteTimetable(db.env, date, '1210', '1000')
    ).toMatchObject({ timetables: [], cacheStatus: 'hit' });
    expect(db.writes()).toBe(0);
});

test('continues serving a populated route if the national snapshot is empty', async () => {
    const db = database([
        row(dailyKey, [], '2026-11-24T11:00:00.000Z'),
        row(routeKey, [train], '2026-11-24T10:00:00.000Z'),
    ]);
    expect(
        await getCachedRouteTimetable(db.env, date, '1210', '1000')
    ).toMatchObject({ timetables: [train], cacheStatus: 'hit' });
});

test('reuses a populated national snapshot without an upstream call', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('Unexpected upstream call')
    );
    try {
        expect(
            await ensureTimetable(
                database([row(dailyKey, [train], '2026-11-24T10:00:00.000Z')])
                    .env,
                date
            )
        ).toEqual([train]);
        expect(fetch).not.toHaveBeenCalled();
    } finally {
        fetch.mockRestore();
    }
});
