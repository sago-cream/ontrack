import type { Station } from '../types';

const TAIPEI_MAIN_NAME = '臺北';
const CIRCULAR_SEARCH_PATTERN =
    /環島|circular|circle|loop|(?:round|around|surround)(?:\s|-)?island/i;

export function normalizeSearchValue(value: string): string {
    return value.replace(/台/g, '臺').trim();
}

export function normalizeEnglishStationName(value: string): string {
    return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isExplicitCircularSearch(value: string): boolean {
    return CIRCULAR_SEARCH_PATTERN.test(normalizeSearchValue(value));
}

export function isTaipeiCircularStation(
    station: Pick<Station, 'name'>
): boolean {
    return (
        normalizeSearchValue(station.name).replace(/[\s()（）-]/g, '') ===
        '臺北環島'
    );
}

export function resolvePreferredStation(
    station: Station | undefined,
    stations: Station[],
    searchValue = ''
): Station | undefined {
    if (!station) return undefined;
    if (
        !isTaipeiCircularStation(station) ||
        isExplicitCircularSearch(searchValue)
    ) {
        return station;
    }

    return stations.find((candidate) => candidate.name === TAIPEI_MAIN_NAME);
}

export function resolvePreferredStationId(
    stationId: string,
    stations: Station[],
    searchValue = ''
): string {
    const preferredStation = resolvePreferredStation(
        stations.find((station) => station.id === stationId),
        stations,
        searchValue
    );

    return preferredStation?.id ?? stationId;
}

export function filterStationsBySearch(
    stations: Station[],
    searchValue: string
): Station[] {
    const normalizedSearch = normalizeSearchValue(searchValue);
    const explicitCircularSearch = isExplicitCircularSearch(searchValue);
    const normalizedEnglishSearch = normalizeEnglishStationName(searchValue);

    return stations.filter((station) => {
        const matchesSearch =
            station.id
                .toLowerCase()
                .includes(searchValue.trim().toLowerCase()) ||
            station.name.includes(searchValue) ||
            station.name.includes(normalizedSearch) ||
            normalizeEnglishStationName(station.nameEn).includes(
                normalizedEnglishSearch
            );

        if (!matchesSearch) return false;
        if (explicitCircularSearch) return true;

        return !isTaipeiCircularStation(station);
    });
}

export type StationSuggestion = {
    station: Station;
    kind: 'regular' | 'algorithmic' | 'history';
};
export function stationSuggestions(
    stations: Station[],
    query: string,
    selectedId: string,
    recommendations: Station[],
    history: Station[]
): StationSuggestion[] {
    const matches = query.trim()
        ? filterStationsBySearch(stations, query)
              .filter((s) => s.id !== selectedId)
              .sort((a, b) => {
                  const exact = (s: Station) =>
                      s.name === normalizeSearchValue(query) ||
                      normalizeEnglishStationName(s.nameEn) ===
                          normalizeEnglishStationName(query);
                  return Number(exact(b)) - Number(exact(a));
              })
        : [];
    const seen = new Set([selectedId, ...matches.map((s) => s.id)]);
    const take = (source: Station[], limit = Infinity) => {
        const result: Station[] = [];
        for (const station of source) {
            if (
                seen.has(station.id) ||
                isTaipeiCircularStation(station) ||
                result.length >= limit
            )
                continue;
            seen.add(station.id);
            result.push(station);
        }
        return result;
    };
    const recommended = take(recommendations, 3);
    const recent = take(history, matches.length ? 2 : Infinity);
    const other = take(stations);
    return [
        ...matches.map((station) => ({ station, kind: 'regular' as const })),
        ...recommended.map((station) => ({
            station,
            kind: 'algorithmic' as const,
        })),
        ...recent.map((station) => ({ station, kind: 'history' as const })),
        ...other.map((station) => ({ station, kind: 'regular' as const })),
    ];
}
