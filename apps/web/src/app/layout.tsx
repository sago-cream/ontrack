import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';

import '../index.css';

const APP_TITLE = 'OnTrack | 極速台鐵時刻表';
const APP_DESCRIPTION =
    '自動偵測您的所在車站，並依搭乘習慣預測路線。打開 App 的瞬間，即可掌握即時班次與延誤資訊。';
const APP_URL = 'https://ontrack.hsichen.dev/';
const APP_IMAGE = 'https://ontrack.hsichen.dev/demo.png';
const CF_WEB_ANALYTICS_TOKEN = process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN;
const ENABLE_ANALYTICS =
    process.env.NODE_ENV === 'production' && Boolean(CF_WEB_ANALYTICS_TOKEN);
const APPLE_STARTUP_IMAGES = [
    {
        url: '/splash/apple-splash-750x1334.png',
        media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-1242x2208.png',
        media: '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-1125x2436.png',
        media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-828x1792.png',
        media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-1242x2688.png',
        media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-1080x2340.png',
        media: '(device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-1170x2532.png',
        media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-1284x2778.png',
        media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-1179x2556.png',
        media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-1290x2796.png',
        media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-1536x2048.png',
        media: '(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-1668x2388.png',
        media: '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
    },
    {
        url: '/splash/apple-splash-2048x2732.png',
        media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
    },
];
const APPLE_STARTUP_IMAGES_WITH_THEMES = APPLE_STARTUP_IMAGES.flatMap(
    ({ url, media }) => [
        {
            url,
            media: `${media} and (prefers-color-scheme: light)`,
        },
        {
            url: url.replace('.png', '-dark.png'),
            media: `${media} and (prefers-color-scheme: dark)`,
        },
    ]
);
const APPEARANCE_BOOTSTRAP_SCRIPT = `
(function () {
    try {
        var appearanceKey = 'ontrack_appearance';
        var legacyDarkModeKey = 'ontrack_dark_mode';
        var mode = window.localStorage.getItem(appearanceKey);

        if (!['system','light','dark','sage','amethyst','ember'].includes(mode)) {
            var legacyDarkMode = window.localStorage.getItem(legacyDarkModeKey);
            mode = legacyDarkMode === null ? 'light' : legacyDarkMode === 'true' ? 'dark' : 'light';
        }

        var theme = mode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
        var dark = ['dark', 'amethyst', 'ember'].includes(theme);
        document.documentElement.dataset.appearance = mode;
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
        if (window.Capacitor && window.Capacitor.getPlatform() === 'android') document.documentElement.dataset.native = 'true';
        var colors = {light:'#f8fafc', dark:'#0f172a', sage:'#f6faf4', amethyst:'#181620', ember:'#231f1f'};
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[theme]);
    } catch (_) {}
})();
`;

export const metadata: Metadata = {
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    keywords: [
        '台鐵',
        '台鐵時刻表',
        '台鐵查詢',
        '台鐵即時到站',
        '台鐵列車時刻',
        '火車時刻表',
        'TRA',
        'Taiwan Railway',
        'PWA',
    ],
    robots: 'index,follow',
    verification: {
        google: 'U0MZAhyxx3hG4euT-pHfkimkVmT8oOu0dAlgD0OFoaQ',
    },
    manifest: '/manifest.webmanifest',
    icons: {
        icon: '/favicon.png',
        apple: '/apple-touch-icon.png',
    },
    openGraph: {
        type: 'website',
        locale: 'zh_TW',
        title: APP_TITLE,
        description: APP_DESCRIPTION,
        url: APP_URL,
        siteName: 'OnTrack',
        images: [APP_IMAGE],
    },
    twitter: {
        card: 'summary_large_image',
        title: APP_TITLE,
        description: APP_DESCRIPTION,
        images: [APP_IMAGE],
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'OnTrack',
        startupImage: APPLE_STARTUP_IMAGES_WITH_THEMES,
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    viewportFit: 'cover',
    themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        'name': 'OnTrack',
        'applicationCategory': 'TravelApplication',
        'operatingSystem': 'iOS, Android, Web',
        'inLanguage': ['zh-TW', 'en'],
        'url': APP_URL,
        'image': APP_IMAGE,
        'description': APP_DESCRIPTION,
        'offers': {
            '@type': 'Offer',
            'price': '0',
            'priceCurrency': 'TWD',
        },
    };

    return (
        <html
            lang='zh-TW'
            data-appearance='light'
            data-theme='light'
            suppressHydrationWarning
        >
            <body>
                <Script
                    id='appearance-bootstrap'
                    strategy='beforeInteractive'
                    dangerouslySetInnerHTML={{
                        __html: APPEARANCE_BOOTSTRAP_SCRIPT,
                    }}
                />
                <div id='native-splash' className='native-splash'>
                    <img
                        src='/ontrack-logo.png'
                        alt=''
                        width='100'
                        height='100'
                        aria-hidden='true'
                    />
                </div>
                <div className='app-root'>{children}</div>
                <script
                    id='software-application-schema'
                    type='application/ld+json'
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(structuredData),
                    }}
                />
                {ENABLE_ANALYTICS ? (
                    <Script
                        id='cloudflare-web-analytics'
                        src='https://static.cloudflareinsights.com/beacon.min.js'
                        strategy='afterInteractive'
                        data-cf-beacon={JSON.stringify({
                            token: CF_WEB_ANALYTICS_TOKEN,
                        })}
                    />
                ) : null}
            </body>
        </html>
    );
}
