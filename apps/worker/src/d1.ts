import { getTaipeiDate, getTaipeiHour } from './time';
import type { Env, Snapshot } from './types';

interface SnapshotRow {
    key: string;
    data: string;
    last_modified: string | null;
    fetched_at: string;
    storage_kind: 'inline' | 'chunked';
    chunk_count: number;
}

export interface RouteInterest {
    origin: string;
    dest: string;
    request_count: number;
    last_seen_at: string;
}

interface SnapshotChunkRow {
    data: string;
}

const INLINE_DATA_LIMIT = 200_000;

function toSnapshot<T>(row: SnapshotRow, data: T): Snapshot<T> {
    return {
        key: row.key,
        data,
        last_modified: row.last_modified,
        fetched_at: row.fetched_at,
    };
}

function splitIntoChunks(serialized: string) {
    const chunks: string[] = [];

    for (let start = 0; start < serialized.length; start += INLINE_DATA_LIMIT) {
        chunks.push(serialized.slice(start, start + INLINE_DATA_LIMIT));
    }

    return chunks;
}

export async function getSnapshot<T>(
    env: Env,
    key: string
): Promise<Snapshot<T> | null> {
    const row = await env.DB.prepare(
        `
            select key, data, last_modified, fetched_at, storage_kind, chunk_count
            from tdx_snapshots
            where key = ?
            limit 1
        `
    )
        .bind(key)
        .first<SnapshotRow>();

    if (!row) {
        return null;
    }

    if (row.storage_kind === 'chunked') {
        const { results } = await env.DB.prepare(
            `
                select data
                from tdx_snapshot_chunks
                where snapshot_key = ?
                order by chunk_index asc
            `
        )
            .bind(key)
            .all<SnapshotChunkRow>();
        const serialized = results.map((chunk) => chunk.data).join('');

        return toSnapshot(row, JSON.parse(serialized) as T);
    }

    return toSnapshot(row, JSON.parse(row.data) as T);
}

export async function getSnapshotFetchedAt(
    env: Env,
    key: string
): Promise<string | null> {
    const row = await env.DB.prepare(
        'select fetched_at from tdx_snapshots where key = ?'
    )
        .bind(key)
        .first<{ fetched_at: string }>();
    return row?.fetched_at ?? null;
}

export async function upsertSnapshot<T>(
    env: Env,
    key: string,
    data: T,
    lastModified: string | null,
    fetchedAt = new Date().toISOString()
) {
    const serialized = JSON.stringify(data);
    const baseStatement = env.DB.prepare(
        `
            insert into tdx_snapshots (
                key,
                data,
                last_modified,
                fetched_at,
                updated_at,
                storage_kind,
                chunk_count
            )
            values (?, ?, ?, ?, current_timestamp, ?, ?)
            on conflict(key) do update set
                data = excluded.data,
                last_modified = excluded.last_modified,
                fetched_at = excluded.fetched_at,
                updated_at = current_timestamp,
                storage_kind = excluded.storage_kind,
                chunk_count = excluded.chunk_count
        `
    );
    const deleteChunksStatement = env.DB.prepare(
        `
            delete from tdx_snapshot_chunks
            where snapshot_key = ?
        `
    );

    if (serialized.length <= INLINE_DATA_LIMIT) {
        await env.DB.batch([
            baseStatement.bind(
                key,
                serialized,
                lastModified,
                fetchedAt,
                'inline',
                0
            ),
            deleteChunksStatement.bind(key),
        ]);
        return;
    }

    const chunks = splitIntoChunks(serialized);
    await env.DB.batch([
        baseStatement.bind(
            key,
            'null',
            lastModified,
            fetchedAt,
            'chunked',
            chunks.length
        ),
        deleteChunksStatement.bind(key),
        ...chunks.map((chunk, index) =>
            env.DB.prepare(
                `
                    insert into tdx_snapshot_chunks (
                        snapshot_key,
                        chunk_index,
                        data
                    )
                    values (?, ?, ?)
                `
            ).bind(key, index, chunk)
        ),
    ]);
}

