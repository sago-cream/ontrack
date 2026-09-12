'use client';

import dynamic from 'next/dynamic';

import { I18nProvider } from '../i18n/I18nProvider';

// Native controls, saved preferences, and current time are only known on device.
const App = dynamic(() => import('../App'), { ssr: false });

export function ClientApp() {
    return (
        <I18nProvider>
            <App />
        </I18nProvider>
    );
}
