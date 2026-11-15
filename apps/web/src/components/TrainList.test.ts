import { describe, expect, test } from 'bun:test';

import type { TrainInfo } from '../types';
import { buildDisplayState } from './TrainList';

function train(
    trainNo: string,
    departureTime: string,
    arrivalTime: string,
    delay = 0
): TrainInfo {
    return {
        trainNo,
        trainType: '區間',
        direction: 0,
        originStation: '臺北',
        destinationStation: '臺中',
        departureTime,
        arrivalTime,
        delay,
        status: delay > 0 ? 'delayed' : 'on-time',
    };
}

describe('train list display selection', () => {
    test('shows only the next three trains by effective departure time', () => {
        const trains = [
            train('101', '09:20', '10:20', 70),
            train('102', '09:30', '10:30', 50),
            train('103', '09:40', '10:40', 30),
            train('104', '10:00', '11:00'),
            train('105', '10:10', '11:10'),
            train('106', '10:20', '11:20'),
        ];

        const result = buildDisplayState(trains, '10:00', 'departure');

        expect(result.displayTrains.map(({ trainNo }) => trainNo)).toEqual([
            '104',
            '103',
            '105',
        ]);
        expect(result.recommendedTrain?.trainNo).toBe('104');
    });

    test('selects the latest train that arrives by the requested time', () => {
        const trains = [
            train('101', '09:00', '11:00'),
            train('102', '09:10', '10:30'),
            train('103', '09:20', '10:45'),
            train('104', '09:30', '11:15'),
        ];

        const result = buildDisplayState(trains, '10:40', 'arrival');

        expect(result.displayTrains.map(({ trainNo }) => trainNo)).toEqual([
            '102',
        ]);
        expect(result.recommendedTrain?.trainNo).toBe('102');
    });

    test('shows the latest three trains that arrive by the requested time', () => {
        const trains = [
            train('104', '09:30', '10:30'),
            train('101', '09:00', '10:00'),
            train('103', '09:20', '10:20'),
            train('102', '09:10', '10:10'),
        ];

        const result = buildDisplayState(trains, '10:30', 'arrival');

        expect(result.displayTrains.map(({ trainNo }) => trainNo)).toEqual([
            '102',
            '103',
            '104',
        ]);
        expect(result.recommendedTrain?.trainNo).toBe('104');
    });

    test('falls back to the earliest train when none arrive by the requested time', () => {
        const trains = [
            train('101', '09:00', '11:00'),
            train('102', '09:10', '10:30'),
            train('103', '09:20', '10:45'),
        ];

        const result = buildDisplayState(trains, '10:00', 'arrival');

        expect(result.displayTrains.map(({ trainNo }) => trainNo)).toEqual([
            '102',
            '103',
            '101',
        ]);
        expect(result.recommendedTrain?.trainNo).toBe('102');
    });

    test('keeps the last three trains when none remain catchable', () => {
        const trains = [
            train('101', '20:00', '21:00'),
            train('102', '21:00', '22:00'),
            train('103', '22:00', '23:00'),
            train('104', '23:00', '23:50'),
        ];

        const result = buildDisplayState(trains, '23:59', 'lastTrain');

        expect(result.displayTrains.map(({ trainNo }) => trainNo)).toEqual([
            '102',
            '103',
            '104',
        ]);
        expect(result.recommendedTrain?.trainNo).toBe('104');
    });
});

describe('suspended train selection', () => {
    const cancelled = {
        ...train('125', '09:38', '10:54', 4),
        status: 'cancelled' as const,
        suspension: 'full' as const,
    };
    const running = train('126', '09:54', '11:10');
    test('retains the recently cancelled row while recommending a different train', () => {
        const state = buildDisplayState(
            [cancelled, running],
            '09:41',
            'departure'
        );
        expect(state.displayTrains.map((train) => train.trainNo)).toEqual([
            '125',
            '126',
        ]);
        expect(state.recommendedTrain?.trainNo).toBe('126');
    });
    test('all cancelled clears recommendation in every time mode', () => {
        for (const mode of ['departure', 'arrival', 'lastTrain'] as const)
            expect(
                buildDisplayState([cancelled], '09:41', mode).recommendedTrain
            ).toBeNull();
    });
    test('an available fourth train is not hidden behind three cancelled rows', () => {
        const rows = [
            cancelled,
            { ...cancelled, trainNo: '124', departureTime: '09:40' },
            { ...cancelled, trainNo: '123', departureTime: '09:42' },
            running,
        ];
        const state = buildDisplayState(rows, '09:41', 'departure');
        expect(state.recommendedTrain?.trainNo).toBe('126');
        expect(state.displayTrains).toHaveLength(3);
        expect(state.displayTrains).toContain(running);
    });
    test('partial and unknown service are inspectable but not recommended', () => {
        for (const suspension of ['partial', 'unknown'] as const) {
            const state = buildDisplayState(
                [{ ...cancelled, status: 'unknown', suspension }, running],
                '09:41',
                'departure'
            );
            expect(state.recommendedTrain?.trainNo).toBe('126');
        }
    });
    test('restoring a cancelled train makes it eligible again', () => {
        expect(
            buildDisplayState(
                [
                    { ...cancelled, status: 'delayed', suspension: null },
                    running,
                ],
                '09:41',
                'departure'
            ).recommendedTrain?.trainNo
        ).toBe('125');
    });
});
