import { useCallback, useState } from 'react';

const STORAGE_KEYS = {
    ORIGIN: 'ontrack_origin',
    DEST: 'ontrack_dest',
    AUTO_DETECT_ORIGIN: 'ontrack_auto_detect_origin',
};

// Validate station ID format (alphanumeric with optional dash, max 10 chars)
function isValidStationId(id: string): boolean {
    return /^[A-Z0-9-]*$/i.test(id) && id.length <= 10;
}

function canUseLocalStorage(): boolean {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
}

// Safe localStorage getter with validation
function getValidatedStationId(key: string): string {
    if (!canUseLocalStorage()) {
        return '';
    }

    const value = localStorage.getItem(key) || '';
    return isValidStationId(value) ? value : '';
}

function getStorageItem(key: string, fallback = ''): string {
    return canUseLocalStorage()
        ? localStorage.getItem(key) || fallback
        : fallback;
}

function setStorageItem(key: string, value: string) {
    if (canUseLocalStorage()) {
        localStorage.setItem(key, value);
    }
}

export function usePersistence() {
    const [originId, setOriginId] = useState<string>(() =>
        getValidatedStationId(STORAGE_KEYS.ORIGIN)
    );
    const [destId, setDestId] = useState<string>(() =>
        getValidatedStationId(STORAGE_KEYS.DEST)
    );
    const [autoDetectOrigin, setAutoDetectOrigin] = useState<boolean>(
        () => getStorageItem(STORAGE_KEYS.AUTO_DETECT_ORIGIN) === 'true'
    );

    const saveOrigin = useCallback((id: string) => {
        if (!isValidStationId(id)) return;
        setOriginId(id);
        setStorageItem(STORAGE_KEYS.ORIGIN, id);
    }, []);

    const saveDest = useCallback((id: string) => {
        if (!isValidStationId(id)) return;
        setDestId(id);
        setStorageItem(STORAGE_KEYS.DEST, id);
    }, []);

    const saveAutoDetectOrigin = useCallback((value: boolean) => {
        setAutoDetectOrigin(value);
        setStorageItem(STORAGE_KEYS.AUTO_DETECT_ORIGIN, String(value));
    }, []);

    return {
        originId,
        setOriginId: saveOrigin,
        destId,
        setDestId: saveDest,
        autoDetectOrigin,
        setAutoDetectOrigin: saveAutoDetectOrigin,
    };
}
