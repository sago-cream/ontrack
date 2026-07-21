import type { Metadata } from 'next';

import { LegalPage, legalPageStyles as styles } from '../../LegalPage';

const SETTINGS_URL = 'https://ontrack.hsichen.dev/docs/settings';
const APP_IMAGE = 'https://ontrack.hsichen.dev/demo.png';
const APP_DESCRIPTION =
    'OnTrack settings guide for appearance, language, station detection, sharing, and local preferences.';

export const metadata: Metadata = {
    title: 'Settings | OnTrack Docs',
    description: APP_DESCRIPTION,
    alternates: {
        canonical: SETTINGS_URL,
    },
    openGraph: {
        title: 'Settings | OnTrack Docs',
        description: APP_DESCRIPTION,
        url: SETTINGS_URL,
        siteName: 'OnTrack',
        images: [APP_IMAGE],
        locale: 'zh_TW',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Settings | OnTrack Docs',
        description: APP_DESCRIPTION,
        images: [APP_IMAGE],
    },
};

export default function SettingsDocsPage() {
    return (
        <LegalPage
            title='Settings'
            subtitle='Reference for the preferences available in OnTrack and how they affect the app.'
            footerLinks={[
                { href: '/docs', label: 'Docs' },
                { href: '/docs/features', label: 'Features' },
                { href: '/docs/support', label: 'Support' },
                { href: '/docs/legal', label: 'Legal Notices' },
            ]}
            footerNote='Settings documentation for OnTrack.'
        >
            <section className={styles.section} aria-labelledby='appearance'>
                <h2 id='appearance'>Appearance</h2>
                <p>
                    Choose light mode, dark mode, or system appearance. System
                    appearance follows the current device or browser color
                    scheme.
                </p>
            </section>

            <section className={styles.section} aria-labelledby='language'>
                <h2 id='language'>Language</h2>
                <p>
                    OnTrack supports Traditional Chinese and English interface
                    text. Station names and official data may still reflect the
                    railway data source.
                </p>
            </section>

            <section className={styles.section} aria-labelledby='location'>
                <h2 id='location'>Automatic Station Detection</h2>
                <p>
                    Automatic station detection fills the origin station from
                    your current location when permission is enabled. Turn it
                    off if you prefer to always choose the origin manually.
                </p>
            </section>

            <section className={styles.section} aria-labelledby='sharing'>
                <h2 id='sharing'>Share Message Format</h2>
                <p>
                    The share format controls the text generated when sharing a
                    train. Use arrival-only for short messages, or route and
                    arrival when the recipient needs more context.
                </p>
            </section>

            <section className={styles.section} aria-labelledby='reset'>
                <h2 id='reset'>Local Preferences</h2>
                <p>
                    OnTrack stores preferences such as appearance, language,
                    selected stations, and frequent destinations on your device.
                    Clear browser site data or uninstall the app to reset local
                    preferences.
                </p>
            </section>
        </LegalPage>
    );
}
