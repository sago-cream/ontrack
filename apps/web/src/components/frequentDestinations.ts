import destinationAutofillConfig from '../../../shared/destination-autofill.json';
import { isTaipeiCircularStation } from './stationSearchUtils';

const FREQUENT_DESTINATIONS_KEY = 'ontrack_frequent_destinations';
const LEGACY_RECENT_STATIONS_KEY = 'ontrack_recent_stations';
const LEGACY_RECENT_DEPARTURE_STATIONS_KEY =
    'ontrack_recent_departure_stations';

type DayType = 'weekday' | 'weekend';
type HourBucket = string;
type TimeContextKey = `${DayType}:${HourBucket}`;

interface FrequentDestination {
    originId: string;
    id: string;
    count: number;
    updatedAt: number;
    contexts?: Partial<Record<TimeContextKey, DestinationTimeContext>>;
}

interface DestinationTimeContext {
    count: number;
    updatedAt: number;
}

interface DestinationCandidate {
    id: string;
    name?: string;
}

function canUseLocalStorage() {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function isValidStationId(id: string) {
    return /^[A-Z0-9-]*$/i.test(id) && id.length <= 10;
}

function readLegacyStationIds(key: string): string[] {
    try {
        const storedValue = localStorage.getItem(key);
        if (!storedValue) return [];

        const parsedValue = JSON.parse(storedValue);
        return Array.isArray(parsedValue)
            ? parsedValue.filter(
                  (item): item is string =>
                      typeof item === 'string' && isValidStationId(item)
              )
            : [];
    } catch {
        return [];
    }
}

function readFrequentDestinations(): FrequentDestination[] {
    try {
        const storedValue = localStorage.getItem(FREQUENT_DESTINATIONS_KEY);
        if (!storedValue) return [];

        const parsedValue = JSON.parse(storedValue);
        if (!Array.isArray(parsedValue)) return [];

        return parsedValue.flatMap((item): FrequentDestination[] => {
            if (
                typeof item !== 'object' ||
                item === null ||
                !('id' in item) ||
                !('count' in item) ||
                !('updatedAt' in item)
            ) {
                return [];
            }

            const originId =
                'originId' in item && typeof item.originId === 'string'
                    ? item.originId
                    : '';
            if (originId && !isValidStationId(originId)) {
                return [];
            }

            if (
                typeof item.id !== 'string' ||
                !isValidStationId(item.id) ||
                typeof item.count !== 'number' ||
                item.count <= 0 ||
                typeof item.updatedAt !== 'number'
            ) {
                return [];
            }

            const contexts =
                'contexts' in item ? readTimeContexts(item.contexts) : {};

            return [
                {
                    originId,
                    id: item.id,
                    count: item.count,
                    updatedAt: item.updatedAt,
                    ...(Object.keys(contexts).length > 0 ? { contexts } : {}),
                },
            ];
        });
    } catch {
        return [];
    }
}

function readFrequentDestinationsWithLegacy(): FrequentDestination[] {
    const storedRecords = readFrequentDestinations();
    if (storedRecords.length > 0) return storedRecords;

    const legacyIds = [
        ...readLegacyStationIds(LEGACY_RECENT_STATIONS_KEY),
        ...readLegacyStationIds(LEGACY_RECENT_DEPARTURE_STATIONS_KEY),
    ].filter((id, index, ids) => ids.indexOf(id) === index);

    return legacyIds.map((id, index) => ({
        originId: '',
        id,
        count: legacyIds.length - index,
        updatedAt: Date.now() - index,
    }));
}

function sortDestinations(destinations: FrequentDestination[]) {
    return [...destinations].sort(
        (a, b) => b.count - a.count || b.updatedAt - a.updatedAt
    );
}

function readTimeContexts(value: unknown) {
    if (typeof value !== 'object' || value === null) {
        return {};
    }

    return Object.entries(value).reduce<
        Partial<Record<TimeContextKey, DestinationTimeContext>>
    >((contexts, [key, context]) => {
        if (
            !isTimeContextKey(key) ||
            typeof context !== 'object' ||
            context === null ||
            !('count' in context) ||
            !('updatedAt' in context) ||
            typeof context.count !== 'number' ||
            context.count <= 0 ||
            typeof context.updatedAt !== 'number'
        ) {
            return contexts;
        }

        contexts[key] = {
            count: context.count,
            updatedAt: context.updatedAt,
        };
        return contexts;
    }, {});
}

function isTimeContextKey(value: string): value is TimeContextKey {
    return destinationAutofillConfig.hourBuckets.some(
        (bucket) =>
            value === `weekday:${bucket.key}` ||
            value === `weekend:${bucket.key}`
    );
}

function getTimeContext(date: Date): TimeContextKey {
    const dayType: DayType =
        date.getDay() === 0 || date.getDay() === 6 ? 'weekend' : 'weekday';
    const hour = date.getHours();
    const bucket = destinationAutofillConfig.hourBuckets.find(
        ({ startHour, endHour }) => hour >= startHour && hour <= endHour
    );
    const fallbackBucket =
        destinationAutofillConfig.hourBuckets[
            destinationAutofillConfig.hourBuckets.length - 1
        ]?.key ?? '';

    return `${dayType}:${bucket?.key ?? fallbackBucket}`;
}

function getDecayedCount(count: number, updatedAt: number, now: number) {
    const ageDays = Math.max(0, now - updatedAt) / 86_400_000;
    return count * Math.exp(-ageDays / destinationAutofillConfig.decayDays);
}

function getMaxValue(values: Map<string, number>) {
    return Math.max(0, ...values.values());
}

function getNormalizedScore(values: Map<string, number>, id: string) {
    const maxValue = getMaxValue(values);
    if (maxValue <= 0) return 0;

    return (values.get(id) ?? 0) / maxValue;
}

function normalizeStationName(name?: string) {
    return name?.replace(/台/g, '臺') ?? '';
}

function getPriorScore(candidate: DestinationCandidate, index: number) {
    const normalizedName = normalizeStationName(candidate.name);
    const priorIndex = destinationAutofillConfig.priorStationNames
        .map(normalizeStationName)
        .indexOf(normalizedName);

    if (priorIndex >= 0) {
        return (
            1 - priorIndex / destinationAutofillConfig.priorStationNames.length
        );
    }

    return Math.max(
        0,
        destinationAutofillConfig.unknownStationPrior.base -
            index * destinationAutofillConfig.unknownStationPrior.indexPenalty
    );
}

function incrementScore(
    scores: Map<string, number>,
    id: string,
    score: number
) {
    scores.set(id, (scores.get(id) ?? 0) + score);
}

function getDestinationCandidates(
    records: FrequentDestination[],
    stations: DestinationCandidate[]
) {
    const candidates = new Map<string, DestinationCandidate>();

    stations.forEach((station) => {
        if (
            isValidStationId(station.id) &&
            !isTaipeiCircularStation({ name: station.name ?? '' })
        ) {
            candidates.set(station.id, station);
        }
    });

    if (candidates.size === 0) {
        records.forEach((destination) => {
            candidates.set(destination.id, { id: destination.id });
        });
    }

    return [...candidates.values()];
}

function getWeighting(originSamples: number, globalSamples: number) {
    if (
        originSamples >=
        destinationAutofillConfig.scoreProfiles.origin.minOriginSamples
    ) {
        return destinationAutofillConfig.scoreProfiles.origin.weights;
    }

    if (
        globalSamples >=
        destinationAutofillConfig.scoreProfiles.global.minGlobalSamples
    ) {
        return destinationAutofillConfig.scoreProfiles.global.weights;
    }

    return destinationAutofillConfig.scoreProfiles.coldStart.weights;
}

function scoreDestinationIds(
    records: FrequentDestination[],
    originId: string,
    excludedId: string,
    stations: DestinationCandidate[],
    nowDate: Date
) {
    const now = nowDate.getTime();
    const timeContext = getTimeContext(nowDate);
    const userODScores = new Map<string, number>();
    const userGlobalScores = new Map<string, number>();
    const originTimeScores = new Map<string, number>();
    const globalTimeScores = new Map<string, number>();
    const updatedAtById = new Map<string, number>();
    let originSamples = 0;
    let globalSamples = 0;

    records.forEach((destination) => {
        const decayedCount = getDecayedCount(
            destination.count,
            destination.updatedAt,
            now
        );
        globalSamples += destination.count;
        incrementScore(userGlobalScores, destination.id, decayedCount);
        updatedAtById.set(
            destination.id,
            Math.max(
                updatedAtById.get(destination.id) ?? 0,
                destination.updatedAt
            )
        );

        if (destination.originId === originId) {
            originSamples += destination.count;
            incrementScore(userODScores, destination.id, decayedCount);
        }

        const context = destination.contexts?.[timeContext];
        if (!context) return;

        const decayedContextCount = getDecayedCount(
            context.count,
            context.updatedAt,
            now
        );
        incrementScore(globalTimeScores, destination.id, decayedContextCount);

        if (destination.originId === originId) {
            incrementScore(
                originTimeScores,
                destination.id,
                decayedContextCount
            );
        }
    });

    const candidates = getDestinationCandidates(records, stations).filter(
        (candidate) => candidate.id !== excludedId
    );
    const weights = getWeighting(originSamples, globalSamples);
    const activeTimeScores =
        originSamples >= 3 || getMaxValue(originTimeScores) > 0
            ? originTimeScores
            : globalTimeScores;

    return candidates
        .map((candidate, index) => {
            const score =
                weights.userOD *
                    getNormalizedScore(userODScores, candidate.id) +
                weights.timeContext *
                    getNormalizedScore(activeTimeScores, candidate.id) +
                weights.userGlobal *
                    getNormalizedScore(userGlobalScores, candidate.id) +
                weights.prior * getPriorScore(candidate, index);

            return {
                id: candidate.id,
                score,
                updatedAt: updatedAtById.get(candidate.id) ?? 0,
                index,
            };
        })
        .sort(
            (a, b) =>
                b.score - a.score ||
                b.updatedAt - a.updatedAt ||
                a.index - b.index
        )
        .map((candidate) => candidate.id);
}

export function getFrequentDestinationIds(
    excludedId = '',
    now = new Date()
): string[] {
    if (!canUseLocalStorage()) return [];

    return scoreDestinationIds(
        readFrequentDestinationsWithLegacy(),
        '',
        excludedId,
        [],
        now
    );
}

export function getFrequentDestinationIdsForOrigin(
    originId: string,
    excludedId = '',
    stations: DestinationCandidate[] = [],
    now = new Date()
): string[] {
    if (!canUseLocalStorage() || !isValidStationId(originId)) {
        return getFrequentDestinationIds(excludedId);
    }

    const destinations = readFrequentDestinationsWithLegacy();

    return scoreDestinationIds(
        destinations,
        originId,
        excludedId,
        stations,
        now
    );
}

export function getAutoFillDestinationId(
    originId: string,
    stations: DestinationCandidate[],
    now = new Date()
) {
    return (
        getFrequentDestinationIdsForOrigin(
            originId,
            originId,
            stations,
            now
        )[0] ?? ''
    );
}

export function persistFrequentDestinationId(
    originId: string,
    stationId: string,
    stations: DestinationCandidate[] = [],
    nowDate = new Date()
) {
    if (
        !canUseLocalStorage() ||
        !isValidStationId(originId) ||
        !isValidStationId(stationId)
    ) {
        return getFrequentDestinationIdsForOrigin(originId, '', stations);
    }

    const now = nowDate.getTime();
    const timeContext = getTimeContext(nowDate);
    const destinations = readFrequentDestinationsWithLegacy();
    const existingDestination = destinations.find(
        (destination) =>
            destination.originId === originId && destination.id === stationId
    );

    const nextDestinations = existingDestination
        ? destinations.map((destination) =>
              destination.originId === originId && destination.id === stationId
                  ? {
                        ...destination,
                        count: destination.count + 1,
                        updatedAt: now,
                        contexts: {
                            ...destination.contexts,
                            [timeContext]: {
                                count:
                                    (destination.contexts?.[timeContext]
                                        ?.count ?? 0) + 1,
                                updatedAt: now,
                            },
                        },
                    }
                  : destination
          )
        : [
              {
                  originId,
                  id: stationId,
                  count: 1,
                  updatedAt: now,
                  contexts: {
                      [timeContext]: {
                          count: 1,
                          updatedAt: now,
                      },
                  },
              },
              ...destinations,
          ];

    const sortedDestinations = sortDestinations(nextDestinations).slice(
        0,
        destinationAutofillConfig.maxFrequentDestinations
    );

    localStorage.setItem(
        FREQUENT_DESTINATIONS_KEY,
        JSON.stringify(sortedDestinations)
    );
    localStorage.removeItem(LEGACY_RECENT_STATIONS_KEY);
    localStorage.removeItem(LEGACY_RECENT_DEPARTURE_STATIONS_KEY);

    return getFrequentDestinationIdsForOrigin(originId, '', stations, nowDate);
}
