import { useCallback, useEffect, useState } from 'react';

import {
    isAndroid,
    isNativePreview,
    NativeApp,
    type NativeState,
} from './platform';

const initialState: NativeState = {
    supporter: false,
    icon: 'primary',
    billingAvailable: false,
};
export function useNativeState() {
    const [state, setState] = useState<NativeState>(initialState);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('');
    const refresh = useCallback(async () => {
        if (isAndroid()) {
            try {
                setState(await NativeApp.state());
            } catch {
                /* Offline keeps last known entitlement. */
            }
        } else if (isNativePreview()) {
            setState({
                ...initialState,
                supporter: new URLSearchParams(location.search).has(
                    'supporter'
                ),
                price: 'NT$60',
            });
        }
    }, []);
    useEffect(() => {
        void refresh();
        const resume = () => {
            if (!document.hidden) void refresh();
        };
        document.addEventListener('visibilitychange', resume);
        window.addEventListener('focus', resume);
        return () => {
            document.removeEventListener('visibilitychange', resume);
            window.removeEventListener('focus', resume);
        };
    }, [refresh]);
    const transact = async (restore: boolean) => {
        if (!isAndroid() || busy) return;
        setBusy(true);
        setStatus('');
        try {
            const result = await (restore
                ? NativeApp.restore()
                : NativeApp.purchase());
            setState(result);
            setStatus(
                result.supporter
                    ? 'supported'
                    : restore
                      ? 'noPurchases'
                      : 'pending'
            );
        } catch (error) {
            setStatus(
                error instanceof Error && error.message === 'cancelled'
                    ? ''
                    : 'unavailable'
            );
        } finally {
            setBusy(false);
        }
    };
    return { state, busy, status, transact, refresh, setState };
}
