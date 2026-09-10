import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { Clock3, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useI18n } from '../i18n/useI18n';
import type { Station } from '../types';
import {
    getFrequentDestinationIdsForOrigin,
    persistFrequentDestinationId,
} from './frequentDestinations';
import {
    filterStationsBySearch,
    isTaipeiCircularStation,
    normalizeEnglishStationName,
    normalizeSearchValue,
    resolvePreferredStationId,
} from './stationSearchUtils';

import './StationDropdown.css';

interface StationDropdownProps {
    stations: Station[];
    searchValue: string;
    setSearchValue: (value: string) => void;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    selectedId: string;
    onSelect: (id: string) => void;
    placeholder: string;
    title: string;
    selectedStation?: Station;
    onCacheSelection?: (id: string) => void;
    triggerAction?: ReactNode;
    TriggerIcon?: LucideIcon;
    showFrequentDestinations?: boolean;
    frequentDestinationOriginId?: string;
    excludedFrequentDestinationId?: string;
}

function shouldAutoFocusSearchInput() {
    if (typeof window === 'undefined') return false;

    return (
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(hover: none), (pointer: coarse)').matches
    );
}

export function StationDropdown({
    stations,
    searchValue,
    setSearchValue,
    isOpen,
    setIsOpen,
    selectedId,
    onSelect,
    placeholder,
    title,
    selectedStation,
    onCacheSelection,
    triggerAction,
    TriggerIcon = Search,
    showFrequentDestinations = false,
    frequentDestinationOriginId = '',
    excludedFrequentDestinationId = '',
}: StationDropdownProps) {
    const { t, language } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    const shouldAutoFocusOnMobile = shouldAutoFocusSearchInput();
    const [frequentDestinationIds, setFrequentDestinationIds] = useState<
        string[]
    >(() =>
        showFrequentDestinations
            ? getFrequentDestinationIdsForOrigin(
                  frequentDestinationOriginId,
                  excludedFrequentDestinationId,
                  stations
              )
            : []
    );

    const trimmedSearchValue = searchValue.trim();

    const getDisplayStationName = (station: Station) =>
        language === 'en' ? station.nameEn.replace(/_/g, ' ') : station.name;

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

    const focusSearchInput = () => {
        window.requestAnimationFrame(() => {
            inputRef.current?.focus();
        });
    };

    const blurSearchInput = useCallback(() => {
        inputRef.current?.blur();
    }, []);

    const handleDismiss = useCallback(() => {
        blurSearchInput();
        setSearchValue('');
        setIsOpen(false);
    }, [blurSearchInput, setIsOpen, setSearchValue]);

    useEffect(() => {
        if (!isOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const frameId = window.requestAnimationFrame(() => {
            const input = inputRef.current;
            if (!input) return;

            if (input.value) {
                input.setSelectionRange(0, input.value.length);
                return;
            }

            if (shouldAutoFocusOnMobile) {
                input.setSelectionRange(0, 0);
            }
        });

        return () => {
            window.cancelAnimationFrame(frameId);
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen, shouldAutoFocusOnMobile]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                handleDismiss();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleDismiss, isOpen]);

    const frequentDestinationStations = useMemo(
        () =>
            frequentDestinationIds
                .slice(0, 3)
                .map((id) => stationMap.get(id))
                .filter(
                    (station): station is Station =>
                        station !== undefined &&
                        !isTaipeiCircularStation(station)
                ),
        [frequentDestinationIds, stationMap]
    );

    const filteredStations = useMemo(() => {
        if (!trimmedSearchValue) return [];

        const normalizedSearchValue = normalizeSearchValue(searchValue);
        const normalizedEnglishSearchValue =
            normalizeEnglishStationName(searchValue);

        return filterStationsBySearch(stations, searchValue)
            .map((station, index) => {
                let priority = 2;

                if (station.id === selectedId) {
                    priority = 0;
                } else if (
                    station.name === searchValue ||
                    station.name === normalizedSearchValue ||
                    normalizeEnglishStationName(station.nameEn) ===
                        normalizedEnglishSearchValue
                ) {
                    priority = 1;
                }

                return { station, priority, index };
            })
            .sort((a, b) => a.priority - b.priority || a.index - b.index)
            .map(({ station }) => station);
    }, [searchValue, selectedId, stations, trimmedSearchValue]);

    const handleSelect = (stationId: string) => {
        const preferredStationId = resolvePreferredStationId(
            stationId,
            stations,
            searchValue
        );

        onSelect(preferredStationId);

        if (onCacheSelection) {
            onCacheSelection(preferredStationId);
        }

        if (showFrequentDestinations) {
            setFrequentDestinationIds(
                persistFrequentDestinationId(
                    frequentDestinationOriginId,
                    preferredStationId,
                    stations
                )
            );
        }

        blurSearchInput();
        setSearchValue('');
        setIsOpen(false);
    };

    const handleOpen = () => {
        if (showFrequentDestinations) {
            setFrequentDestinationIds(
                getFrequentDestinationIdsForOrigin(
                    frequentDestinationOriginId,
                    excludedFrequentDestinationId,
                    stations
                )
            );
        }

        setSearchValue(
            selectedStation
                ? language === 'en'
                    ? getDisplayStationName(selectedStation)
                    : selectedStation.name
                : ''
        );
        setIsOpen(true);
    };

    const handleInputChange = (value: string) => {
        setSearchValue(value);
    };

    const visibleStations = useMemo(() => {
        if (!showFrequentDestinations) {
            return trimmedSearchValue ? filteredStations : [];
        }

        const frequentDestinationIdSet = new Set(
            frequentDestinationStations.map((station) => station.id)
        );
        const matchingStations = trimmedSearchValue
            ? filteredStations.filter(
                  (station) => !frequentDestinationIdSet.has(station.id)
              )
            : [];

        return [...frequentDestinationStations, ...matchingStations];
    }, [
        filteredStations,
        frequentDestinationStations,
        showFrequentDestinations,
        trimmedSearchValue,
    ]);
    const triggerLabel = selectedStation
        ? `${placeholder}: ${getDisplayStationName(selectedStation)}`
        : placeholder;

    return (
        <div className='station-input-wrapper'>
            <button
                type='button'
                className={`station-trigger ${selectedStation ? 'has-value' : ''} ${triggerAction ? 'has-action' : ''}`}
                onClick={handleOpen}
                aria-label={triggerLabel}
                aria-haspopup='dialog'
                aria-expanded={isOpen}
            >
                <span className='station-trigger-leading-icon-frame'>
                    <TriggerIcon className='station-trigger-leading-icon' />
                </span>
                <span className='station-trigger-copy'>
                    {selectedStation ? (
                        <span className='station-trigger-value'>
                            {getDisplayStationName(selectedStation)}
                        </span>
                    ) : (
                        <span className='station-trigger-label'>
                            {placeholder}
                        </span>
                    )}
                </span>
            </button>

            {triggerAction ? (
                <div className='station-trigger-action-slot'>
                    {triggerAction}
                </div>
            ) : null}

            {isOpen && (
                <div className='station-search-overlay'>
                    <div className='station-search-page'>
                        <div className='station-search-content'>
                            <div className='station-search-header'>
                                <h2 className='label-dim station-search-title'>
                                    {title}
                                </h2>
                                <button
                                    type='button'
                                    className='station-search-close'
                                    onClick={handleDismiss}
                                    aria-label={t('common.close')}
                                    title={t('common.close')}
                                >
                                    <X aria-hidden='true' />
                                </button>
                            </div>

                            <div className='station-search-panel'>
                                <div className='station-search-input-shell'>
                                    <Search className='station-search-leading-icon' />
                                    <div
                                        className={`station-search-input-copy ${searchValue ? 'has-value' : ''}`}
                                        onMouseDown={focusSearchInput}
                                    >
                                        <span className='station-search-input-label'>
                                            {placeholder}
                                        </span>
                                        <input
                                            ref={inputRef}
                                            type='text'
                                            className='station-search-input'
                                            autoFocus
                                            value={searchValue}
                                            placeholder={placeholder}
                                            aria-label={placeholder}
                                            onChange={(event) =>
                                                handleInputChange(
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </div>

                                    {searchValue && (
                                        <button
                                            type='button'
                                            className='station-search-clear'
                                            onClick={() => setSearchValue('')}
                                            aria-label={t('common.clear')}
                                        >
                                            <X />
                                        </button>
                                    )}
                                </div>

                                <div className='station-search-results'>
                                    {visibleStations.length > 0 ? (
                                        <div className='station-search-list'>
                                            {visibleStations.map((station) => {
                                                const isFrequent =
                                                    showFrequentDestinations &&
                                                    frequentDestinationStations.some(
                                                        (frequentStation) =>
                                                            frequentStation.id ===
                                                            station.id
                                                    );

                                                return (
                                                    <button
                                                        key={station.id}
                                                        type='button'
                                                        className={`station-search-item ${station.id === selectedId ? 'selected' : ''}`}
                                                        onClick={() =>
                                                            handleSelect(
                                                                station.id
                                                            )
                                                        }
                                                        aria-current={
                                                            station.id ===
                                                            selectedId
                                                                ? 'true'
                                                                : undefined
                                                        }
                                                    >
                                                        <span className='station-search-item-icon'>
                                                            {isFrequent ? (
                                                                <Clock3 />
                                                            ) : (
                                                                <Search />
                                                            )}
                                                        </span>
                                                        <span className='station-search-item-text'>
                                                            {getDisplayStationName(
                                                                station
                                                            )}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : trimmedSearchValue ? (
                                        <div className='station-search-empty'>
                                            {t('station.noMatches')}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
