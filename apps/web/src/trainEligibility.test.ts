import { describe, expect, test } from 'bun:test';

import { canBoardTrain, supportsElectronicTicket } from './trainEligibility';
import type { TrainInfo } from './types';

function train(trainType: string): TrainInfo {
    return {
        trainNo: '123',
        trainType,
        direction: 0,
        originStation: '臺北',
        destinationStation: '臺中',
        departureTime: '09:00',
        arrivalTime: '11:00',
        status: 'on-time',
    };
}

describe('electronic ticket train eligibility', () => {
    test.each(['區間', '區間快', '莒光', '自強'])(
        'allows %s trains',
        (trainType) => {
            expect(supportsElectronicTicket(train(trainType))).toBe(true);
        }
    );

    test.each([
        '太魯閣',
        '普悠瑪',
        '新自強',
        '自強(3000)',
        '自強(商務專開列車)',
        '親子觀光列車',
        '郵輪式列車',
        '團體列車',
    ])('excludes %s trains', (trainType) => {
        expect(supportsElectronicTicket(train(trainType))).toBe(false);
    });
});

test('only confirmed journey cancellations or unusable times exclude boarding', () => {
    for (const suspension of [
        'full',
        'origin-stop',
        'destination-stop',
    ] as const)
        expect(canBoardTrain({ ...train('區間'), suspension })).toBe(false);
    expect(canBoardTrain({ ...train('區間'), status: 'cancelled' })).toBe(
        false
    );
    expect(canBoardTrain({ ...train('區間'), departureTime: '--:--' })).toBe(
        false
    );
    expect(canBoardTrain({ ...train('區間'), arrivalTime: '--:--' })).toBe(
        false
    );
});

test('missing live data and unconfirmed service flags keep scheduled trains visible', () => {
    for (const suspension of [undefined, null, 'unknown', 'partial'] as const) {
        expect(
            canBoardTrain({ ...train('區間'), status: 'unknown', suspension })
        ).toBe(true);
    }
});
