import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Moon, TimerReset } from 'lucide-react';

import { useI18n } from '../i18n/useI18n';
import { useModal } from '../native/useModal';

import './TimeSelector.css';

export type TimeMode = 'now' | 'departure' | 'arrival' | 'lastTrain';

export interface TimeSelection {
    mode: TimeMode;
    dateDigits: string;
    timeDigits: string;
}

const DATE_DIGIT_COUNT = 4;
const TIME_DIGIT_COUNT = 4;
const FUTURE_DATE_RANGE_DAYS = 7;
const LAST_TRAIN_TIME_DIGITS = '2359';
const TIME_PICKER_MINUTE_INTERVAL = 10;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from(
    { length: 60 / TIME_PICKER_MINUTE_INTERVAL },
    (_, index) => index * TIME_PICKER_MINUTE_INTERVAL
);
type WheelTimePart = 'day' | 'hour' | 'minute';

function getTodayDate() {
    const today = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' })
    );

    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function addDays(date: Date, dayOffset: number) {
    const nextDate = new Date(date);

    nextDate.setDate(nextDate.getDate() + dayOffset);

    return nextDate;
}

function formatDateDigits(date: Date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${month}${day}`;
}

function getScheduleDateRange() {
    const minDate = getTodayDate();
    const maxDate = addDays(minDate, FUTURE_DATE_RANGE_DAYS);

    return {
        minDate,
        maxDate,
    };
}

function getTodayDigits() {
    return formatDateDigits(getTodayDate());
}

function getCurrentTimeDigits() {
    return new Date()
        .toLocaleTimeString('en-CA', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Taipei',
        })
        .replace(':', '');
}

function getCurrentDateTimeSelection(mode: TimeMode): TimeSelection {
    return {
        mode,
        dateDigits: getTodayDigits(),
        timeDigits:
            mode === 'lastTrain'
                ? LAST_TRAIN_TIME_DIGITS
                : getCurrentTimeDigits(),
    };
}

function parseScheduleDateDigits(dateDigits: string) {
    const { minDate, maxDate } = getScheduleDateRange();
    const year = minDate.getFullYear();
    const month = Number(dateDigits.slice(0, 2));
    const day = Number(dateDigits.slice(2, 4));

    if (dateDigits.length !== DATE_DIGIT_COUNT) {
        return null;
    }

    const candidates = [year, year + 1].map(
        (candidateYear) => new Date(candidateYear, month - 1, day)
    );
    const selectedDate =
        candidates.find(
            (candidate) =>
                candidate.getMonth() === month - 1 &&
                candidate.getDate() === day &&
                candidate.getTime() >= minDate.getTime()
        ) ?? null;

    if (selectedDate === null || selectedDate.getTime() > maxDate.getTime()) {
        return null;
    }

    return selectedDate;
}

function parseDateDigits(dateDigits: string) {
    return parseScheduleDateDigits(dateDigits) ?? getTodayDate();
}

function getDateOffset(dateDigits: string) {
    const { minDate } = getScheduleDateRange();
    const selectedDate = parseScheduleDateDigits(dateDigits);

    if (selectedDate === null) return 0;

    return Math.round(
        (selectedDate.getTime() - minDate.getTime()) / 86_400_000
    );
}

function getDateDigitsAtOffset(dayOffset: number) {
    const { minDate } = getScheduleDateRange();
    const normalizedOffset = Math.min(
        FUTURE_DATE_RANGE_DAYS,
        Math.max(0, dayOffset)
    );

    return formatDateDigits(addDays(minDate, normalizedOffset));
}

function getDateAtOffset(dayOffset: number) {
    const { minDate } = getScheduleDateRange();

    return addDays(minDate, dayOffset);
}

function normalizeSelection(value: TimeSelection): TimeSelection {
    if (
        parseScheduleDateDigits(value.dateDigits) !== null &&
        value.timeDigits.length === TIME_DIGIT_COUNT
    ) {
        return value;
    }

    return getCurrentDateTimeSelection(value.mode);
}

function getTimeParts(timeDigits: string) {
    const fallback = getCurrentTimeDigits();
    const digits =
        timeDigits.length === TIME_DIGIT_COUNT ? timeDigits : fallback;
    const hour = Number(digits.slice(0, 2));
    const minute = Number(digits.slice(2, 4));

    if (hour > 23 || minute > 59) {
        return getTimeParts(fallback);
    }

    return { hour, minute };
}

function getWheelTimeParts(timeDigits: string) {
    const { hour, minute } = getTimeParts(timeDigits);
    const snappedMinute =
        Math.round(minute / TIME_PICKER_MINUTE_INTERVAL) *
        TIME_PICKER_MINUTE_INTERVAL;

    if (snappedMinute >= 60) {
        return {
            hour: (hour + 1) % 24,
            minute: 0,
        };
    }

    return {
        hour,
        minute: snappedMinute,
    };
}

function formatTime(hour: number, minute: number) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatTimeDigits(hour: number, minute: number) {
    return `${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
}

function getCenteredWheelValue(wheel: HTMLDivElement) {
    const wheelRect = wheel.getBoundingClientRect();
    const wheelCenterY = wheelRect.top + wheelRect.height / 2;
    const options = Array.from(
        wheel.querySelectorAll<HTMLButtonElement>('[data-time-value]')
    );
    let centeredValue: number | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const option of options) {
        const optionRect = option.getBoundingClientRect();
        const optionCenterY = optionRect.top + optionRect.height / 2;
        const distance = Math.abs(optionCenterY - wheelCenterY);
        const optionValue = Number(option.dataset.timeValue);

        if (Number.isNaN(optionValue) || distance >= closestDistance) {
            continue;
        }

        centeredValue = optionValue;
        closestDistance = distance;
    }

    return centeredValue;
}

