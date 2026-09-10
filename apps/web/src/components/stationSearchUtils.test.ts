import { describe, expect, test } from 'bun:test';

import type { Station } from '../types';
import {
    filterStationsBySearch,
    isTaipeiCircularStation,
    resolvePreferredStationId,
    stationSuggestions,
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

describe('native station suggestions', () => {
    const other: Station[] = [2, 3, 4, 5, 6].map((id) => ({
        id: String(id),
        name: `車站${id}`,
        nameEn: `Station ${id}`,
        lat: 25,
        lon: 121,
    }));
    const all = [...stations, ...other];
    test('orders recommendations, history and remaining stations without duplicates', () => {
        const result = stationSuggestions(
            all,
            '',
            '1000',
            [stations[1], other[1], other[0]],
            [other[0], other[2]]
        );
        expect(result.map(({ station }) => station.id)).toEqual([
            '3',
            '2',
            '4',
            '5',
            '6',
        ]);
        expect(result.map(({ kind }) => kind)).toEqual([
            'algorithmic',
            'algorithmic',
            'history',
            'regular',
            'regular',
        ]);
    });
    test('puts search matches first and limits the following history to two', () => {
        const result = stationSuggestions(all, '6', '1000', [other[0]], other);
        expect(result[0].station.id).toBe('6');
        expect(result.filter(({ kind }) => kind === 'history')).toHaveLength(2);
        expect(new Set(result.map(({ station }) => station.id)).size).toBe(
            result.length
        );
    });
    test('includes the circular station only in explicit matching results', () => {
        expect(
            stationSuggestions(all, '環島', '1000', [], [stations[1]])[0]
                .station.id
        ).toBe('1001');
        expect(
            stationSuggestions(all, '', '1000', [], [stations[1]]).some(
                ({ station }) => station.id === '1001'
            )
        ).toBe(false);
    });
});
