import { describe, expect, test } from 'bun:test';

import type { Station } from '../types';
import {
    filterStationsBySearch,
    isTaipeiCircularStation,
    resolvePreferredStationId,
} from './stationSearchUtils';

const stations: Station[] = [
    {
        id: '1000',
        name: '臺北',
        nameEn: 'Taipei',
        lat: 25.04775,
        lon: 121.51711,
    },
    {
        id: '1001',
        name: '臺北-環島',
        nameEn: 'Taipei Surround Island',
        lat: 25.04774,
        lon: 121.51711,
    },
];

describe('Taipei circular station avoidance', () => {
    test('recognizes the live and legacy station names', () => {
        expect(isTaipeiCircularStation(stations[1])).toBe(true);
        expect(isTaipeiCircularStation({ name: '臺北(環島)' })).toBe(true);
    });

    test('keeps the circular station behind an explicit manual search', () => {
        expect(filterStationsBySearch(stations, '台北')).toEqual([stations[0]]);
        expect(filterStationsBySearch(stations, '環島')).toEqual([stations[1]]);
        expect(filterStationsBySearch(stations, 'surround island')).toEqual([
            stations[1],
        ]);
    });

    test('maps automatic selection to Taipei main', () => {
        expect(resolvePreferredStationId('1001', stations)).toBe('1000');
        expect(resolvePreferredStationId('1001', stations, '環島')).toBe(
            '1001'
        );
    });
});