export function getInitialTimeSelection(): TimeSelection {
    return getCurrentDateTimeSelection('now');
}

export function getScheduleDate(dateDigits: string) {
    const selectedDate = parseDateDigits(dateDigits);
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;
    const date = selectedDate.getDate();

    return `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

export function getScheduleTime(
    timeDigits: string,
    mode: TimeMode = 'departure'
) {
    if (mode === 'lastTrain') {
        return formatTime(23, 59);
    }

    const { hour, minute } = getTimeParts(timeDigits);

    return formatTime(hour, minute);
}

interface TimeSelectorProps {
    value: TimeSelection;
    onChange: (value: TimeSelection) => void;
}

export function TimeSelector({ value, onChange }: TimeSelectorProps) {
    const { t, language } = useI18n();
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [draft, setDraft] = useState<TimeSelection>(() =>
        normalizeSelection(value)
    );
    const draftRef = useRef(draft);
    const dayListRef = useRef<HTMLDivElement>(null);
    const hourListRef = useRef<HTMLDivElement>(null);
    const minuteListRef = useRef<HTMLDivElement>(null);
    const isAligningWheelRef = useRef(false);
    const wheelAlignReleaseTimerRef = useRef<number | null>(null);
    const wheelScrollFrameRef = useRef<Record<WheelTimePart, number | null>>({
        day: null,
        hour: null,
        minute: null,
    });

    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);

    const modeOptions = useMemo(
        () =>
            [
                {
                    value: 'departure' as const,
                    label: t('time.departureTime'),
                    shortLabel: t('time.departure'),
                },
                {
                    value: 'arrival' as const,
                    label: t('time.arrivalTime'),
                    shortLabel: t('time.arrival'),
                },
            ] satisfies {
                value: TimeMode;
                label: string;
                shortLabel: string;
            }[],
        [t]
    );

    const dateOptions = (() => {
        const dateFormatter = new Intl.DateTimeFormat(language, {
            month: '2-digit',
            day: '2-digit',
        });

        return Array.from(
            { length: FUTURE_DATE_RANGE_DAYS + 1 },
            (_, dayOffset) => {
                const date = getDateAtOffset(dayOffset);

                return {
                    dayOffset,
                    dateDigits: getDateDigitsAtOffset(dayOffset),
                    dateLabel: dateFormatter.format(date),
                };
            }
        );
    })();

    useEffect(() => {
        const syncNowSelection = () => {
            if (value.mode === 'now') {
                onChange(getCurrentDateTimeSelection('now'));
            }
        };
        const initialTimer = window.setTimeout(syncNowSelection, 0);
        const interval = window.setInterval(syncNowSelection, 30000);

        return () => {
            window.clearTimeout(initialTimer);
            window.clearInterval(interval);
        };
    }, [onChange, value.mode]);

    const scrollWheelsToSelection = useCallback((selection: TimeSelection) => {
        isAligningWheelRef.current = true;

        if (wheelAlignReleaseTimerRef.current !== null) {
            window.clearTimeout(wheelAlignReleaseTimerRef.current);
        }

        const dayOffset = getDateOffset(selection.dateDigits);
        const { hour, minute } = getWheelTimeParts(selection.timeDigits);

        dayListRef.current
            ?.querySelector(`[data-time-value="${dayOffset}"]`)
            ?.scrollIntoView({ block: 'center' });
        hourListRef.current
            ?.querySelector(`[data-time-value="${hour}"]`)
            ?.scrollIntoView({ block: 'center' });
        minuteListRef.current
            ?.querySelector(`[data-time-value="${minute}"]`)
            ?.scrollIntoView({ block: 'center' });

        wheelAlignReleaseTimerRef.current = window.setTimeout(() => {
            isAligningWheelRef.current = false;
            wheelAlignReleaseTimerRef.current = null;
        }, 120);
    }, []);

    useEffect(() => {
        if (!isEditorOpen) return;

        const frame = window.requestAnimationFrame(() => {
            scrollWheelsToSelection(draftRef.current);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [isEditorOpen, scrollWheelsToSelection]);

    useEffect(
        () => () => {
            if (wheelAlignReleaseTimerRef.current !== null) {
                window.clearTimeout(wheelAlignReleaseTimerRef.current);
            }

            for (const frame of Object.values(wheelScrollFrameRef.current)) {
                if (frame !== null) {
                    window.cancelAnimationFrame(frame);
                }
            }
        },
        []
    );

    const normalizedValue = normalizeSelection(value);
    const { hour, minute } = getTimeParts(normalizedValue.timeDigits);
    const { hour: draftHour, minute: draftMinute } = getWheelTimeParts(
        draft.timeDigits
    );
    const isNowSelected = normalizedValue.mode === 'now';
    const draftDateOffset = getDateOffset(draft.dateDigits);
    const modeLabel =
        normalizedValue.mode === 'lastTrain'
            ? t('time.lastTrain')
            : (modeOptions.find(
                  (option) => option.value === normalizedValue.mode
              )?.shortLabel ?? t('time.departure'));
    const title = isNowSelected
        ? t('time.leaveNow')
        : normalizedValue.mode === 'lastTrain'
          ? `${modeLabel} ${getScheduleDate(normalizedValue.dateDigits)}`
          : `${modeLabel} ${formatTime(hour, minute)}`;

    const openEditor = () => {
        draftRef.current = normalizedValue;
        setDraft(normalizedValue);
        setIsEditorOpen(true);
    };

    const closeEditor = useCallback(() => {
        setIsEditorOpen(false);
    }, []);

    const modalRef = useModal(isEditorOpen, closeEditor);

    const handleSetNow = () => {
        const nextSelection = getCurrentDateTimeSelection('now');
        draftRef.current = nextSelection;
        setDraft(nextSelection);
        window.requestAnimationFrame(() =>
            scrollWheelsToSelection(nextSelection)
        );
    };

    const handleSetLastTrain = () => {
        const nextSelection = {
            ...draftRef.current,
            mode: 'lastTrain' as const,
            timeDigits: LAST_TRAIN_TIME_DIGITS,
        };

        draftRef.current = nextSelection;
        setDraft(nextSelection);
    };

    const handleSetDateOffset = (
        dayOffset: number,
        options: { alignWheel?: boolean } = {}
    ) => {
        const nextSelection = {
            ...draftRef.current,
            mode:
                draftRef.current.mode === 'now'
                    ? ('departure' as const)
                    : draftRef.current.mode,
            dateDigits: getDateDigitsAtOffset(dayOffset),
        };

        draftRef.current = nextSelection;
        setDraft(nextSelection);

        if (options.alignWheel !== false) {
            window.requestAnimationFrame(() =>
                scrollWheelsToSelection(nextSelection)
            );
        }
    };

    const handleSetMode = (mode: TimeMode) => {
        const nextSelection = {
            ...draftRef.current,
            mode,
            timeDigits:
                mode === 'lastTrain'
                    ? LAST_TRAIN_TIME_DIGITS
                    : draftRef.current.timeDigits,
        };

        draftRef.current = nextSelection;
        setDraft(nextSelection);
        window.requestAnimationFrame(() =>
            scrollWheelsToSelection(nextSelection)
        );
    };

    const handleSetTimePart = (
        next: { hour?: number; minute?: number },
        options: { alignWheel?: boolean } = {}
    ) => {
        const currentParts = getWheelTimeParts(draftRef.current.timeDigits);
        const nextHour = next.hour ?? currentParts.hour;
        const nextMinute = next.minute ?? currentParts.minute;
        const nextTimeDigits = formatTimeDigits(nextHour, nextMinute);
        const nextSelection = {
            ...draftRef.current,
            mode:
                draftRef.current.mode === 'now'
                    ? ('departure' as const)
                    : draftRef.current.mode,
            timeDigits: nextTimeDigits,
        };

        draftRef.current = nextSelection;
        setDraft(nextSelection);

        if (options.alignWheel !== false) {
            window.requestAnimationFrame(() =>
                scrollWheelsToSelection(nextSelection)
            );
        }
    };

    const handleWheelScroll = (part: WheelTimePart) => {
        if (isAligningWheelRef.current) return;

        const wheel =
            part === 'day'
                ? dayListRef.current
                : part === 'hour'
                  ? hourListRef.current
                  : minuteListRef.current;

        if (!wheel) return;

        const pendingFrame = wheelScrollFrameRef.current[part];
        if (pendingFrame !== null) {
            window.cancelAnimationFrame(pendingFrame);
        }

        wheelScrollFrameRef.current[part] = window.requestAnimationFrame(() => {
            wheelScrollFrameRef.current[part] = null;
            const centeredValue = getCenteredWheelValue(wheel);

            if (centeredValue === null) return;

            if (part === 'day') {
                handleSetDateOffset(centeredValue, { alignWheel: false });
                return;
            }

            handleSetTimePart(
                part === 'hour'
                    ? { hour: centeredValue }
                    : { minute: centeredValue },
                { alignWheel: false }
            );
        });
    };

    const handleDone = () => {
        const nextSelection = draftRef.current;

        onChange(
            nextSelection.mode === 'now'
                ? getCurrentDateTimeSelection('now')
                : nextSelection
        );
        closeEditor();
    };

    return (
        <div className='time-selector'>
            <button
                type='button'
                className='time-selector-trigger'
                onClick={openEditor}
                aria-label={t('time.selectTime')}
                aria-haspopup='dialog'
                aria-expanded={isEditorOpen}
            >
                <span className='time-selector-trigger-copy'>
                    <span className='time-selector-trigger-title'>{title}</span>
                </span>
                <ChevronDown aria-hidden='true' />
            </button>

            {isEditorOpen && (
                <div className='time-editor-backdrop' onClick={closeEditor}>
                    <div
                        ref={(element) => {
                            modalRef.current = element;
                        }}
                        className='time-editor-sheet'
                        role='dialog'
                        aria-modal='true'
                        aria-labelledby='time-editor-title'
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className='time-editor-handle' />
                        <h2
                            id='time-editor-title'
                            className='time-editor-title'
                        >
                            {t('time.selectTime')}
                        </h2>

                        <div className='time-editor-header'>
                            <button
                                type='button'
                                className={`time-editor-icon-button ${draft.mode === 'now' ? 'active' : ''}`}
                                onClick={handleSetNow}
                                aria-label={t('time.now')}
                            >
                                <TimerReset aria-hidden='true' />
                            </button>

                            <div
                                className={`time-editor-mode-segmented ${
                                    draft.mode === 'now' ? 'is-now-mode' : ''
                                }`}
                                role='radiogroup'
                                aria-label={t('time.mode')}
                            >
                                {modeOptions.map((option) => {
                                    const isActive =
                                        draft.mode === option.value ||
                                        (draft.mode === 'now' &&
                                            option.value === 'departure');

                                    return (
                                        <button
                                            key={option.value}
                                            type='button'
                                            className={`time-editor-mode-option ${isActive ? 'active' : ''}`}
                                            role='radio'
                                            aria-checked={isActive}
                                            onClick={() =>
                                                handleSetMode(option.value)
                                            }
                                        >
                                            <span>{option.shortLabel}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                type='button'
                                className={`time-editor-icon-button ${draft.mode === 'lastTrain' ? 'active' : ''}`}
                                onClick={handleSetLastTrain}
                                aria-label={t('time.lastTrain')}
                            >
                                <Moon aria-hidden='true' />
                            </button>
                        </div>

                        {draft.mode === 'lastTrain' ? (
                            <div className='time-editor-fixed-time'>
                                <Moon aria-hidden='true' />
                                <span>{t('time.queryTodayLastTrain')}</span>
                            </div>
                        ) : (
                            <div className='time-editor-wheels'>
                                <div
                                    ref={dayListRef}
                                    className='time-editor-wheel time-editor-day-wheel'
                                    role='listbox'
                                    aria-label={t('time.date')}
                                    onScroll={() => handleWheelScroll('day')}
                                >
                                    {dateOptions.map((option) => (
                                        <button
                                            key={option.dateDigits}
                                            type='button'
                                            className={`time-editor-wheel-option time-editor-day-option ${draftDateOffset === option.dayOffset ? 'active' : ''}`}
                                            data-time-value={option.dayOffset}
                                            role='option'
                                            aria-selected={
                                                draftDateOffset ===
                                                option.dayOffset
                                            }
                                            onClick={() =>
                                                handleSetDateOffset(
                                                    option.dayOffset
                                                )
                                            }
                                        >
                                            <span>{option.dateLabel}</span>
                                        </button>
                                    ))}
                                </div>

                                <div
                                    ref={hourListRef}
                                    className='time-editor-wheel'
                                    role='listbox'
                                    aria-label={t('time.hour')}
                                    onScroll={() => handleWheelScroll('hour')}
                                >
                                    {HOURS.map((optionHour) => (
                                        <button
                                            key={optionHour}
                                            type='button'
                                            className={`time-editor-wheel-option ${draftHour === optionHour ? 'active' : ''}`}
                                            data-time-value={optionHour}
                                            role='option'
                                            aria-selected={
                                                draftHour === optionHour
                                            }
                                            onClick={() =>
                                                handleSetTimePart({
                                                    hour: optionHour,
                                                })
                                            }
                                        >
                                            {String(optionHour).padStart(
                                                2,
                                                '0'
                                            )}
                                        </button>
                                    ))}
                                </div>

                                <div
                                    ref={minuteListRef}
                                    className='time-editor-wheel'
                                    role='listbox'
                                    aria-label={t('time.minute')}
                                    onScroll={() => handleWheelScroll('minute')}
                                >
                                    {MINUTES.map((optionMinute) => (
                                        <button
                                            key={optionMinute}
                                            type='button'
                                            className={`time-editor-wheel-option ${draftMinute === optionMinute ? 'active' : ''}`}
                                            data-time-value={optionMinute}
                                            role='option'
                                            aria-selected={
                                                draftMinute === optionMinute
                                            }
                                            onClick={() =>
                                                handleSetTimePart({
                                                    minute: optionMinute,
                                                })
                                            }
                                        >
                                            {String(optionMinute).padStart(
                                                2,
                                                '0'
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className='time-editor-actions'>
                            <button type='button' onClick={closeEditor}>
                                {t('common.cancel')}
                            </button>
                            <button type='button' onClick={handleDone}>
                                {t('common.done')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
