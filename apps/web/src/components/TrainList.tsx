import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, getUserSafeErrorMessage } from '../api/client';
import { useI18n } from '../i18n/useI18n';
import { supportsElectronicTicket } from '../trainEligibility';
import type { TrainInfo } from '../types';
import type { TimeMode } from './TimeSelector';
import { TrainListSkeleton } from './TrainListSkeleton';

import './TrainList.css';

const SCHEDULE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const SCHEDULE_WARMING_RETRY_MS = 4 * 1000;

/**
 * Chinese → English abbreviated train type mapping.
 * Based on official Taiwan Railway service classes.
 */
const TRAIN_TYPE_EN: Record<string, string> = {
    自強: 'TC', // Tze-Chiang
    莒光: 'CK', // Chu-Kuang
    區間: 'Local',
    區間快: 'F.Local', // Fast Local
    太魯閣: 'Taroko',
    普悠瑪: 'Puyuma',
    新自強: 'N.TC', // New Tze-Chiang (EMU3000)
};

const PRIMARY_TRAIN_TYPES = new Set(['自強', '太魯閣', '普悠瑪', '新自強']);

function getTrainTypeBase(trainType: string): string {
    return trainType.split('(')[0].replace(/號$/, '');
}

/**
 * Parse train type to extract simple term, with optional English mapping.
 * Examples (zh-TW): "自強(商務專開列車)" → "自強"
 * Examples (en):    "自強(商務專開列車)" → "TC"
 */
export function parseTrainType(trainType: string, lang?: string): string {
    const base = getTrainTypeBase(trainType);
    if (lang === 'en') {
        return TRAIN_TYPE_EN[base] ?? base;
    }
    return base;
}

type TrainTypeEmphasis = 'neutral' | 'mixed' | 'primary';

function getTrainTypeEmphasis(trainType: string): TrainTypeEmphasis {
    const base = getTrainTypeBase(trainType);

    if (PRIMARY_TRAIN_TYPES.has(base)) {
        return 'primary';
    }

    if (base === '區間快') {
        return 'mixed';
    }

    return 'neutral';
}

/** Add minutes to a HH:mm time string */
export function addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const newH = Math.floor(total / 60) % 24;
    const newM = total % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function getEffectiveDepartureMinutes(train: TrainInfo): number {
    return timeToMinutes(train.departureTime) + (train.delay ?? 0);
}

/** Calculate trip duration in minutes between two HH:mm strings */
function getTripMinutes(departure: string, arrival: string): number {
    const [dh, dm] = departure.split(':').map(Number);
    const [ah, am] = arrival.split(':').map(Number);
    let diff = ah * 60 + am - (dh * 60 + dm);
    if (diff < 0) diff += 24 * 60; // crosses midnight
    return diff;
}

function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function formatPrice(price?: number | null): string | null {
    return price == null ? null : `NT$${price.toLocaleString('en-US')}`;
}

export function buildDisplayState(
    trains: TrainInfo[],
    targetTime: string,
    timeMode: TimeMode
) {
    const targetTimeMinutes = timeToMinutes(targetTime);
    const getScheduledMinutes =
        timeMode === 'arrival'
            ? (train: TrainInfo) => timeToMinutes(train.arrivalTime)
            : (train: TrainInfo) => timeToMinutes(train.departureTime);
    const getComparisonMinutes =
        timeMode === 'arrival'
            ? (train: TrainInfo) => timeToMinutes(train.arrivalTime)
            : getEffectiveDepartureMinutes;
    const orderedTrains =
        timeMode === 'arrival'
            ? [...trains].sort(
                  (a, b) => getScheduledMinutes(a) - getScheduledMinutes(b)
              )
            : trains;

    const nextScheduledTrainIndex = orderedTrains.findIndex(
        (train) => getScheduledMinutes(train) >= targetTimeMinutes
    );
    const nextCatchableTrainIndex = orderedTrains.findIndex(
        (train) => getComparisonMinutes(train) >= targetTimeMinutes
    );

    let displayTrains: TrainInfo[] = [];
    let recommendedTrain: TrainInfo | null = null;

    if (nextCatchableTrainIndex === -1) {
        displayTrains = orderedTrains.slice(-3);
        recommendedTrain = displayTrains[displayTrains.length - 1] ?? null;
    } else {
        const start = Math.max(0, nextCatchableTrainIndex - 1);
        const minimumEnd = start + 3;
        const scheduledContextEnd =
            nextScheduledTrainIndex === -1
                ? minimumEnd
                : nextScheduledTrainIndex + 2;
        const end = Math.max(minimumEnd, scheduledContextEnd);

        displayTrains = orderedTrains.slice(start, end);
        recommendedTrain = orderedTrains[nextCatchableTrainIndex] ?? null;
    }

    return { displayTrains, recommendedTrain };
}

