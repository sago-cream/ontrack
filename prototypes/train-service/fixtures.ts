import type { Alert, Timetable } from './service';

export const now = Date.parse('2026-11-15T09:41:00+08:00');
export const serviceDate = '2026-11-15';
export const route = {
    trainNos: ['125', '126', '127'],
    routeIds: ['demo-west'],
    lineIds: ['demo-west-line'],
    stationIds: ['1000', '1020', '1210'],
};
export const rows = [
    {
        no: '125',
        type: '區間',
        typeEn: 'Local',
        departure: '09:38',
        arrival: '10:54',
        delay: 4,
        price: 322,
        line: '山線',
        lineEn: 'Mountain',
    },
    {
        no: '126',
        type: '自強',
        typeEn: 'TC',
        departure: '09:54',
        arrival: '11:10',
        delay: 0,
        price: 500,
        line: '山線',
        lineEn: 'Mountain',
    },
    {
        no: '127',
        type: '區間',
        typeEn: 'Local',
        departure: '10:08',
        arrival: '11:26',
        delay: 0,
        price: 322,
        line: '山線',
        lineEn: 'Mountain',
    },
];

export const scenarios = {
    cancelled: ['整列停駛', 'Full cancellation'],
    endpoint: ['本站停駛', 'Selected stop suspended'],
    partial: ['部分停駛', 'Partial suspension'],
    notice: ['路線營運異動', 'Route advisory'],
    stale: ['停駛資料過期', 'Stale suspension report'],
    unavailable: ['停駛資料未取得', 'Service data unavailable'],
    all: ['全部停駛', 'All trains cancelled'],
    restored: ['恢復行駛', 'Service restored'],
} as const;
export type Scenario = keyof typeof scenarios;

export function fixture(scenario: Scenario) {
    const trains: Timetable[] = rows.map((row) => ({
        TrainInfo: { TrainNo: row.no, SuspendedFlag: 0 },
        StopTimes: [
            {
                StationID: '1000',
                StationName: { Zh_tw: '臺北' },
                SuspendedFlag: 0,
            },
            {
                StationID: '1020',
                StationName: { Zh_tw: '板橋' },
                SuspendedFlag: 0,
            },
            {
                StationID: '1210',
                StationName: { Zh_tw: '新竹' },
                SuspendedFlag: 0,
            },
        ],
    }));
    if (scenario === 'cancelled' || scenario === 'stale' || scenario === 'all')
        trains[0].TrainInfo.SuspendedFlag = 1;
    if (scenario === 'endpoint') {
        trains[0].TrainInfo.SuspendedFlag = 2;
        trains[0].StopTimes[2].SuspendedFlag = 1;
    }
    if (scenario === 'partial') {
        trains[0].TrainInfo.SuspendedFlag = 2;
        trains[0].StopTimes[1].SuspendedFlag = 1;
    }
    if (scenario === 'all')
        trains.forEach((train) => {
            train.TrainInfo.SuspendedFlag = 1;
        });
    if (scenario === 'unavailable')
        trains.forEach((train) => {
            delete train.TrainInfo.SuspendedFlag;
            train.StopTimes.forEach((stop) => {
                delete stop.SuspendedFlag;
            });
        });
    const alerts: Alert[] =
        scenario === 'notice'
            ? [
                  {
                      AlertID: 'demo-advisory',
                      Title: '西部幹線部分列車可能延誤',
                      Description:
                          '部分列車可能延誤，請留意臺鐵後續公告。此通阻資訊並未確認個別車次停駛。',
                      Status: 2,
                      Scope: { Routes: [{ RouteID: 'demo-west' }] },
                      StartTime: '2026-11-15T09:30:00+08:00',
                      UpdateTime: '2026-11-15T09:40:00+08:00',
                  },
              ]
            : [];
    return {
        trains,
        alerts,
        snapshot: {
            serviceDate,
            requestedDate: serviceDate,
            fetchedAt:
                scenario === 'unavailable'
                    ? null
                    : scenario === 'stale'
                      ? '2026-11-15T08:55:00+08:00'
                      : '2026-11-15T09:40:00+08:00',
            now,
        },
    };
}
