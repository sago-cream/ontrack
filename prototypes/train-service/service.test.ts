import { describe, expect, test } from 'bun:test';

import { fixture, now, route } from './fixtures';
import { assessService, relevantAlerts, type Alert } from './service';

function assess(scenario: Parameters<typeof fixture>[0], index = 0) {
    const data = fixture(scenario);
    return assessService(data.trains[index], '1000', '1210', data.snapshot);
}

describe('journey service eligibility', () => {
    test('full cancellation excludes a train even when live delay reports movement', () => {
        expect(assess('cancelled')).toMatchObject({
            kind: 'cancelled',
            cause: 'full',
            recommend: false,
        });
    });
    test('a suspended destination prevents this journey on a partial train', () => {
        expect(assess('endpoint')).toMatchObject({
            kind: 'cancelled',
            cause: 'endpoint',
            recommend: false,
        });
    });
    test('a suspended origin prevents boarding', () => {
        const data = fixture('restored');
        data.trains[0].StopTimes[0].SuspendedFlag = 1;
        expect(
            assessService(data.trains[0], '1000', '1210', data.snapshot).cause
        ).toBe('endpoint');
    });
    test('a partial flag alone does not exclude a journey with open endpoints', () => {
        expect(assess('partial')).toMatchObject({
            kind: 'partial',
            recommend: true,
            flaggedStations: ['板橋'],
        });
    });
    test('a partial train with no stop flags is unresolved', () => {
        const data = fixture('partial');
        data.trains[0].StopTimes.forEach((stop) => {
            stop.SuspendedFlag = 0;
        });
        expect(
            assessService(data.trains[0], '1000', '1210', data.snapshot).kind
        ).toBe('partial');
    });
    test('missing flags are unknown rather than normal or cancelled', () => {
        expect(assess('unavailable')).toMatchObject({
            kind: 'unknown',
            recommend: true,
        });
    });
    test('stale cancellation is labelled for rechecking', () => {
        expect(assess('stale')).toMatchObject({
            kind: 'unknown',
            cause: 'stale',
            recommend: true,
        });
    });
    test('fresh explicit normal service is eligible without any live-board record', () => {
        expect(assess('restored')).toMatchObject({
            kind: 'normal',
            recommend: true,
        });
    });
    test('another train remains eligible when one is cancelled', () => {
        expect(assess('cancelled', 1).recommend).toBe(true);
    });
    test('all-cancelled produces no eligible train', () => {
        expect([0, 1, 2].some((index) => assess('all', index).recommend)).toBe(
            false
        );
    });
    test('fresh restore replaces the earlier cancellation', () => {
        expect(assess('cancelled').recommend).toBe(false);
        expect(assess('restored').recommend).toBe(true);
    });
    test('unknown future enum values are not normal', () => {
        const data = fixture('restored');
        data.trains[0].TrainInfo.SuspendedFlag = 99;
        expect(
            assessService(data.trains[0], '1000', '1210', data.snapshot).kind
        ).toBe('unknown');
    });
    test('the service date must match, and snapshots cannot come from the future', () => {
        const data = fixture('restored');
        expect(
            assessService(data.trains[0], '1000', '1210', {
                ...data.snapshot,
                requestedDate: '2026-11-16',
            }).recommend
        ).toBe(false);
        expect(
            assessService(data.trains[0], '1000', '1210', {
                ...data.snapshot,
                now: now - 120_000,
            }).recommend
        ).toBe(false);
    });
    test('missing or reverse route stops cannot be recommended', () => {
        const data = fixture('restored');
        expect(
            assessService(data.trains[0], '1000', 'missing', data.snapshot)
                .recommend
        ).toBe(false);
        expect(
            assessService(data.trains[0], '1210', '1000', data.snapshot)
                .recommend
        ).toBe(false);
    });
});

describe('candidate route advisories', () => {
    const notice: Alert = fixture('notice').alerts[0];
    test('structured route scope matches without promoting abnormal to cancellation', () => {
        expect(relevantAlerts([notice], route, now)).toHaveLength(1);
        expect(assess('notice').kind).toBe('normal');
    });
    test('train and interior-station scopes match independently', () => {
        expect(
            relevantAlerts(
                [{ ...notice, Scope: { Trains: [{ TrainNo: '125' }] } }],
                route,
                now
            )
        ).toHaveLength(1);
        expect(
            relevantAlerts(
                [{ ...notice, Scope: { Stations: [{ StationID: '1020' }] } }],
                route,
                now
            )
        ).toHaveLength(1);
    });
    test('a same-line section is a candidate advisory, not proof of journey cancellation', () => {
        expect(
            relevantAlerts(
                [
                    {
                        ...notice,
                        Scope: { LineSections: [{ LineID: 'demo-west-line' }] },
                    },
                ],
                route,
                now
            )
        ).toHaveLength(1);
    });
    test('normal, expired, future, malformed and unrelated alerts are excluded', () => {
        for (const invalid of [
            { Status: 1 },
            { EndTime: '2026-11-15T09:41:00+08:00' },
            { StartTime: '2026-11-16T09:40:00+08:00' },
            { StartTime: 'invalid' },
            { Scope: { Routes: [{ RouteID: 'different-route' }] } },
        ])
            expect(
                relevantAlerts([{ ...notice, ...invalid }], route, now)
            ).toHaveLength(0);
    });
    test('a text mention without structured scope cannot target a train', () => {
        expect(
            relevantAlerts(
                [
                    {
                        ...notice,
                        Scope: undefined,
                        Description: '125 停駛，但已恢復',
                    },
                ],
                route,
                now
            )
        ).toHaveLength(0);
    });
});
