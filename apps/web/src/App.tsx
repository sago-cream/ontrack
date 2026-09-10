'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Settings } from 'lucide-react';

import './App.css';

import { api, getUserSafeErrorMessage, isShowcaseMode } from './api/client';
import { SettingsSheet, type AppearanceMode } from './components/SettingsSheet';
import { StationSelector } from './components/StationSelector';
import { StationSelectorSkeleton } from './components/StationSelectorSkeleton';
import {
    getInitialTimeSelection,
    getScheduleDate,
    getScheduleTime,
    TimeSelector,
    type TimeSelection,
} from './components/TimeSelector';
import { TrainBoardingPanel } from './components/TrainBoardingPanel';
import { storyStations } from './fixtures/storyFixtures';
import { usePersistence } from './hooks/usePersistence';
import { useI18n } from './i18n/useI18n';
import {
    getDefaultShareMessageTemplate,
    resolveStoredShareMessageTemplate,
} from './shareMessage';
import type { Station, TrainInfo } from './types';

function formatEnglishStationName(name?: string) {
    return name?.replace(/_/g, ' ');
}

const EMPTY_TIME_SELECTION: TimeSelection = {
    mode: 'departure',
    dateDigits: '',
    timeDigits: '',
};
const NATIVE_SPLASH_HIDE_FALLBACK_MS = 240;
const SHARE_MESSAGE_FORMAT_KEY = 'ontrack_share_message_format';
const ELECTRONIC_TICKET_ONLY_KEY = 'ontrack_electronic_ticket_only';
const APPEARANCE_MODE_KEY = 'ontrack_appearance';
const LEGACY_DARK_MODE_KEY = 'ontrack_dark_mode';
const THEME_COLOR_BY_MODE = {
    light: '#ffffff',
    dark: '#1e293b',
} satisfies Record<'light' | 'dark', string>;

type SelectedTrainState = {
    scheduleKey: string;
    train: TrainInfo;
};

function getStoredShareMessageTemplate(language: 'zh-TW' | 'en'): string {
    if (typeof window === 'undefined') {
        return getDefaultShareMessageTemplate(language);
    }

    const stored = window.localStorage.getItem(SHARE_MESSAGE_FORMAT_KEY);

    return resolveStoredShareMessageTemplate(stored, language);
}

function getStoredAppearanceMode(): AppearanceMode {
    if (typeof window === 'undefined') {
        return 'light';
    }

    const stored = window.localStorage.getItem(APPEARANCE_MODE_KEY);

    if (stored === 'system' || stored === 'light' || stored === 'dark') {
        return stored;
    }

    const legacyDarkMode = window.localStorage.getItem(LEGACY_DARK_MODE_KEY);

    if (legacyDarkMode !== null) {
        return legacyDarkMode === 'true' ? 'dark' : 'light';
    }

    return 'light';
}

function getStoredElectronicTicketOnly(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    return window.localStorage.getItem(ELECTRONIC_TICKET_ONLY_KEY) === 'true';
}

