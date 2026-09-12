import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage, legalPageStyles as styles } from '../LegalPage';

const DOCS_URL = 'https://ontrack.hsichen.dev/docs';
const APP_IMAGE = 'https://ontrack.hsichen.dev/demo.png';
const APP_DESCRIPTION =
    'Learn how OnTrack handles station detection, live railway data, preferences, sharing, and support.';

export const metadata: Metadata = {
    title: 'OnTrack Docs',
    description: APP_DESCRIPTION,
    alternates: {
        canonical: DOCS_URL,
    },
    openGraph: {
        title: 'OnTrack Docs',
        description: APP_DESCRIPTION,
        url: DOCS_URL,
        siteName: 'OnTrack',
        images: [APP_IMAGE],
        locale: 'zh_TW',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'OnTrack Docs',
        description: APP_DESCRIPTION,
        images: [APP_IMAGE],
    },
};

export default function DocsIndexPage() {
    return (
        <LegalPage
            title='OnTrack Docs'
            subtitle='Guides for the web app, iOS app, station detection, live train data, settings, privacy, and support.'
            footerLinks={[
                { href: '/docs/features', label: 'Features' },
                { href: '/docs/settings', label: 'Settings' },
                { href: '/docs/support', label: 'Support' },
                { href: '/docs/privacy', label: 'Privacy Policy' },
                { href: '/docs/legal', label: 'Legal Notices' },
            ]}
            footerNote='Documentation for OnTrack.'
        >
            <section className={styles.section} aria-labelledby='start'>
                <h2 id='start'>Start Here</h2>
                <div className={styles.faqList}>
                    <article className={styles.faqItem}>
                        <h3>Use the web app</h3>
                        <p>
                            Open{' '}
                            <Link className={styles.inlineLink} href='/app'>
                                OnTrack Web
                            </Link>{' '}
                            to search Taiwan Railway departures, choose your
                            origin and destination, adjust departure or arrival
                            time, and share arrival details.
                        </p>
                    </article>
                    <article className={styles.faqItem}>
                        <h3>Install the iOS app</h3>
                        <p>
                            The iOS app uses the same railway data and adds a
                            native experience for station detection,
                            preferences, sharing, and App Store distribution.
                        </p>
                    </article>
                </div>
            </section>

            <section className={styles.section} aria-labelledby='guides'>
                <h2 id='guides'>Guides</h2>
                <div className={styles.faqList}>
                    <article className={styles.faqItem}>
                        <h3>
                            <Link
                                className={styles.inlineLink}
                                href='/docs/features'
                            >
                                Features
                            </Link>
                        </h3>
                        <p>
                            Station detection, destination prediction, live
                            delay information, route selection, and arrival
                            sharing.
                        </p>
                    </article>
                    <article className={styles.faqItem}>
                        <h3>
                            <Link
                                className={styles.inlineLink}
                                href='/docs/settings'
                            >
                                Settings
                            </Link>
                        </h3>
                        <p>
                            Appearance, language, station detection, sharing
                            format, local preferences, and troubleshooting.
                        </p>
                    </article>
                    <article className={styles.faqItem}>
                        <h3>
                            <Link
                                className={styles.inlineLink}
                                href='/docs/support'
                            >
                                Support
                            </Link>
                        </h3>
                        <p>
                            Contact information, common issues, and the details
                            to include when reporting a bug.
                        </p>
                    </article>
                </div>
            </section>
        </LegalPage>
    );
}
