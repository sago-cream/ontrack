import type { LanguageCode } from './i18n/types';
import type { TrainInfo } from './types';

export type ShareMessageTemplateValues = {
    arrivalTime: string;
    departureTime: string;
    trainType: string;
    trainNumber: string;
    origin: string;
    destination: string;
    duration: string;
    fare: string;
    delay: string;
    line: string;
};

export type ShareMessageToken = keyof ShareMessageTemplateValues;

export type ShareMessageTemplateSegment =
    | { type: 'text'; value: string }
    | { type: 'token'; token: ShareMessageToken };

export const SHARE_MESSAGE_TOKENS: ShareMessageToken[] = [
    'arrivalTime',
    'departureTime',
    'trainType',
    'trainNumber',
    'origin',
    'destination',
    'duration',
    'fare',
    'delay',
    'line',
];

export function shareMessageToken(token: ShareMessageToken) {
    return `{{${token}}}`;
}

export function parseShareMessageTemplate(
    template: string
): ShareMessageTemplateSegment[] {
    const segments: ShareMessageTemplateSegment[] = [];
    const tokenPattern = /\{\{(\w+)\}\}/g;
    let cursor = 0;
    const appendText = (value: string) => {
        if (!value) return;

        const previous = segments.at(-1);
        if (previous?.type === 'text') {
            previous.value += value;
        } else {
            segments.push({ type: 'text', value });
        }
    };

    for (const match of template.matchAll(tokenPattern)) {
        const index = match.index ?? 0;
        if (index > cursor) {
            appendText(template.slice(cursor, index));
        }

        const token = match[1];
        if (SHARE_MESSAGE_TOKENS.includes(token as ShareMessageToken)) {
            segments.push({
                type: 'token',
                token: token as ShareMessageToken,
            });
        } else {
            appendText(match[0]);
        }
        cursor = index + match[0].length;
    }

    if (cursor < template.length) {
        appendText(template.slice(cursor));
    }

    return segments;
}

export function getDefaultShareMessageTemplate(language: LanguageCode) {
    return language === 'en'
        ? 'Arrive at {{destination}} at {{arrivalTime}}'
        : '{{arrivalTime}}到{{destination}}';
}

export function getShareMessagePresets(language: LanguageCode) {
    if (language === 'en') {
        return [
            {
                id: 'arrival',
                template: 'Arrive at {{destination}} at {{arrivalTime}}',
            },
            {
                id: 'route',
                template:
                    '{{origin}} → {{destination}}, arriving {{arrivalTime}}',
            },
            {
                id: 'ride',
                template:
                    "I'm taking {{trainType}} {{trainNumber}}, arriving {{arrivalTime}} at {{destination}}",
            },
        ] as const;
    }

    return [
        {
            id: 'arrival',
            template: '{{arrivalTime}}到{{destination}}',
        },
        {
            id: 'route',
            template: '{{origin}}→{{destination}} {{arrivalTime}}到',
        },
        {
            id: 'ride',
            template:
                '我搭{{trainType}}{{trainNumber}} {{arrivalTime}}到{{destination}}',
        },
    ] as const;
}

export function resolveStoredShareMessageTemplate(
    stored: string | null,
    language: LanguageCode
) {
    if (!stored || stored === 'arrivalOnly') {
        return getDefaultShareMessageTemplate(language);
    }

    if (stored === 'routeArrival') {
        return getShareMessagePresets(language)[1].template;
    }

    return stored;
}

export function renderShareMessageTemplate(
    template: string,
    values: ShareMessageTemplateValues
) {
    return template
        .replace(/\{\{(\w+)\}\}/g, (match, token: string) =>
            token in values ? values[token as ShareMessageToken] : match
        )
        .trim();
}

function timeToMinutes(time: string) {
    const [hours = 0, minutes = 0] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

function addMinutes(time: string, minutes: number) {
    const total = timeToMinutes(time) + minutes;
    const hours = Math.floor(total / 60) % 24;
    const remainingMinutes = total % 60;

    return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}

function formatDuration(departureTime: string, arrivalTime: string) {
    let minutes = timeToMinutes(arrivalTime) - timeToMinutes(departureTime);
    if (minutes < 0) minutes += 24 * 60;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) return `${remainingMinutes}m`;
    return remainingMinutes === 0
        ? `${hours}h`
        : `${hours}h${remainingMinutes}m`;
}

export function createShareMessageTemplateValues({
    train,
    origin,
    destination,
    trainType,
    arrivalTime,
    line,
    delay,
}: {
    train: TrainInfo;
    origin: string;
    destination: string;
    trainType: string;
    arrivalTime: string;
    line: string;
    delay: string;
}): ShareMessageTemplateValues {
    return {
        arrivalTime,
        departureTime: addMinutes(train.departureTime, train.delay ?? 0),
        trainType,
        trainNumber: train.trainNo,
        origin,
        destination,
        duration: formatDuration(train.departureTime, train.arrivalTime),
        fare:
            train.price == null
                ? ''
                : `NT$${train.price.toLocaleString('en-US')}`,
        delay,
        line,
    };
}

export function getSampleShareMessageTemplateValues(
    language: LanguageCode
): ShareMessageTemplateValues {
    return {
        arrivalTime: '09:41',
        departureTime: '08:35',
        trainType: language === 'en' ? 'Local' : '區間',
        trainNumber: '1120',
        origin: language === 'en' ? 'Hsinchu' : '新竹',
        destination: language === 'en' ? 'Taipei' : '臺北',
        duration: '1h6m',
        fare: 'NT$177',
        delay: language === 'en' ? 'On time' : '準點',
        line: language === 'en' ? 'Mountain Line' : '山線',
    };
}
