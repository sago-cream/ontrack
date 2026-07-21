'use client';

import { useI18n } from '../../../i18n/useI18n';
import styles from '../../legal-page.module.css';
import { LocalizedLegalPage } from '../../LocalizedLegalPage';

const SUPPORT_EMAIL = 'its.hsichen@gmail.com';

function PrivacyContent() {
    const { t } = useI18n();

    return (
        <>
            <section className={styles.section} aria-labelledby='overview'>
                <h2 id='overview'>{t('privacy.overview.title')}</h2>
                <div className={styles.callout}>
                    <strong>{t('privacy.summary.title')}</strong>
                    <dl className={styles.summaryList}>
                        <div className={styles.summaryItem}>
                            <dt>{t('privacy.summary.location.title')}</dt>
                            <dd>{t('privacy.summary.location.body')}</dd>
                        </div>
                        <div className={styles.summaryItem}>
                            <dt>{t('privacy.summary.lookups.title')}</dt>
                            <dd>{t('privacy.summary.lookups.body')}</dd>
                        </div>
                        <div className={styles.summaryItem}>
                            <dt>{t('privacy.summary.local.title')}</dt>
                            <dd>{t('privacy.summary.local.body')}</dd>
                        </div>
                        <div className={styles.summaryItem}>
                            <dt>{t('privacy.summary.aggregates.title')}</dt>
                            <dd>{t('privacy.summary.aggregates.body')}</dd>
                        </div>
                    </dl>
                </div>
                <p>{t('privacy.overview.body')}</p>
            </section>

            <section className={styles.section} aria-labelledby='collect'>
                <h2 id='collect'>{t('privacy.collect.title')}</h2>

                <article className={styles.faqItem}>
                    <h3>{t('privacy.collect.location.title')}</h3>
                    <p>{t('privacy.collect.location.body')}</p>
                    <ul>
                        <li>{t('privacy.collect.location.detect')}</li>
                        <li>{t('privacy.collect.location.fill')}</li>
                        <li>{t('privacy.collect.location.fallback')}</li>
                    </ul>
                    <p>{t('privacy.collect.location.noRaw')}</p>
                </article>

                <article className={styles.faqItem}>
                    <h3>{t('privacy.collect.schedule.title')}</h3>
                    <p>{t('privacy.collect.schedule.request')}</p>
                    <p>{t('privacy.collect.schedule.aggregate')}</p>
                </article>

                <article className={styles.faqItem}>
                    <h3>{t('privacy.collect.local.title')}</h3>
                    <p>{t('privacy.collect.local.body')}</p>
                    <p>{t('privacy.collect.local.noProfile')}</p>
                </article>

                <article className={styles.faqItem}>
                    <h3>{t('privacy.collect.analytics.title')}</h3>
                    <p>{t('privacy.collect.analytics.body')}</p>
                </article>

                <article className={styles.faqItem}>
                    <h3>{t('privacy.collect.personal.title')}</h3>
                    <p>{t('privacy.collect.personal.body')}</p>
                </article>
            </section>

            <section className={styles.section} aria-labelledby='third-party'>
                <h2 id='third-party'>{t('privacy.thirdParty.title')}</h2>
                <p>{t('privacy.thirdParty.intro')}</p>
                <ul>
                    <li>{t('privacy.thirdParty.apple')}</li>
                    <li>{t('privacy.thirdParty.railway')}</li>
                    <li>{t('privacy.thirdParty.cloudflare')}</li>
                </ul>
            </section>

            <section className={styles.section} aria-labelledby='sharing'>
                <h2 id='sharing'>{t('privacy.sharing.title')}</h2>
                <p>{t('privacy.sharing.neverSold')}</p>
                <p>{t('privacy.sharing.body')}</p>
            </section>

            <section className={styles.section} aria-labelledby='retention'>
                <h2 id='retention'>{t('privacy.retention.title')}</h2>
                <p>{t('privacy.retention.body')}</p>
            </section>

            <section className={styles.section} aria-labelledby='rights'>
                <h2 id='rights'>{t('privacy.rights.title')}</h2>
                <ul>
                    <li>{t('privacy.rights.disableLocation')}</li>
                    <li>
                        {t('privacy.rights.contact', {
                            email: SUPPORT_EMAIL,
                        })}
                    </li>
                </ul>
            </section>

            <section className={styles.section} aria-labelledby='contact'>
                <h2 id='contact'>{t('privacy.contact.title')}</h2>
                <p>
                    <a
                        className={styles.inlineLink}
                        href={`mailto:${SUPPORT_EMAIL}`}
                    >
                        {SUPPORT_EMAIL}
                    </a>
                </p>
            </section>
        </>
    );
}

export function PrivacyPageContent() {
    return (
        <LocalizedLegalPage
            titleKey='privacy.title'
            metaKey='privacy.meta'
            subtitleKey='privacy.subtitle'
            footerLinks={[
                { href: '/docs/support', labelKey: 'docs.footer.support' },
                { href: '/docs/legal', labelKey: 'docs.footer.legal' },
            ]}
            footerNoteKey='privacy.footerNote'
        >
            <PrivacyContent />
        </LocalizedLegalPage>
    );
}
