import type { Metadata } from 'next';

import { LegalPage, legalPageStyles as styles } from '../../LegalPage';

const FEATURES_URL = 'https://ontrack.hsichen.dev/docs/features';
const APP_IMAGE = 'https://ontrack.hsichen.dev/demo.png';
const APP_DESCRIPTION =
    'OnTrack feature guide for station detection, live train schedules, destination prediction, and sharing.';

export const metadata: Metadata = {
    title: 'Features | OnTrack Docs',
    description: APP_DESCRIPTION,
    alternates: {
        canonical: FEATURES_URL,
    },
    openGraph: {
        title: 'Features | OnTrack Docs',
        description: APP_DESCRIPTION,
        url: FEATURES_URL,
        siteName: 'OnTrack',
        images: [APP_IMAGE],
        locale: 'zh_TW',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Features | OnTrack Docs',
        description: APP_DESCRIPTION,
        images: [APP_IMAGE],
    },
};

export default function FeaturesDocsPage() {
    return (
        <LegalPage
            title='Features'
            subtitle='How OnTrack helps you find the right train faster, from nearby station detection to arrival sharing.'
            footerLinks={[
                { href: '/docs', label: 'Docs' },
                { href: '/docs/settings', label: 'Settings' },
                { href: '/docs/support', label: 'Support' },
                { href: '/docs/legal', label: 'Legal Notices' },
            ]}
            footerNote='Feature documentation for OnTrack.'
        >
            <section className={styles.section} aria-labelledby='station'>
                <h2 id='station'>Station Detection</h2>
                <p>
                    OnTrack can use your device location to suggest the nearest
                    origin station. Raw latitude and longitude are used on your
                    device for this feature and are not sent to the OnTrack
                    server.
                </p>
                <ul>
                    <li>Enable location permission when prompted.</li>
                    <li>
                        Keep automatic station detection on if you usually start
                        from the station near you.
                    </li>
                    <li>
                        Choose an origin manually when location is unavailable
                        or you are planning a different route.
                    </li>
                </ul>
            </section>

            <section className={styles.section} aria-labelledby='schedules'>
                <h2 id='schedules'>Live Train Schedules</h2>
                <p>
                    Schedule searches use official railway data to show train
                    times and delay information for the selected origin,
                    destination, date, and time.
                </p>
                <ul>
                    <li>
                        Use departure mode when you know when you want to leave.
                    </li>
                    <li>
                        Use arrival mode when you need to reach the destination
                        by a specific time.
                    </li>
                    <li>
                        Refresh live data when you want the latest available
                        delay status.
                    </li>
                </ul>
            </section>

            <section className={styles.section} aria-labelledby='prediction'>
                <h2 id='prediction'>Destination Prediction</h2>
                <p>
                    OnTrack remembers frequently used destinations locally so it
                    can make repeat lookups faster. This preference history
                    stays on your device unless you use that station pair in a
                    schedule request.
                </p>
            </section>

            <section className={styles.section} aria-labelledby='sharing'>
                <h2 id='sharing'>Arrival Sharing</h2>
                <p>
                    Share the selected train or arrival details from the train
                    view. You can choose whether shared text includes only the
                    arrival time or both route and arrival information.
                </p>
            </section>
        </LegalPage>
    );
}
