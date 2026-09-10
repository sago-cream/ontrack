import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { isAndroid, NativeApp, usesNativeUI } from '../native/platform';
import { I18nContext } from './context';
import {
    FALLBACK_LANGUAGE,
    STORAGE_LANGUAGE_KEY,
    translations,
    type TranslationKey,
} from './translations';
import type { LanguageCode, TranslationParams } from './types';

function formatMessage(template: string, params?: TranslationParams): string {
    if (!params) return template;

    return template.replace(/\{(\w+)\}/g, (_, token: string) => {
        const value = params[token];
        return value === undefined ? `{${token}}` : String(value);
    });
}

function detectLanguage(): LanguageCode {
    if (typeof navigator === 'undefined') {
        return FALLBACK_LANGUAGE;
    }

    const candidates = navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
    for (const candidate of candidates) {
        const normalized = candidate.toLowerCase();
        if (normalized.startsWith('zh')) return 'zh-TW';
        if (normalized.startsWith('en')) return 'en';
    }
    return 'en';
}

function getPreferredLanguage(): LanguageCode {
    if (typeof window === 'undefined') {
        return FALLBACK_LANGUAGE;
    }

    if (usesNativeUI()) return detectLanguage();

    const stored = localStorage.getItem(STORAGE_LANGUAGE_KEY);
    if (stored === 'zh-TW' || stored === 'en') return stored;

    // First launch — detect from browser/device and persist
    const detected = detectLanguage();
    localStorage.setItem(STORAGE_LANGUAGE_KEY, detected);
    return detected;
}

export function I18nProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] =
        useState<LanguageCode>(FALLBACK_LANGUAGE);

    useEffect(() => {
        if (!isAndroid()) return;
        let active = true;
        const refresh = () => {
            if (document.hidden) return;
            void NativeApp.locale()
                .then(({ language: locales }) => {
                    const preferred = locales
                        .split(',')
                        .find((tag) => /^(zh|en)(-|$)/i.test(tag));
                    if (active)
                        setLanguageState(
                            preferred?.toLowerCase().startsWith('zh')
                                ? 'zh-TW'
                                : 'en'
                        );
                })
                .catch(() => {});
        };
        refresh();
        window.addEventListener('languagechange', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            active = false;
            window.removeEventListener('languagechange', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, []);

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (!isAndroid()) setLanguageState(getPreferredLanguage());
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    const setLanguage = (next: LanguageCode) => {
        setLanguageState(next);
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_LANGUAGE_KEY, next);
        }
    };

    const value = useMemo(() => {
        const t = (key: TranslationKey, params?: TranslationParams) => {
            const locale =
                language in translations ? language : FALLBACK_LANGUAGE;
            const localePack =
                translations[locale as keyof typeof translations] ||
                translations[FALLBACK_LANGUAGE];
            const template =
                localePack[key] || translations[FALLBACK_LANGUAGE][key];
            return formatMessage(template, params);
        };

        return { language, setLanguage, t };
    }, [language]);

    return (
        <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    );
}
