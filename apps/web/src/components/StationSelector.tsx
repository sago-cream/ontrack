import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ArrowUpDown,
    Circle,
    Flag,
    LoaderCircle,
    MapPin,
    MapPinCheck,
    MapPinOff,
} from 'lucide-react';

import { useI18n } from '../i18n/useI18n';
import type { Station } from '../types';
import {
    getAutoFillDestinationId,
    persistFrequentDestinationId,
} from './frequentDestinations';
import { StationDropdown } from './StationDropdown';
import { resolvePreferredStationId } from './stationSearchUtils';

import './StationSelector.css';

interface StationSelectorProps {
    stations: Station[];
    originId: string;
    setOriginId: (id: string) => void;
    destId: string;
    setDestId: (id: string) => void;
    autoDetectOrigin: boolean;
    setAutoDetectOrigin: (value: boolean) => void;
}

const CACHED_ORIGIN_KEY = 'ontrack_cached_origin';
const MANUAL_ORIGIN_SELECTED_AT_KEY = 'ontrack_manual_origin_selected_at';
const MANUAL_ORIGIN_PROTECTION_MS = 10 * 60 * 1000;
type OriginSelectionSource = 'manual' | 'cached' | 'geo' | null;
type DestinationSelectionSource = 'manual' | 'cached' | 'auto' | null;
type GeolocationStatus =
    | 'idle'
    | 'requesting'
    | 'denied'
    | 'timeout'
    | 'unavailable';

function isManualOriginProtected() {
    const selectedAt = Number(
        localStorage.getItem(MANUAL_ORIGIN_SELECTED_AT_KEY) || '0'
    );

    return (
        selectedAt > 0 && Date.now() - selectedAt < MANUAL_ORIGIN_PROTECTION_MS
    );
}

