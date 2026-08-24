import { describe, expect, test } from 'bun:test';

import type { TrainInfo } from '../types';
import { buildDisplayState } from './TrainList';

function train(
    trainNo: string,
    departureTime: string,
    arrivalTime: string
): TrainInfo {
    return {
        trainNo,
        trainType: '區間',
        direction: 0,
        originStation: '臺北',
        destinationStation: '臺中',
        departureTime,
        arrivalTime,
        status: 'on-time',
    };
}

describe('train list display order', () => {
    test('orders and selects trains by arrival time in arrival mode', () => {
        const trains = [
            train('101', '09:00', '11:00'),
            train('102', '09:10', '10:30'),
            train('103', '09:20', '10:45'),
            train('104', '09:30', '11:15'),
        ];

        const result = buildDisplayState(trains, '10:40', 'arrival');

        expect(result.displayTrains.map(({ trainNo }) => trainNo)).toEqual([
            '102',
            '103',
            '101',
        ]);
        expect(result.recommendedTrain?.trainNo).toBe('103');
    });
});