interface TrainListProps {
    originId: string;
    destId: string;
    date: string;
    time: string;
    timeMode: TimeMode;
    electronicTicketOnly: boolean;
    onSelect: (train: TrainInfo) => void;
    selectedTrainNo: string | null;
    refreshLiveNonce?: number;
    onRefreshingLiveChange?: (isRefreshing: boolean) => void;
    showHeading?: boolean;
}

export function TrainList({
    originId,
    destId,
    date,
    time,
    timeMode,
    electronicTicketOnly,
    onSelect,
    selectedTrainNo,
    refreshLiveNonce = 0,
    onRefreshingLiveChange,
    showHeading = true,
}: TrainListProps) {
    const { t, language } = useI18n();
    const [allTrains, setAllTrains] = useState<TrainInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [warmingRetryNonce, setWarmingRetryNonce] = useState(0);
    const lastFetchTimeRef = useRef<number | null>(null);
    const lastFetchParamsRef = useRef<string>('');
    const requestIdRef = useRef(0);
    const lastRefreshLiveNonceRef = useRef(refreshLiveNonce);
    const warmingRetryTimerRef = useRef<number | null>(null);

    const fetchSchedule = useCallback(
        (options: { refreshLive?: boolean } = {}) => {
            if (!originId || !destId) return;
            const isManualLiveRefresh = options.refreshLive === true;

            if (warmingRetryTimerRef.current) {
                window.clearTimeout(warmingRetryTimerRef.current);
                warmingRetryTimerRef.current = null;
            }

            // Prevent duplicate requests
            const currentParams = `${originId}-${destId}-${date}`;
            if (
                !isManualLiveRefresh &&
                lastFetchParamsRef.current === currentParams &&
                lastFetchTimeRef.current &&
                Date.now() - lastFetchTimeRef.current < 3000
            ) {
                console.log('Skipping duplicate request within 3 seconds');
                return;
            }

            const requestId = requestIdRef.current + 1;
            requestIdRef.current = requestId;
            lastFetchParamsRef.current = currentParams;
            setLoading(allTrains.length === 0);
            setError(null);
            if (isManualLiveRefresh) {
                onRefreshingLiveChange?.(true);
            }

            api.getSchedule(originId, destId, date, {
                refreshLive: isManualLiveRefresh,
            })
                .then((res) => {
                    if (requestId !== requestIdRef.current) {
                        return;
                    }

                    setAllTrains(res.trains);
                    lastFetchTimeRef.current = Date.now();

                    if (res.meta?.scheduleCacheStatus === 'warming') {
                        setLoading(true);
                        warmingRetryTimerRef.current = window.setTimeout(() => {
                            warmingRetryTimerRef.current = null;
                            setWarmingRetryNonce((value) => value + 1);
                        }, SCHEDULE_WARMING_RETRY_MS);
                        return;
                    }

                    setLoading(false);
                })
                .catch((err) => {
                    if (requestId !== requestIdRef.current) {
                        return;
                    }

                    console.error(err);
                    setError(
                        getUserSafeErrorMessage(
                            err,
                            t,
                            'error.failedToLoadSchedule'
                        )
                    );
                    setLoading(false);
                })
                .finally(() => {
                    if (isManualLiveRefresh) {
                        onRefreshingLiveChange?.(false);
                    }
                });
        },
        [originId, destId, date, allTrains.length, onRefreshingLiveChange, t]
    );

    useEffect(() => {
        const initialFetchTimer = window.setTimeout(() => {
            fetchSchedule();
        }, 0);

        // Match the Worker live-board sync cadence.
        const interval = setInterval(() => {
            fetchSchedule();
        }, SCHEDULE_REFRESH_INTERVAL_MS);

        return () => {
            window.clearTimeout(initialFetchTimer);
            if (warmingRetryTimerRef.current) {
                window.clearTimeout(warmingRetryTimerRef.current);
                warmingRetryTimerRef.current = null;
            }
            clearInterval(interval);
        };
    }, [fetchSchedule, warmingRetryNonce]);

    useEffect(() => {
        if (lastRefreshLiveNonceRef.current === refreshLiveNonce) {
            return;
        }

        lastRefreshLiveNonceRef.current = refreshLiveNonce;
        const refreshTimer = window.setTimeout(() => {
            fetchSchedule({ refreshLive: true });
        }, 0);

        return () => window.clearTimeout(refreshTimer);
    }, [fetchSchedule, refreshLiveNonce]);

    const eligibleTrains = useMemo(
        () =>
            electronicTicketOnly
                ? allTrains.filter((train) => supportsElectronicTicket(train))
                : allTrains,
        [allTrains, electronicTicketOnly]
    );
    const { displayTrains, recommendedTrain } = useMemo(
        () => buildDisplayState(eligibleTrains, time, timeMode),
        [eligibleTrains, time, timeMode]
    );

    useEffect(() => {
        if (recommendedTrain) {
            onSelect(recommendedTrain);
        }
    }, [recommendedTrain, onSelect]);

    if (!originId || !destId) return null;

    return (
        <section
            aria-labelledby={showHeading ? 'train-list-heading' : undefined}
            aria-label={!showHeading ? t('app.selectTrain') : undefined}
        >
            {showHeading && (
                <h2 id='train-list-heading' className='label-dim'>
                    {t('app.selectTrain')}
                </h2>
            )}

            {error ? (
                <div className='card-panel train-list-error'>
                    <div className='train-list-error-message'>{error}</div>
                </div>
            ) : loading ? (
                <TrainListSkeleton showLabel={false} />
            ) : displayTrains.length === 0 ? (
                <div className='train-list-empty'>
                    {t('train.noTrainsAvailable')}
                </div>
            ) : (
                <div className='train-list-container'>
                    {displayTrains.map((train) => {
                        const trainData = train as TrainInfo;
                        const isSelected =
                            trainData.trainNo === selectedTrainNo;
                        const isDelayed = (trainData.delay ?? 0) > 0;
                        const tripMin = getTripMinutes(
                            trainData.departureTime,
                            trainData.arrivalTime
                        );
                        const trainType = parseTrainType(
                            trainData.trainType,
                            language
                        );
                        const trainTypeEmphasis = getTrainTypeEmphasis(
                            trainData.trainType
                        );
                        const price = formatPrice(trainData.price);
                        const tripLine =
                            trainData.tripLine === 1
                                ? t('train.mountainLine')
                                : trainData.tripLine === 2
                                  ? t('train.coastLine')
                                  : null;
                        const delayStatus = isDelayed
                            ? t('train.delayedBy', {
                                  minutes: trainData.delay ?? 0,
                              })
                            : t('train.onTime');
                        const trainLabel = [
                            isSelected ? t('train.selected') : '',
                            `${trainType} ${trainData.trainNo}`,
                            t('train.departureAt', {
                                time: trainData.departureTime,
                            }),
                            t('train.arrivalAt', {
                                time: trainData.arrivalTime,
                            }),
                            t('train.duration', {
                                duration: formatDuration(tripMin),
                            }),
                            price ? t('train.fare', { price }) : '',
                            tripLine ?? '',
                            delayStatus,
                        ]
                            .filter(Boolean)
                            .join(language === 'en' ? ', ' : '，');

                        return (
                            <button
                                key={trainData.trainNo}
                                type='button'
                                className={`card-panel clickable-item train-card ${isSelected ? 'selected' : ''}`}
                                onClick={() => onSelect(trainData)}
                                aria-pressed={isSelected}
                                aria-label={trainLabel}
                            >
                                <div className='train-card-times'>
                                    <span
                                        className={`train-card-time-cell ${isDelayed ? 'delayed' : ''}`}
                                    >
                                        <span className='train-card-time-value'>
                                            {isDelayed && (
                                                <span className='train-card-delayed-time'>
                                                    {addMinutes(
                                                        trainData.departureTime,
                                                        trainData.delay!
                                                    )}
                                                </span>
                                            )}
                                            <span
                                                className={
                                                    isDelayed
                                                        ? 'train-card-original-time'
                                                        : 'train-card-departure-time'
                                                }
                                            >
                                                {trainData.departureTime}
                                            </span>
                                        </span>
                                    </span>
                                    <div className='train-card-separator'>
                                        <span className='train-card-line' />
                                        <span className='train-card-trip-time'>
                                            {formatDuration(tripMin)}
                                        </span>
                                        <span className='train-card-line' />
                                    </div>
                                    <span
                                        className={`train-card-time-cell ${isDelayed ? 'delayed' : ''}`}
                                    >
                                        <span className='train-card-time-value'>
                                            {isDelayed && (
                                                <span className='train-card-delayed-time'>
                                                    {addMinutes(
                                                        trainData.arrivalTime,
                                                        trainData.delay!
                                                    )}
                                                </span>
                                            )}
                                            <span
                                                className={
                                                    isDelayed
                                                        ? 'train-card-original-time'
                                                        : 'train-card-arrival-time'
                                                }
                                            >
                                                {trainData.arrivalTime}
                                            </span>
                                        </span>
                                    </span>
                                </div>
                                <span className='train-card-price'>
                                    {price}
                                </span>
                                <div className='train-card-info'>
                                    <span className='train-card-identifier'>
                                        <span
                                            className={`train-card-type train-card-type-${trainTypeEmphasis}`}
                                        >
                                            {trainType}
                                        </span>{' '}
                                        {trainData.trainNo}
                                    </span>
                                </div>
                                <span className='train-card-route'>
                                    {tripLine}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
