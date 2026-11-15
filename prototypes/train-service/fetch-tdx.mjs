#!/usr/bin/env node
// TDX_CLIENT_ID / TDX_CLIENT_SECRET must be supplied by the caller's environment.
// node --env-file=/path/to/private.env prototypes/train-service/fetch-tdx.mjs 2026-11-15
const date =
    process.argv[2] ??
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
) {
    throw new Error('Provide a service date as YYYY-MM-DD.');
}
const clientId = process.env.TDX_CLIENT_ID;
const clientSecret = process.env.TDX_CLIENT_SECRET;
if (!clientId || !clientSecret)
    throw new Error('Set TDX_CLIENT_ID and TDX_CLIENT_SECRET.');
const timeout = () => AbortSignal.timeout(30_000);
const auth = await fetch(
    'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
    {
        method: 'POST',
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
        }),
        signal: timeout(),
    }
);
if (!auth.ok) throw new Error(`TDX authentication failed (${auth.status}).`);
const { access_token: token } = await auth.json();
if (!token) throw new Error('TDX returned no access token.');

async function getAll(path, key, select) {
    const rows = [];
    let updateTime = null;
    let srcUpdateTime = null;
    for (let skip = 0; ; skip += 500) {
        const url = new URL(
            `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/${path}`
        );
        url.search = new URLSearchParams({
            $format: 'JSON',
            $top: '500',
            $skip: String(skip),
            ...(select ? { $select: select } : {}),
        });
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: timeout(),
        });
        if (!response.ok)
            throw new Error(`TDX ${path} failed (${response.status}).`);
        const data = await response.json();
        if (!Array.isArray(data[key]))
            throw new Error(`TDX ${path} missing ${key}.`);
        updateTime = data.UpdateTime ?? updateTime;
        srcUpdateTime = data.SrcUpdateTime ?? srcUpdateTime;
        rows.push(...data[key]);
        if (data[key].length < 500) break;
        if (skip >= 100_000)
            throw new Error('TDX pagination exceeded expected size.');
    }
    return {
        updateTime,
        srcUpdateTime,
        fetchedAt: new Date().toISOString(),
        rows,
    };
}

// Keep calls sequential to respect TDX account rate limits; never print credentials.
const timetable = await getAll(
    `DailyTrainTimetable/TrainDate/${date}`,
    'TrainTimetables',
    'TrainInfo,StopTimes'
);
const alerts = await getAll('Alert', 'Alerts');
const news = await getAll('News', 'Newses');
console.log(
    JSON.stringify(
        {
            serviceDate: date,
            timetable: {
                ...timetable,
                total: timetable.rows.length,
                rows: timetable.rows.filter(
                    (train) =>
                        train.TrainInfo?.SuspendedFlag > 0 ||
                        train.StopTimes?.some(
                            (stop) => stop.SuspendedFlag === 1
                        )
                ),
            },
            alerts,
            news,
        },
        null,
        2
    )
);
