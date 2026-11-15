import type { ScheduleResponse, Station, TrainInfo } from '../types';

export const storyStations: Station[] = [
    {
        id: '1000',
        name: '臺北',
        nameEn: 'Taipei',
        lat: 25.04792,
        lon: 121.51708,
    },
    {
        id: '1020',
        name: '板橋',
        nameEn: 'Banqiao',
        lat: 25.01428,
        lon: 121.46388,
    },
    {
        id: '3300',
        name: '臺中',
        nameEn: 'Taichung',
        lat: 24.13678,
        lon: 120.68501,
    },
];

export const storyTrains: TrainInfo[] = [
    {
        trainNo: '123',
        trainType: '自強',
        direction: 0,
        originStation: '臺北',
        destinationStation: '臺中',
        departureTime: '09:12',
        arrivalTime: '11:28',
        tripLine: 1,
        price: 500,
        delay: 0,
        status: 'on-time',
    },
    {
        trainNo: '125',
        trainType: '自強',
        direction: 0,
        originStation: '臺北',
        destinationStation: '臺中',
        departureTime: '09:42',
        arrivalTime: '11:58',
        tripLine: 1,
        price: 500,
        delay: 6,
        status: 'delayed',
    },
    {
        trainNo: '127',
        trainType: '區間快',
        direction: 0,
        originStation: '臺北',
        destinationStation: '臺中',
        departureTime: '10:05',
        arrivalTime: '12:47',
        tripLine: 2,
        price: 322,
        delay: 0,
        status: 'on-time',
    },
];

export const storySchedule: ScheduleResponse = {
    date: '2026-06-19',
    origin: storyStations[0],
    destination: storyStations[2],
    trains: storyTrains,
};

// Matches iOS APIClient.showcaseTrains for cross-platform screenshot comparisons.
export const nativeStoryStations: Station[] = [
    storyStations[0],
    storyStations[1],
    {
        id: '1210',
        name: '新竹',
        nameEn: 'Hsinchu',
        lat: 24.8017,
        lon: 120.9717,
    },
    storyStations[2],
];
export const nativeStorySchedule: ScheduleResponse = {
    ...storySchedule,
    origin: nativeStoryStations[0],
    destination: nativeStoryStations[2],
    trains: [
        ['124', '區間快', '09:20', '10:38', 2, 322, 0],
        ['125', '區間', '09:38', '10:54', 1, 322, 4],
        ['126', '自強', '09:54', '11:10', 1, 500, 0],
        ['127', '區間', '10:08', '11:26', 1, 322, 0],
        ['128', '自強', '10:22', '11:38', 1, 500, 0],
        ['129', '區間', '10:38', '11:56', 2, 322, 0],
    ].map((row) => ({
        trainNo: String(row[0]),
        trainType: String(row[1]),
        departureTime: String(row[2]),
        arrivalTime: String(row[3]),
        tripLine: Number(row[4]),
        price: Number(row[5]),
        delay: Number(row[6]),
        direction: 0,
        originStation: '1000',
        destinationStation: '1210',
        status: row[6] ? 'delayed' : 'on-time',
    })),
};

// Development-only caller in APIClient uses the same states as native showcase data.
export function withServiceScenario(
    schedule: ScheduleResponse,
    scenario: string | null
): ScheduleResponse {
    return {
        ...schedule,
        meta: {
            scheduleCacheStatus: 'hit',
            scheduleSnapshotFetchedAt: '2026-11-15T01:40:00.000Z',
            liveDataStatus: 'fresh',
            liveDataFetchedAt: null,
            liveDataAgeSeconds: 0,
        },
        trains: schedule.trains.map((train) => {
            const target =
                scenario === 'all' ||
                scenario === 'unavailable' ||
                train.trainNo === '125';
            if (!target) return train;
            const suspension: TrainInfo['suspension'] =
                scenario === 'cancelled' || scenario === 'all'
                    ? 'full'
                    : scenario === 'endpoint'
                      ? 'destination-stop'
                      : scenario === 'partial'
                        ? 'partial'
                        : scenario === 'unknown' || scenario === 'unavailable'
                          ? 'unknown'
                          : null;
            return {
                ...train,
                suspension,
                suspendedStations:
                    scenario === 'partial'
                        ? ['板橋']
                        : scenario === 'endpoint'
                          ? ['新竹']
                          : [],
                status:
                    suspension === 'full' || suspension === 'destination-stop'
                        ? 'cancelled'
                        : suspension
                          ? 'unknown'
                          : train.status,
            };
        }),
    };
}
