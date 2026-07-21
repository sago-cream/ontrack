import { Clock3, MapPin, Navigation, Share2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import styles from './page.module.css';

const HOME_URL = 'https://ontrack.hsichen.dev/';
const APP_STORE_URL = 'https://apps.apple.com/tw/app/ontrack/id6784708806';
const APP_STORE_BADGE_URL =
    'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/zh-TW?size=250x83';
const APP_IMAGE = 'https://ontrack.hsichen.dev/demo.png';
const APP_DESCRIPTION =
    '自動偵測您的所在車站，並依搭乘習慣預測路線。打開 App 的瞬間，即可掌握即時班次與延誤資訊。';

export const metadata: Metadata = {
    title: 'OnTrack | 極速台鐵時刻表',
    description: APP_DESCRIPTION,
    alternates: {
        canonical: HOME_URL,
    },
    openGraph: {
        title: 'OnTrack 台鐵時刻表 App',
        description: APP_DESCRIPTION,
        url: HOME_URL,
        siteName: 'OnTrack',
        images: [APP_IMAGE],
        locale: 'zh_TW',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'OnTrack 台鐵時刻表 App',
        description: APP_DESCRIPTION,
        images: [APP_IMAGE],
    },
};

const features = [
    {
        icon: MapPin,
        title: '自動偵測所在車站',
        body: '開啟定位後，OnTrack 便能依您的當前位置自動判斷起點站。',
        placement: 'topLeft',
    },
    {
        icon: Navigation,
        title: '依習慣預測路線',
        body: 'OnTrack 會依您的搭乘習慣預測路線，減少每次查詢時的手動輸入。',
        placement: 'topRight',
    },
    {
        icon: Clock3,
        title: '掌握即時班次',
        body: '打開 App 的瞬間，即可掌握即時班次與延誤資訊。',
        placement: 'bottomLeft',
    },
    {
        icon: Share2,
        title: '抵達時間快速分享',
        body: '一鍵分享目的地與抵達時間訊息，快速讓親友知道你的動態。',
        placement: 'bottomRight',
    },
] as const;

export default function HomePage() {
    return (
        <main className={styles.page}>
            <div className={styles.shell}>
                <nav className={styles.nav} aria-label='OnTrack navigation'>
                    <Link className={styles.brand} href='/'>
                        <img
                            className={styles.brandIcon}
                            src='/ontrack-logo.png'
                            alt=''
                            width='32'
                            height='32'
                            aria-hidden='true'
                        />
                        <span className={styles.brandText}>OnTrack</span>
                    </Link>
                    <div className={styles.navLinks}>
                        <Link className={styles.navTextLink} href='/app'>
                            網頁版
                        </Link>
                        <a className={styles.navTextLink} href={APP_STORE_URL}>
                            App Store
                        </a>
                    </div>
                </nav>

                <section className={styles.hero}>
                    <div className={styles.heroCopy}>
                        <h1 className={styles.title}>省時，也準時。</h1>
                        <p className={styles.lede}>
                            專為台鐵旅客打造。OnTrack
                            能自動偵測您的所在車站，並依搭乘習慣預測路線。打開
                            App 的瞬間，即可掌握即時班次與延誤資訊。
                        </p>
                        <div className={styles.heroActions}>
                            <Link className={styles.secondaryCta} href='/app'>
                                網頁版
                            </Link>
                            <a
                                className={styles.appStoreBadgeLink}
                                href={APP_STORE_URL}
                                aria-label='在 App Store 下載 OnTrack'
                            >
                                <img
                                    className={styles.appStoreBadge}
                                    src={APP_STORE_BADGE_URL}
                                    alt='在 App Store 下載'
                                    width='250'
                                    height='83'
                                />
                            </a>
                        </div>
                    </div>
                </section>

                <section
                    className={styles.showcaseSection}
                    id='features'
                    aria-labelledby='features-title'
                >
                    <div className={styles.sectionIntro}>
                        <h2 id='features-title'>重要資訊一目了然。</h2>
                    </div>
                    <div className={styles.showcaseAnalysis}>
                        <div className={styles.featureStack} data-side='left'>
                            {features
                                .filter((feature) =>
                                    feature.placement.endsWith('Left')
                                )
                                .map((feature) => {
                                    const Icon = feature.icon;

                                    return (
                                        <article
                                            className={styles.featureCard}
                                            data-placement={feature.placement}
                                            key={feature.title}
                                        >
                                            <span
                                                className={styles.featureIcon}
                                            >
                                                <Icon aria-hidden='true' />
                                            </span>
                                            <div
                                                className={
                                                    styles.featureContent
                                                }
                                            >
                                                <h3>{feature.title}</h3>
                                                <p>{feature.body}</p>
                                            </div>
                                        </article>
                                    );
                                })}
                        </div>
                        <div
                            className={styles.heroMedia}
                            aria-label='OnTrack app screenshot'
                        >
                            <img
                                className={styles.phoneImage}
                                src='/demo.png'
                                alt='OnTrack iOS 台鐵時刻表 App 畫面，顯示車站、班次與抵達時間分享資訊'
                                width='1320'
                                height='2868'
                            />
                        </div>
                        <div className={styles.featureStack} data-side='right'>
                            {features
                                .filter((feature) =>
                                    feature.placement.endsWith('Right')
                                )
                                .map((feature) => {
                                    const Icon = feature.icon;

                                    return (
                                        <article
                                            className={styles.featureCard}
                                            data-placement={feature.placement}
                                            key={feature.title}
                                        >
                                            <span
                                                className={styles.featureIcon}
                                            >
                                                <Icon aria-hidden='true' />
                                            </span>
                                            <div
                                                className={
                                                    styles.featureContent
                                                }
                                            >
                                                <h3>{feature.title}</h3>
                                                <p>{feature.body}</p>
                                            </div>
                                        </article>
                                    );
                                })}
                        </div>
                    </div>
                </section>

                <footer className={styles.footer}>
                    <span>© 2026 OnTrack</span>
                    <nav aria-label='Support links'>
                        <Link href='https://github.com/Hsiii/OnTrack'>
                            GitHub
                        </Link>
                        <Link href='/docs/support'>支援</Link>
                        <Link href='/docs/privacy'>隱私權</Link>
                    </nav>
                </footer>
            </div>
        </main>
    );
}
