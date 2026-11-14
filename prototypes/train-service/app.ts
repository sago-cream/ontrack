import {
    fixture,
    now,
    route,
    rows,
    scenarios,
    type Scenario,
} from './fixtures';
import { assessService, relevantAlerts, type ServiceState } from './service';

const $ = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
const query = new URLSearchParams(location.search);
if (query.has('capture')) {
    document.documentElement.dataset.capture = 'true';
    document.documentElement.style.setProperty(
        '--capture-height',
        `${window.innerHeight}px`
    );
}
const requestedScenario = query.get('scenario') ?? '';
let scenario: Scenario =
    requestedScenario in scenarios
        ? (requestedScenario as Scenario)
        : 'cancelled';
let english = query.get('lang') === 'en';
let proposed = query.get('version') !== 'current';
let selected: string | null = null;
const text = (zh: string, en: string) => (english ? en : zh);
const paths = {
    chevron: '<path d="m9 5 7 7-7 7"/>',
    share: '<path d="M12 16V3m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    refresh: '<path d="M20 7v5h-5M20 12a8 8 0 1 1-2-6"/>',
    settings:
        '<path d="m9 3-.7 2.3-2.4.5-1.5 2.6 1 2.3-1 2.3 1.5 2.6 2.4.5L9 19h3l.7-2.9 2.4-.5 1.5-2.6-1-2.3 1-2.3-1.5-2.6-2.4-.5L12 3Z"/><circle cx="10.5" cy="11" r="2.5"/>',
    alert: '<path d="m12 3 10 18H2Z"/><path d="M12 9v4m0 4h.01"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
const icon = (name: keyof typeof paths) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
const escape = (value: string) =>
    value.replace(
        /[&<>"']/g,
        (char) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[char]!
    );

function statusLabel(state: ServiceState) {
    if (state.kind === 'cancelled') return text('停駛', 'Cancelled');
    if (state.kind === 'partial') return text('部分停駛', 'Partial');
    if (state.cause === 'stale') return text('待更新', 'Recheck');
    return text('待確認', 'Unverified');
}
function adjusted(time: string, delay: number) {
    const [hour, minute] = time.split(':').map(Number);
    const total = hour * 60 + minute + delay;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function getStates() {
    const data = fixture(scenario);
    return {
        data,
        states: data.trains.map((train) =>
            assessService(train, '1000', '1210', data.snapshot)
        ),
    };
}
function showDetail(index: number | null) {
    const { data, states } = getStates();
    const state = index === null ? null : states[index];
    $('detail-title').textContent =
        index === null
            ? text('路線營運異動', 'Route advisory')
            : `${rows[index].no} · ${statusLabel(state!)}`;
    const copy =
        index === null
            ? text(
                  '西部幹線部分列車可能延誤。此公告並未確認個別車次停駛，請查看臺鐵營運公告。',
                  'Some West Coast services may be delayed. This advisory does not confirm cancellation of any individual train. Check the official notice.'
              )
            : state!.cause === 'full'
              ? text(
                    '此車次全程停駛，請選擇其他列車。',
                    'This train is cancelled throughout its journey. Choose another train.'
                )
              : state!.cause === 'endpoint'
                ? text(
                      '此車次於新竹站停駛，無法完成臺北至新竹的行程。請選擇其他列車。',
                      'This train does not serve Hsinchu. It cannot complete your Taipei–Hsinchu journey. Choose another train.'
                  )
                : state!.kind === 'partial'
                  ? text(
                        '此車次部分停駛。臺北、新竹未標示停駛，板橋標示停駛；目前資料不足以確認可全程搭乘。請先向臺鐵確認。',
                        'This train is partly suspended. Taipei and Hsinchu are open in the feed; Banqiao is marked suspended. The available data does not establish a through journey. Verify with TRA first.'
                    )
                  : state!.cause === 'stale'
                    ? data.trains[index!].TrainInfo.SuspendedFlag === 1
                        ? text(
                              '上次資料顯示停駛，但已超過更新期限。目前行駛狀況待確認，請查看臺鐵最新公告。',
                              'The previous report marked this train cancelled, but it is out of date. Current service needs confirmation. Check TRA’s latest notice.'
                          )
                        : text(
                              '行駛資訊已超過更新期限，請向臺鐵確認目前行駛狀況。',
                              'Service data is out of date. Verify current service with TRA.'
                          )
                    : text(
                          '目前無法取得停駛資訊。誤點資料不能用來確認列車會行駛，請向臺鐵確認。',
                          'Suspension data is unavailable. Delay data cannot confirm that a train will run. Verify with TRA.'
                      );
    const updated =
        scenario === 'stale'
            ? '08:55'
            : scenario === 'unavailable'
              ? '—'
              : '09:40';
    $('detail-body').innerHTML =
        `<p>${escape(copy)}</p><p class="source">${text('來源：TDX 臺鐵', 'Source: TDX TRA')} · ${index === null ? 'Alert' : 'DailyTrainTimetable'}<br>${text('資料時間', 'Snapshot')}: 2026/11/15 ${updated} (UTC+8)<br>${text('此為模擬資料', 'Simulated data')}</p><a href="https://www.railway.gov.tw/tra-tip-web/tip/tip007/tip711/blockList" target="_blank" rel="noopener">${text('查看臺鐵營運公告', 'Open TRA service notices')} ↗</a>`;
    $<HTMLDialogElement>('detail').showModal();
}
function render() {
    document.documentElement.lang = english ? 'en' : 'zh-Hant';
    const { data, states } = getStates();
    const alerts = relevantAlerts(data.alerts, route, now);
    // Advisory-only scenarios stay inspectable, but require verification before recommendation.
    const eligible = rows.filter(
        (_, i) => !proposed || (states[i].recommend && alerts.length === 0)
    );
    if (!selected || !eligible.some((row) => row.no === selected))
        selected = eligible[0]?.no ?? null;
    $('time-control').textContent = text('出發 09:41 ⌄', 'Depart 09:41 ⌄');
    $('origin').textContent = text('臺北', 'Taipei');
    $('destination').textContent = text('新竹', 'Hsinchu');
    $('list-title').textContent = text('選擇列車', 'Choose a train');
    $('share-title').textContent = text('分享資訊', 'Share arrival');
    $('before').setAttribute('aria-pressed', String(!proposed));
    $('after').setAttribute('aria-pressed', String(proposed));
    const notice = $<HTMLButtonElement>('notice');
    notice.hidden = !proposed || alerts.length === 0;
    notice.innerHTML = `${icon('alert')}<span>${text('此路線有營運異動', 'Service change on this route')}</span>${icon('chevron')}`;
    notice.onclick = () => showDetail(null);
    $('trains').innerHTML = rows
        .map((row, i) => {
            const state = states[i];
            const blocked = proposed && (!state.recommend || alerts.length > 0);
            const serviceStateVisible = proposed && state.kind !== 'normal';
            const delayed = row.delay > 0 && !serviceStateVisible;
            const clock = (time: string) =>
                `<span class="clock">${delayed ? `<small>${adjusted(time, row.delay)}</small>` : ''}${time}</span>`;
            const side = serviceStateVisible
                ? `<span class="service-badge">${statusLabel(state)}${icon('chevron')}</span>`
                : `NT$${row.price}`;
            const label = `${english ? row.typeEn : row.type} ${row.no}, ${row.departure}–${row.arrival}${serviceStateVisible ? `, ${statusLabel(state)}, ${text('查看詳情', 'view details')}` : blocked ? `, ${text('查看營運公告', 'view service advisory')}` : ''}`;
            return `<button type="button" class="train ${proposed ? state.kind : ''}" data-index="${i}" aria-label="${escape(label)}" ${blocked ? 'aria-haspopup="dialog"' : `aria-pressed="${selected === row.no}"`}>
            <span class="train-times">${clock(row.departure)}<span class="duration">${i === 2 ? '1h18m' : '1h16m'}</span>${clock(row.arrival)}</span>
            <span class="train-side">${side}</span><span class="train-id"><span class="${row.type === '自強' ? 'express' : ''}">${english ? row.typeEn : row.type}</span> ${row.no}</span><span class="train-line">${english ? row.lineEn : row.line}</span>
        </button>`;
        })
        .join('');
    $('trains')
        .querySelectorAll<HTMLButtonElement>('button')
        .forEach((button) => {
            button.onclick = () => {
                const index = Number(button.dataset.index);
                if (proposed && !states[index].recommend)
                    return showDetail(index);
                if (proposed && alerts.length > 0) return showDetail(null);
                selected = rows[index].no;
                render();
            };
        });
    const active = rows.find((row) => row.no === selected);
    $('summary').className = active ? '' : 'empty';
    $('summary').textContent = active
        ? text(
              `${adjusted(active.arrival, active.delay)}到新竹`,
              `${adjusted(active.arrival, active.delay)} at Hsinchu`
          )
        : scenario === 'all'
          ? text(
                '此時段列車皆停駛，請調整出發時間',
                'All shown trains are cancelled. Try another departure time.'
            )
          : text(
                '行駛狀況待確認，請查看臺鐵公告',
                'Service needs verification. Check TRA notices.'
            );
    $<HTMLButtonElement>('share').disabled = !active;
    $('share').innerHTML = icon('share');
    $('share').setAttribute(
        'aria-label',
        text('預覽分享訊息', 'Preview share message')
    );
    $('share').onclick = () => {
        if (active)
            $('feedback').textContent = text(
                `分享預覽：${active.type} ${active.no}，${adjusted(active.arrival, active.delay)}到新竹`,
                `Share preview: ${active.typeEn} ${active.no}, ${adjusted(active.arrival, active.delay)} at Hsinchu`
            );
    };
    $('feedback').textContent = '';
    $<HTMLSelectElement>('scenario').innerHTML = Object.entries(scenarios)
        .map(
            ([key, labels]) =>
                `<option value="${key}" ${key === scenario ? 'selected' : ''}>${english ? labels[1] : labels[0]}</option>`
        )
        .join('');
    const params = new URLSearchParams({
        scenario,
        lang: english ? 'en' : 'zh',
        version: proposed ? 'proposed' : 'current',
        theme: document.documentElement.dataset.theme ?? 'light',
    });
    if (query.has('capture')) params.set('capture', '1');
    history.replaceState(null, '', `?${params}`);
}
$('refresh-icon').innerHTML = icon('refresh');
$('settings-icon').innerHTML = icon('settings');
$('close').innerHTML = icon('close');
$('close').setAttribute('aria-label', '關閉 / Close');
$('close').onclick = () => $<HTMLDialogElement>('detail').close();
$('before').onclick = () => {
    proposed = false;
    selected = null;
    render();
};
$('after').onclick = () => {
    proposed = true;
    selected = null;
    render();
};
$('scenario').onchange = () => {
    scenario = $<HTMLSelectElement>('scenario').value as Scenario;
    selected = null;
    render();
};
$<HTMLSelectElement>('language').value = english ? 'en' : 'zh';
$('language').onchange = () => {
    english = $<HTMLSelectElement>('language').value === 'en';
    render();
};
$<HTMLSelectElement>('theme').value =
    query.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = $<HTMLSelectElement>('theme').value;
$('theme').onchange = () => {
    document.documentElement.dataset.theme =
        $<HTMLSelectElement>('theme').value;
    render();
};
render();