export function StationSelector({
    stations,
    originId,
    setOriginId,
    destId,
    setDestId,
    autoDetectOrigin,
    setAutoDetectOrigin,
}: StationSelectorProps) {
    const { t } = useI18n();
    const [originSearch, setOriginSearch] = useState('');
    const [destSearch, setDestSearch] = useState('');
    const [originDropdownOpen, setOriginDropdownOpen] = useState(false);
    const [destDropdownOpen, setDestDropdownOpen] = useState(false);
    const [geolocationGranted, setGeolocationGranted] = useState(false);
    const [geolocationStatus, setGeolocationStatus] =
        useState<GeolocationStatus>('idle');
    const [geolocationPending, setGeolocationPending] = useState(false);
    const [locatedOriginId, setLocatedOriginId] = useState<string | null>(null);
    const [geolocationRequestVersion, setGeolocationRequestVersion] =
        useState(0);
    const hasAutoSelected = useRef(false);
    const hasCheckedGeolocationPermission = useRef(false);
    const isExplicitGeolocationRequest = useRef(false);
    const isGeolocationPending = useRef(false);
    const originIdRef = useRef(originId);
    const prevAutoDetectOrigin = useRef(autoDetectOrigin);
    const [, setOriginSource] = useState<OriginSelectionSource>(() =>
        originId ? 'cached' : null
    );
    const [destinationSource, setDestinationSource] =
        useState<DestinationSelectionSource>(() => (destId ? 'cached' : null));

    const setOriginWithSource = useCallback(
        (id: string, source: Exclude<OriginSelectionSource, null>) => {
            setOriginId(id);
            setOriginSource(id ? source : null);
            localStorage.setItem(CACHED_ORIGIN_KEY, id);

            if (source === 'manual' && id) {
                localStorage.setItem(
                    MANUAL_ORIGIN_SELECTED_AT_KEY,
                    String(Date.now())
                );
            } else if (source !== 'manual') {
                localStorage.removeItem(MANUAL_ORIGIN_SELECTED_AT_KEY);
            }
        },
        [setOriginId]
    );

    useEffect(() => {
        originIdRef.current = originId;
    }, [originId]);

    useEffect(() => {
        if (hasCheckedGeolocationPermission.current || !navigator.permissions) {
            return;
        }

        hasCheckedGeolocationPermission.current = true;
        let cancelled = false;

        navigator.permissions
            .query({ name: 'geolocation' })
            .then((result) => {
                if (cancelled) return;

                const isGranted = result.state === 'granted';
                setGeolocationGranted(isGranted);
                if (isGranted) {
                    setAutoDetectOrigin(true);
                }
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [setAutoDetectOrigin]);

    useEffect(() => {
        if (!originId || stations.length === 0) return;

        const hasKnownDestination = destId
            ? stations.some((station) => station.id === destId)
            : false;
        const shouldAutoFillDestination =
            !destId ||
            destId === originId ||
            !hasKnownDestination ||
            destinationSource === 'auto';

        if (!shouldAutoFillDestination) return;

        const autoFillDestinationId = getAutoFillDestinationId(
            originId,
            stations
        );

        if (!autoFillDestinationId || autoFillDestinationId === destId) {
            return;
        }

        const timer = window.setTimeout(() => {
            setDestinationSource('auto');
            setDestId(autoFillDestinationId);
        }, 0);

        return () => window.clearTimeout(timer);
    }, [destId, destinationSource, originId, setDestId, stations]);

    // Auto-select nearest station when autoDetectOrigin is enabled.
    // This should only happen once on app start, or once each time the
    // user toggles auto-detect from false to true.
    useEffect(() => {
        const wasAutoDetectOrigin = prevAutoDetectOrigin.current;
        const isToggledOn = !wasAutoDetectOrigin && autoDetectOrigin;
        prevAutoDetectOrigin.current = autoDetectOrigin;

        if (stations.length === 0) return;

        const isExplicitRequest = isExplicitGeolocationRequest.current;
        isExplicitGeolocationRequest.current = false;

        // If auto-detect is disabled, use cached origin if available.
        if (!autoDetectOrigin) {
            hasAutoSelected.current = false;
            if (!originIdRef.current) {
                const cachedOriginId = localStorage.getItem(CACHED_ORIGIN_KEY);
                if (
                    cachedOriginId &&
                    stations.find((s) => s.id === cachedOriginId)
                ) {
                    setOriginId(
                        resolvePreferredStationId(cachedOriginId, stations)
                    );
                }
            }
            return;
        }

        if (isManualOriginProtected()) {
            return;
        }

        // Auto-detect is enabled - request geolocation
        if (hasAutoSelected.current || isGeolocationPending.current) return;

        if (!navigator.geolocation) {
            const cachedOriginId = localStorage.getItem(CACHED_ORIGIN_KEY);
            if (
                cachedOriginId &&
                stations.find((s) => s.id === cachedOriginId)
            ) {
                setOriginId(
                    resolvePreferredStationId(cachedOriginId, stations)
                );
            }
            hasAutoSelected.current = true;
            return;
        }

        const fallbackToCached = (status: GeolocationStatus = 'idle') => {
            isGeolocationPending.current = false;
            setGeolocationPending(false);
            setGeolocationStatus(status);
            const cachedOriginId = localStorage.getItem(CACHED_ORIGIN_KEY);
            if (
                cachedOriginId &&
                stations.find((s) => s.id === cachedOriginId)
            ) {
                setOriginWithSource(
                    resolvePreferredStationId(cachedOriginId, stations),
                    'cached'
                );
            }
            hasAutoSelected.current = true;
        };

        const requestGeolocation = () => {
            isGeolocationPending.current = true;
            setGeolocationPending(true);
            if (isExplicitRequest) {
                setGeolocationStatus('requesting');
            }
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    isGeolocationPending.current = false;
                    setGeolocationPending(false);
                    setGeolocationGranted(true);
                    setGeolocationStatus('idle');

                    const { latitude, longitude } = position.coords;
                    let nearestStation = stations[0];
                    let minDistance = Number.MAX_VALUE;

                    stations.forEach((station) => {
                        if (station.lat && station.lon) {
                            const distance = Math.sqrt(
                                Math.pow(station.lat - latitude, 2) +
                                    Math.pow(station.lon - longitude, 2)
                            );
                            if (distance < minDistance) {
                                minDistance = distance;
                                nearestStation = station;
                            }
                        }
                    });

                    if (nearestStation) {
                        const preferredStationId = resolvePreferredStationId(
                            nearestStation.id,
                            stations
                        );

                        setLocatedOriginId(preferredStationId);

                        if (!isManualOriginProtected()) {
                            setOriginWithSource(preferredStationId, 'geo');
                        }
                    }
                    hasAutoSelected.current = true;
                },
                (error) => {
                    if (error.code === error.PERMISSION_DENIED) {
                        setGeolocationGranted(false);
                        setLocatedOriginId(null);
                    }
                    fallbackToCached(
                        isExplicitRequest && error.code === 3
                            ? 'timeout'
                            : isExplicitRequest
                              ? 'denied'
                              : 'idle'
                    );
                },
                {
                    enableHighAccuracy: false,
                    timeout: 10000,
                    maximumAge: 300000,
                }
            );
        };

        // If user explicitly toggled this on, always try requesting geolocation again.
        // This allows retrying permission after a prior rejection.
        if (isToggledOn || isExplicitRequest) {
            requestGeolocation();
            return;
        }

        // Check permission state first to avoid showing the browser prompt on every load.
        // Only call getCurrentPosition if permission was already granted.
        if (navigator.permissions) {
            navigator.permissions
                .query({ name: 'geolocation' })
                .then((result) => {
                    if (result.state === 'granted') {
                        // Permission already granted — silently get position
                        requestGeolocation();
                    } else {
                        // Only the visible map-pin action may prompt for access.
                        fallbackToCached();
                    }
                })
                .catch(() => {
                    fallbackToCached();
                });
        } else {
            fallbackToCached();
        }
    }, [
        autoDetectOrigin,
        geolocationRequestVersion,
        setOriginId,
        setOriginWithSource,
        stations,
    ]);

    const originStation = stations.find((s) => s.id === originId);
    const destStation = stations.find((s) => s.id === destId);
    const isLocatedOrigin =
        geolocationGranted &&
        locatedOriginId !== null &&
        originId === locatedOriginId;

    const handleOriginSelect = (id: string) => {
        setOriginWithSource(id, 'manual');
    };

    const handleDestinationSelect = (id: string) => {
        setDestinationSource('manual');
        setDestId(id);
    };

    const handleOriginDropdownOpen = (isOpen: boolean) => {
        setOriginDropdownOpen(isOpen);
        if (isOpen) {
            setDestDropdownOpen(false);
        }
    };

    const handleRequestGeolocation = () => {
        if (!navigator.geolocation) {
            setGeolocationStatus('unavailable');
            return;
        }

        localStorage.removeItem(MANUAL_ORIGIN_SELECTED_AT_KEY);
        hasAutoSelected.current = false;
        isExplicitGeolocationRequest.current = true;
        setGeolocationStatus('requesting');
        setAutoDetectOrigin(true);
        setGeolocationRequestVersion((version) => version + 1);
    };

    const geolocationStatusMessage =
        geolocationStatus === 'requesting'
            ? t('app.locationRequesting')
            : geolocationStatus === 'denied'
              ? t('app.locationDenied')
              : geolocationStatus === 'timeout'
                ? t('app.locationTimedOut')
                : geolocationStatus === 'unavailable'
                  ? t('app.locationUnavailable')
                  : null;

    const geolocationActionLabel = geolocationPending
        ? t('app.locationRequesting')
        : !geolocationGranted
          ? t('app.enableAutoDetectOrigin')
          : isLocatedOrigin
            ? t('app.refreshLocatedOrigin')
            : t('app.useCurrentLocation');

    const handleDestDropdownOpen = (isOpen: boolean) => {
        setDestDropdownOpen(isOpen);
        if (isOpen) {
            setOriginDropdownOpen(false);
        }
    };

    const handleSwapStations = () => {
        if (!originId || !destId) return;

        const currentOriginId = originId;
        const currentDestinationId = destId;

        setOriginWithSource(currentDestinationId, 'manual');
        setDestinationSource('manual');
        setDestId(currentOriginId);
        persistFrequentDestinationId(
            currentDestinationId,
            currentOriginId,
            stations
        );
    };

    return (
        <div className='station-selector-container'>
            <div className='station-fields-group'>
                {/* Origin Station Row */}
                <div className='station-row station-row-origin'>
                    <div className='station-field'>
                        <StationDropdown
                            stations={stations}
                            searchValue={originSearch}
                            setSearchValue={setOriginSearch}
                            isOpen={originDropdownOpen}
                            setIsOpen={handleOriginDropdownOpen}
                            selectedId={originId}
                            onSelect={handleOriginSelect}
                            placeholder={t('station.origin')}
                            title={t('station.selectOrigin')}
                            selectedStation={originStation}
                            TriggerIcon={Circle}
                            triggerAction={
                                <button
                                    type='button'
                                    className={`station-action-btn ${isLocatedOrigin ? 'active' : ''}`}
                                    onClick={handleRequestGeolocation}
                                    disabled={
                                        geolocationPending ||
                                        geolocationStatus === 'unavailable'
                                    }
                                    aria-busy={geolocationPending}
                                    aria-label={geolocationActionLabel}
                                    title={geolocationActionLabel}
                                >
                                    {geolocationPending ? (
                                        <LoaderCircle
                                            className='station-location-spinner'
                                            aria-hidden='true'
                                        />
                                    ) : !geolocationGranted ? (
                                        <MapPinOff aria-hidden='true' />
                                    ) : isLocatedOrigin ? (
                                        <MapPinCheck aria-hidden='true' />
                                    ) : (
                                        <MapPin aria-hidden='true' />
                                    )}
                                </button>
                            }
                        />
                    </div>
                </div>

                {/* Destination Station Row */}
                <div className='station-row station-row-destination'>
                    <div className='station-field'>
                        <StationDropdown
                            stations={stations}
                            searchValue={destSearch}
                            setSearchValue={setDestSearch}
                            isOpen={destDropdownOpen}
                            setIsOpen={handleDestDropdownOpen}
                            selectedId={destId}
                            onSelect={handleDestinationSelect}
                            placeholder={t('station.destination')}
                            title={t('station.selectDestination')}
                            selectedStation={destStation}
                            TriggerIcon={Flag}
                            showFrequentDestinations
                            frequentDestinationOriginId={originId}
                            excludedFrequentDestinationId={originId}
                            triggerAction={
                                <button
                                    type='button'
                                    className='station-action-btn'
                                    onClick={handleSwapStations}
                                    disabled={!originId || !destId}
                                    aria-label={t('station.swap')}
                                    title={t('station.swap')}
                                >
                                    <ArrowUpDown aria-hidden='true' />
                                </button>
                            }
                        />
                    </div>
                </div>
            </div>
            {geolocationStatusMessage ? (
                <div
                    className={`station-location-status ${
                        geolocationStatus === 'requesting'
                            ? 'is-requesting'
                            : 'is-error'
                    }`}
                    role='status'
                >
                    {geolocationStatusMessage}
                </div>
            ) : null}
        </div>
    );
}
