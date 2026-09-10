import { describe, expect, test } from 'bun:test';

import {
    getSampleShareMessageTemplateValues,
    getShareMessagePresets,
    parseShareMessageTemplate,
    renderShareMessageTemplate,
    resolveStoredShareMessageTemplate,
} from './shareMessage';

describe('share message templates', () => {
    test('renders text and selected train fields together', () => {
        const values = getSampleShareMessageTemplateValues('en');

        expect(
            renderShareMessageTemplate(
                'Taking {{trainType}} {{trainNumber}} to {{destination}} at {{arrivalTime}}',
                values
            )
        ).toBe('Taking Local 1120 to Taipei at 09:41');
    });

    test('keeps unknown fields visible so custom text is not lost', () => {
        const values = getSampleShareMessageTemplateValues('en');

        expect(
            renderShareMessageTemplate('Meet me at {{platform}}', values)
        ).toBe('Meet me at {{platform}}');
    });

    test('migrates both legacy format settings', () => {
        expect(resolveStoredShareMessageTemplate('arrivalOnly', 'en')).toBe(
            'Arrive at {{destination}} at {{arrivalTime}}'
        );
        expect(resolveStoredShareMessageTemplate('routeArrival', 'zh-TW')).toBe(
            '{{origin}}→{{destination}} {{arrivalTime}}到'
        );
    });

    test('parses known fields as inline tokens without hiding unknown text', () => {
        expect(
            parseShareMessageTemplate(
                'Take {{trainType}} to {{destination}} {{platform}}'
            )
        ).toEqual([
            { type: 'text', value: 'Take ' },
            { type: 'token', token: 'trainType' },
            { type: 'text', value: ' to ' },
            { type: 'token', token: 'destination' },
            { type: 'text', value: ' {{platform}}' },
        ]);
    });

    test('uses the composed ride message as the final preset', () => {
        expect(getShareMessagePresets('zh-TW').at(-1)).toEqual({
            id: 'ride',
            template:
                '我搭{{trainType}}{{trainNumber}} {{arrivalTime}}到{{destination}}',
        });
    });
});
