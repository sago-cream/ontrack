import { describe, expect, test } from 'bun:test';

import { mapTrainToAppTrainInfo } from '../src/index';
import type { TDXFullTimetable, TDXODFare } from '../src/types';

const timetable: TDXFullTimetable = {
    TrainInfo: {
        TrainNo: '123',
        TrainTypeName: { Zh_tw: '自強' },
        TrainTypeCode: '3',
        Direction: 1,
        TripLine: 1,
    },
    StopTimes: [
        {
            StationID: '1000',
            StationName: { Zh_tw: '臺北' },
            DepartureTime: '09:00',
            ArrivalTime: '08:58',
        },
        {
            StationID: '3300',
            StationName: { Zh_tw: '臺中' },
            DepartureTime: '11:10',
            ArrivalTime: '11:08',
        },
    ],
};

const routeFares: TDXODFare[] = [
    {
        Direction: 1,
        TrainType: 3,
        Fares: [
            {
                TicketType: 1,
                FareClass: 1,
                CabinClass: 1,
                Price: 500,
            },
        ],
        TravelDistance: 164.6,
    },
];

describe('train card data', () => {
    test('includes the trip line and matching adult fare', () => {
        const train = mapTrainToAppTrainInfo(
            timetable,
            '1000',
            '3300',
            new Map(),
            routeFares
        );

        expect(train?.tripLine).toBe(1);
        expect(train?.price).toBe(500);
    });

    test('leaves the fare empty when the direction does not match', () => {
        const train = mapTrainToAppTrainInfo(
            timetable,
            '1000',
            '3300',
            new Map(),
            [{ ...routeFares[0], Direction: 0 }]
        );

        expect(train?.price).toBeNull();
    });
});

describe('timetable suspension mapping', () => {
    function service(flag: number | undefined = 0) {
        return {
            ...timetable,
            TrainInfo: { ...timetable.TrainInfo, SuspendedFlag: flag },
            StopTimes: timetable.StopTimes.map((stop) => ({
                ...stop,
                SuspendedFlag: 0,
            })),
        };
    }
    function map(data: TDXFullTimetable) {
        return mapTrainToAppTrainInfo(
            data,
            '1000',
            '3300',
            new Map([['123', 7]])
        );
    }
    test('full cancellation takes precedence over a positive delay', () => {
        expect(map(service(1))).toMatchObject({
            status: 'cancelled',
            suspension: 'full',
        });
    });
    test('a partial train cannot be inferred runnable from open endpoints', () => {
        expect(map(service(2))).toMatchObject({
            status: 'unknown',
            suspension: 'partial',
        });
    });
    test('a suspended endpoint marks this journey cancelled', () => {
        const data = service(2);
        data.StopTimes[1].SuspendedFlag = 1;
        expect(map(data)).toMatchObject({
            status: 'cancelled',
            suspension: 'destination-stop',
            suspendedStations: ['臺中'],
        });
    });
    test('missing or future flags are unverified rather than on time', () => {
        const data = service();
        delete data.TrainInfo.SuspendedFlag;
        expect(map(data)?.suspension).toBe('unknown');
        expect(map(service(99))?.suspension).toBe('unknown');
    });
    test('fresh normal flags restore service without inferring cancellation from live-board absence', () => {
        const train = mapTrainToAppTrainInfo(
            service(),
            '1000',
            '3300',
            new Map()
        );
        expect(train).toMatchObject({ suspension: null, status: 'unknown' });
    });
    test('cancelled trains retain a row even when withdrawn times are null', () => {
        const data = service(1);
        data.StopTimes[0].DepartureTime = null;
        data.StopTimes[1].ArrivalTime = null;
        expect(map(data)).toMatchObject({
            departureTime: '--:--',
            arrivalTime: '--:--',
            status: 'cancelled',
        });
    });
});