export async function pruneSnapshots(
    env: Env,
    routeCutoffDate: string,
    timetableCutoffDate: string
) {
    const obsoleteWhere = `
        (
            key like 'daily-timetable:%'
            and substr(key, 17, 10) < ?
        )
        or (
            key like 'daily-timetable-od:%'
            and substr(key, 20, 10) < ?
        )
    `;

    await env.DB.batch([
        env.DB.prepare(
            `
                delete from tdx_snapshot_chunks
            where snapshot_key in (
                select key
                from tdx_snapshots
                where ${obsoleteWhere}
            )
        `
        ).bind(timetableCutoffDate, routeCutoffDate),
        env.DB.prepare(
            `
                delete from tdx_snapshots
                where ${obsoleteWhere}
            `
        ).bind(timetableCutoffDate, routeCutoffDate),
    ]);
}

export async function recordRouteInterest(
    env: Env,
    origin: string,
    dest: string,
    date = new Date()
) {
    const routeKey = `${origin}:${dest}`;
    const taipeiHour = getTaipeiHour(date);
    const routeHourKey = `${routeKey}:${taipeiHour}`;
    const seenAt = new Date().toISOString();

    await env.DB.batch([
        env.DB.prepare(
            `
            insert into route_interest (
                route_key,
                origin,
                dest,
                request_count,
                last_seen_at,
                updated_at
            )
            values (?, ?, ?, 1, ?, current_timestamp)
            on conflict(route_key) do update set
                request_count = request_count + 1,
                last_seen_at = excluded.last_seen_at,
                updated_at = current_timestamp
        `
        ).bind(routeKey, origin, dest, seenAt),
        env.DB.prepare(
            `
            insert into route_time_interest (
                route_hour_key,
                origin,
                dest,
                taipei_hour,
                request_count,
                last_seen_at,
                updated_at
            )
            values (?, ?, ?, ?, 1, ?, current_timestamp)
            on conflict(route_hour_key) do update set
                request_count = request_count + 1,
                last_seen_at = excluded.last_seen_at,
                updated_at = current_timestamp
        `
        ).bind(routeHourKey, origin, dest, taipeiHour, seenAt),
    ]);
}

export async function getTopRouteInterests(env: Env, limit: number) {
    const { results } = await env.DB.prepare(
        `
            select origin, dest, request_count, last_seen_at
            from route_interest
            order by request_count desc, last_seen_at desc
            limit ?
        `
    )
        .bind(limit)
        .all<RouteInterest>();

    return results;
}

export async function hasRecentRouteTimeInterest(
    env: Env,
    taipeiHour: number,
    sinceIso: string
) {
    const row = await env.DB.prepare(
        `
            select 1
            from route_time_interest
            where taipei_hour = ?
                and last_seen_at >= ?
            limit 1
        `
    )
        .bind(taipeiHour, sinceIso)
        .first();

    return Boolean(row);
}

export async function hasAnyRecentRouteTimeInterest(
    env: Env,
    sinceIso: string
) {
    const row = await env.DB.prepare(
        `
            select 1
            from route_time_interest
            where last_seen_at >= ?
            limit 1
        `
    )
        .bind(sinceIso)
        .first();

    return Boolean(row);
}

export async function hasRecentRelatedRouteTimeInterest(
    env: Env,
    origin: string,
    dest: string,
    taipeiHour: number,
    sinceIso: string
) {
    const row = await env.DB.prepare(
        `
            select 1
            from route_time_interest
            where taipei_hour = ?
                and last_seen_at >= ?
                and (origin = ? or dest = ?)
            limit 1
        `
    )
        .bind(taipeiHour, sinceIso, origin, dest)
        .first();

    return Boolean(row);
}

export async function reserveLiveRefreshCall(
    env: Env,
    bucket: string,
    limit: number,
    date = new Date()
) {
    if (limit <= 0) {
        return false;
    }

    const taipeiDate = getTaipeiDate(date);
    const budgetKey = `live-board:${bucket}:${taipeiDate}`;
    const result = await env.DB.prepare(
        `
            insert into tdx_call_budget (
                budget_key,
                taipei_date,
                bucket,
                request_count,
                updated_at
            )
            values (?, ?, ?, 1, current_timestamp)
            on conflict(budget_key) do update set
                request_count = request_count + 1,
                updated_at = current_timestamp
            where request_count < ?
        `
    )
        .bind(budgetKey, taipeiDate, bucket, limit)
        .run();

    return result.meta.changes > 0;
}
