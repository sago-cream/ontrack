import { describe, expect, test } from 'bun:test';

import worker from '../src/index';
import type { Env, Station } from '../src/types';

const CATALOG_STATIONS: Station[] = [
    { id: '1000', name: '臺北', nameEn: 'Taipei' },
    { id: '1020', name: '板橋', nameEn: 'Banqiao' },
];

interface D1TouchState {
    batchCalls: number;
    execCalls: number;
    prepareCalls: number;
    preparedQueries: string[];
}

function createContext() {
    const waitUntilCalls: Promise<unknown>[] = [];
    const ctx: ExecutionContext = {
        waitUntil(promise: Promise<unknown>) {
            waitUntilCalls.push(promise);
        },
        passThroughOnException() {},
        props: undefined,
    };

    return { ctx, waitUntilCalls };
}

function createAssets(): Fetcher {
    return {
        fetch: async () => new Response(null, { status: 404 }),
    } as unknown as Fetcher;
}

function createLegalPageAssets(): Fetcher {
    return {
        fetch: async () =>
            new Response('<h1>Legal Notices</h1>', {
                headers: { 'Content-Type': 'text/html' },
            }),
    } as unknown as Fetcher;
}

function createScheduleRequest(query: string) {
    return new Request(`https://ontrack.test/api/schedule?${query}`);
}

function createThrowingDatabase() {
    const state: D1TouchState = {
        batchCalls: 0,
        execCalls: 0,
        prepareCalls: 0,
        preparedQueries: [],
    };
    const db = {
        prepare(query: string) {
            state.prepareCalls += 1;
            state.preparedQueries.push(query);
            throw new Error('D1 should not be touched');
        },
        batch() {
            state.batchCalls += 1;
            throw new Error('D1 batch should not be touched');
        },
        exec() {
            state.execCalls += 1;
            throw new Error('D1 exec should not be touched');
        },
    } as unknown as D1Database;

    return { db, state };
}

function createStationSnapshotRow() {
    return {
        key: 'stations',
        data: JSON.stringify(CATALOG_STATIONS),
        last_modified: null,
        fetched_at: '2026-07-04T00:00:00.000Z',
        storage_kind: 'inline',
        chunk_count: 0,
    };
}

function createStatement(
    query: string,
    state: D1TouchState
): D1PreparedStatement {
    let boundValues: unknown[] = [];
    const statement = {
        bind(...values: unknown[]) {
            boundValues = values;
            return statement;
        },
        async first<T = Record<string, unknown>>(): Promise<T | null> {
            if (
                query.includes('from tdx_snapshots') &&
                boundValues[0] === 'stations'
            ) {
                return createStationSnapshotRow() as T;
            }

            throw new Error('Unexpected D1 read');
        },
        async all() {
            throw new Error('Unexpected D1 all call');
        },
        async run() {
            state.batchCalls += 1;
            throw new Error('Unexpected D1 write');
        },
        async raw() {
            throw new Error('Unexpected D1 raw call');
        },
    };

    return statement as unknown as D1PreparedStatement;
}

function createStationSnapshotDatabase() {
    const state: D1TouchState = {
        batchCalls: 0,
        execCalls: 0,
        prepareCalls: 0,
        preparedQueries: [],
    };
    const db = {
        prepare(query: string) {
            state.prepareCalls += 1;
            state.preparedQueries.push(query);
            return createStatement(query, state);
        },
        batch() {
            state.batchCalls += 1;
            throw new Error('Unexpected D1 batch write');
        },
        exec() {
            state.execCalls += 1;
            throw new Error('Unexpected D1 exec call');
        },
    } as unknown as D1Database;

    return { db, state };
}

function createEnv(db: D1Database): Env {
    return {
        ASSETS: createAssets(),
        DB: db,
    };
}

describe('public document routes', () => {
    test('serves the legal notice through static assets', async () => {
        const { db } = createThrowingDatabase();
        const env = {
            ...createEnv(db),
            ASSETS: createLegalPageAssets(),
        };
        const { ctx } = createContext();

        const response = await worker.fetch(
            new Request('https://ontrack.test/docs/legal'),
            env,
            ctx
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toContain('Legal Notices');
    });
});

describe('schedule API policy', () => {
    test('rejects impossible dates before touching D1 or background work', async () => {
        const { ctx, waitUntilCalls } = createContext();
        const { db, state } = createThrowingDatabase();
        const response = await worker.fetch(
            createScheduleRequest('origin=1000&dest=1020&date=2026-02-31'),
            createEnv(db),
            ctx
        );

        expect(response.status).toBe(400);
        expect(state.prepareCalls).toBe(0);
        expect(state.batchCalls).toBe(0);
        expect(state.execCalls).toBe(0);
        expect(waitUntilCalls).toHaveLength(0);
    });

    test('rejects malformed station IDs before touching D1 or background work', async () => {
        const { ctx, waitUntilCalls } = createContext();
        const { db, state } = createThrowingDatabase();
        const response = await worker.fetch(
            createScheduleRequest('origin=../1000&dest=1020'),
            createEnv(db),
            ctx
        );

        expect(response.status).toBe(400);
        expect(state.prepareCalls).toBe(0);
        expect(state.batchCalls).toBe(0);
        expect(state.execCalls).toBe(0);
        expect(waitUntilCalls).toHaveLength(0);
    });

    test('rejects unknown station IDs before route writes or background work', async () => {
        const { ctx, waitUntilCalls } = createContext();
        const { db, state } = createStationSnapshotDatabase();
        const response = await worker.fetch(
            createScheduleRequest('origin=FAKE-1&dest=1020'),
            createEnv(db),
            ctx
        );

        expect(response.status).toBe(400);
        expect(state.prepareCalls).toBe(1);
        expect(state.batchCalls).toBe(0);
        expect(state.execCalls).toBe(0);
        expect(waitUntilCalls).toHaveLength(0);
    });
});