function getResolvedAppearanceMode(mode: AppearanceMode) {
    if (mode !== 'system') {
        return mode;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
}

function setBrowserThemeColor(mode: 'light' | 'dark') {
    document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', THEME_COLOR_BY_MODE[mode]);
}

function getShowcaseTimeSelection(): TimeSelection {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return {
        mode: 'departure',
        dateDigits: `${month}${day}`,
        timeDigits: '0910',
    };
}

function App() {
    const { t, language } = useI18n();
    const {
        originId,
        setOriginId,
        destId,
        setDestId,
        autoDetectOrigin,
        setAutoDetectOrigin,
    } = usePersistence();

    const [stations, setStations] = useState<Station[]>([]);
    const [selectedTrainState, setSelectedTrainState] =
        useState<SelectedTrainState | null>(null);
    const [timeSelection, setTimeSelection] =
        useState<TimeSelection>(EMPTY_TIME_SELECTION);
    const [stationsLoading, setStationsLoading] = useState(true);
    const [stationsError, setStationsError] = useState<string | null>(null);
    const [liveRefreshNonce, setLiveRefreshNonce] = useState(0);
    const [isRefreshingLive, setIsRefreshingLive] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [appearanceMode, setAppearanceMode] =
        useState<AppearanceMode>('light');
    const [electronicTicketOnly, setElectronicTicketOnly] = useState(false);
    const [shareMessageTemplate, setShareMessageTemplate] = useState(
        getDefaultShareMessageTemplate('zh-TW')
    );
    const hasAppliedShowcaseRouteRef = useRef(false);

    useEffect(() => {
        api.getStations()
            .then(setStations)
            .catch((error) => {
                console.error(error);
                setStations([]);
                setStationsError(
                    getUserSafeErrorMessage(
                        error,
                        t,
                        'error.failedToLoadStations'
                    )
                );
            })
            .finally(() => setStationsLoading(false));
    }, [t]);

    useEffect(() => {
        if (isShowcaseMode()) {
            const timer = window.setTimeout(() => {
                setTimeSelection(getShowcaseTimeSelection());
            }, 0);

            return () => window.clearTimeout(timer);
        }

        const timer = window.setTimeout(() => {
            setTimeSelection((currentTimeSelection) =>
                currentTimeSelection.dateDigits.length === 4 &&
                currentTimeSelection.timeDigits.length === 4
                    ? currentTimeSelection
                    : getInitialTimeSelection()
            );
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!isShowcaseMode() || hasAppliedShowcaseRouteRef.current) {
            return;
        }

        hasAppliedShowcaseRouteRef.current = true;
        const timer = window.setTimeout(() => {
            setOriginId(storyStations[0].id);
            setDestId(storyStations[2].id);
            setAutoDetectOrigin(true);
        }, 0);

        return () => window.clearTimeout(timer);
    }, [setAutoDetectOrigin, setDestId, setOriginId]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setAppearanceMode(getStoredAppearanceMode());
            setElectronicTicketOnly(getStoredElectronicTicketOnly());
            setShareMessageTemplate(getStoredShareMessageTemplate(language));
        }, 0);

        return () => window.clearTimeout(timer);
    }, [language]);

    useEffect(() => {
        const colorSchemeQuery = window.matchMedia(
            '(prefers-color-scheme: dark)'
        );
        const applyAppearance = () => {
            const resolvedMode = getResolvedAppearanceMode(appearanceMode);

            document.documentElement.dataset.appearance = appearanceMode;
            document.documentElement.dataset.theme = resolvedMode;
            document.documentElement.style.colorScheme = resolvedMode;
            setBrowserThemeColor(resolvedMode);
        };

        applyAppearance();

        if (appearanceMode !== 'system') {
            return;
        }

        colorSchemeQuery.addEventListener('change', applyAppearance);

        return () => {
            colorSchemeQuery.removeEventListener('change', applyAppearance);
        };
    }, [appearanceMode]);

    useEffect(() => {
        if ('serviceWorker' in navigator) {
            void navigator.serviceWorker.register('/sw.js');
        }
    }, []);

    useEffect(() => {
        const nativeSplash = document.getElementById('native-splash');
        if (!nativeSplash) {
            return;
        }

        let secondFrame = 0;
        const hideSplash = () => {
            nativeSplash.style.display = 'none';
        };
        const firstFrame = window.requestAnimationFrame(() => {
            secondFrame = window.requestAnimationFrame(hideSplash);
        });
        const fallbackTimer = window.setTimeout(
            hideSplash,
            NATIVE_SPLASH_HIDE_FALLBACK_MS
        );

        return () => {
            window.cancelAnimationFrame(firstFrame);
            window.cancelAnimationFrame(secondFrame);
            window.clearTimeout(fallbackTimer);
        };
    }, []);

    const stationMap = useMemo(
        () =>
            new Map(
                stations.map((station): [string, Station] => [
                    station.id,
                    station,
                ])
            ),
        [stations]
    );

    const originStation = stationMap.get(originId);
    const destStation = stationMap.get(destId);

    const isEn = language === 'en';
    const originName =
        (isEn
            ? formatEnglishStationName(originStation?.nameEn)
            : originStation?.name) || originId;
    const destName =
        (isEn
            ? formatEnglishStationName(destStation?.nameEn)
            : destStation?.name) || destId;
    const scheduleDate = getScheduleDate(timeSelection.dateDigits);
    const scheduleTime = getScheduleTime(
        timeSelection.timeDigits,
        timeSelection.mode
    );
    const isTimeInitialized =
        timeSelection.dateDigits.length === 4 &&
        timeSelection.timeDigits.length === 4;
    const canLoadSchedule = Boolean(isTimeInitialized && originId && destId);
    const canRefreshLive = canLoadSchedule;
    const scheduleSelectionKey = [
        originId,
        destId,
        scheduleDate,
        scheduleTime,
        timeSelection.mode,
        electronicTicketOnly,
    ].join('-');
    const selectedTrain =
        selectedTrainState?.scheduleKey === scheduleSelectionKey
            ? selectedTrainState.train
            : null;
    const handleSetShareMessageTemplate = (template: string) => {
        setShareMessageTemplate(template);
        window.localStorage.setItem(SHARE_MESSAGE_FORMAT_KEY, template);
    };
    const handleSetAppearanceMode = (mode: AppearanceMode) => {
        setAppearanceMode(mode);
        window.localStorage.setItem(APPEARANCE_MODE_KEY, mode);
        window.localStorage.removeItem(LEGACY_DARK_MODE_KEY);
    };
    const handleSetElectronicTicketOnly = (enabled: boolean) => {
        setElectronicTicketOnly(enabled);
        window.localStorage.setItem(
            ELECTRONIC_TICKET_ONLY_KEY,
            String(enabled)
        );
    };
    const handleSelectTrain = (train: TrainInfo) => {
        setSelectedTrainState({
            scheduleKey: scheduleSelectionKey,
            train,
        });
    };

    return (
        <>
            <SettingsSheet
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                appearanceMode={appearanceMode}
                onAppearanceModeChange={handleSetAppearanceMode}
                electronicTicketOnly={electronicTicketOnly}
                onElectronicTicketOnlyChange={handleSetElectronicTicketOnly}
                messageTemplate={shareMessageTemplate}
                onMessageTemplateChange={handleSetShareMessageTemplate}
            />
            <div className='app-container'>
                <main className='app-main'>
                    <div className='app-toolbar'>
                        <button
                            type='button'
                            className='app-toolbar-button'
                            onClick={() =>
                                setLiveRefreshNonce((value) => value + 1)
                            }
                            disabled={!canRefreshLive || isRefreshingLive}
                            aria-label={t('train.refreshLiveStatus')}
                            title={t('train.refreshLiveStatus')}
                        >
                            <RefreshCw
                                className={
                                    isRefreshingLive ? 'is-spinning' : ''
                                }
                                aria-hidden='true'
                            />
                        </button>

                        <TimeSelector
                            value={timeSelection}
                            onChange={setTimeSelection}
                        />

                        <button
                            type='button'
                            className='app-toolbar-button'
                            onClick={() => setIsSettingsOpen(true)}
                            aria-label={t('settings.title')}
                            title={t('settings.title')}
                        >
                            <Settings aria-hidden='true' />
                        </button>
                    </div>

                    <section aria-label={t('app.selectRoute')}>
                        {stationsLoading ? (
                            <StationSelectorSkeleton />
                        ) : stationsError ? (
                            <div className='card-panel app-load-error'>
                                <div className='app-load-error-message'>
                                    {stationsError}
                                </div>
                            </div>
                        ) : (
                            <StationSelector
                                stations={stations}
                                originId={originId}
                                setOriginId={setOriginId}
                                destId={destId}
                                setDestId={setDestId}
                                autoDetectOrigin={autoDetectOrigin}
                                setAutoDetectOrigin={setAutoDetectOrigin}
                            />
                        )}
                    </section>

                    <TrainBoardingPanel
                        canLoadSchedule={canLoadSchedule}
                        originId={originId}
                        destId={destId}
                        originName={originName}
                        destName={destName}
                        date={scheduleDate}
                        time={scheduleTime}
                        timeMode={timeSelection.mode}
                        selectedTrain={selectedTrain}
                        electronicTicketOnly={electronicTicketOnly}
                        messageTemplate={shareMessageTemplate}
                        onSelectTrain={handleSelectTrain}
                        refreshLiveNonce={liveRefreshNonce}
                        onRefreshingLiveChange={setIsRefreshingLive}
                    />
                </main>
            </div>
        </>
    );
}

export default App;
