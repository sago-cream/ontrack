import type { Metadata } from 'next';

import { LegalNoticePageContent } from './LegalNoticePageContent';

const LEGAL_URL = 'https://ontrack.hsichen.dev/docs/legal';
const APP_IMAGE = 'https://ontrack.hsichen.dev/demo.png';
const APP_DESCRIPTION =
    'Legal notices and third-party trademark attributions for OnTrack.';

export const metadata: Metadata = {
    title: 'Legal Notices | OnTrack',
    description: APP_DESCRIPTION,
    alternates: {
        canonical: LEGAL_URL,
    },
    openGraph: {
        title: 'Legal Notices | OnTrack',
        description: APP_DESCRIPTION,
        url: LEGAL_URL,
        siteName: 'OnTrack',
        images: [APP_IMAGE],
        locale: 'zh_TW',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Legal Notices | OnTrack',
        description: APP_DESCRIPTION,
        images: [APP_IMAGE],
    },
};

export default function LegalNoticePage() {
    return <LegalNoticePageContent />;
}
