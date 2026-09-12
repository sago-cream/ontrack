'use client';

import { useI18n } from '../../../i18n/useI18n';
import styles from '../../legal-page.module.css';
import { LocalizedLegalPage } from '../../LocalizedLegalPage';

const SUPPORT_EMAIL = 'its.hsichen@gmail.com';

function SupportContent() {
    const { t } = useI18n();

    return (
        <>
            <section className={styles.section} aria-labelledby='contact'>
                <h2 id='contact'>{t('support.contact.title')}</h2>
                <div className={styles.callout}>
                    <p>{t('support.contact.body')}</p>
                    <a
                        className={styles.supportAction}
                        href={`mailto:${SUPPORT_EMAIL}`}
                    >
                        {t('support.contact.action')}
                    </a>
                </div>
                <p>
                    {t('support.contact.response', {
                        email: SUPPORT_EMAIL,
                    })}
                </p>
            </section>

            <section className={styles.section} aria-labelledby='faq'>
                <h2 id='faq'>{t('support.faq.title')}</h2>
                <div className={styles.faqList}>
                    <article className={styles.faqItem}>
                        <h3>{t('support.faq.station.title')}</h3>
                        <ul>
                            <li>{t('support.faq.station.locationServices')}</li>
                            <li>{t('support.faq.station.permission')}</li>
                            <li>{t('support.faq.station.wait')}</li>
                        </ul>
                    </article>

                    <article className={styles.faqItem}>
                        <h3>{t('support.faq.times.title')}</h3>
                        <ul>
                            <li>{t('support.faq.times.refresh')}</li>
                            <li>{t('support.faq.times.source')}</li>
                        </ul>
                    </article>

                    <article className={styles.faqItem}>
                        <h3>{t('support.faq.share.title')}</h3>
                        <p>{t('support.faq.share.body')}</p>
                    </article>

                    <article className={styles.faqItem}>
                        <h3>{t('support.faq.bug.title')}</h3>
                        <p>{t('support.faq.bug.include')}</p>
                        <ul>
                            <li>{t('support.faq.bug.device')}</li>
                            <li>{t('support.faq.bug.ios')}</li>
                            <li>{t('support.faq.bug.version')}</li>
                            <li>{t('support.faq.bug.screenshots')}</li>
                            <li>{t('support.faq.bug.steps')}</li>
                        </ul>
                    </article>
                </div>
            </section>
        </>
    );
}

export function SupportPageContent() {
    return (
        <LocalizedLegalPage
            titleKey='support.title'
            subtitleKey='support.subtitle'
            footerLinks={[
                { href: '/docs/privacy', labelKey: 'docs.footer.privacy' },
                { href: '/docs/legal', labelKey: 'docs.footer.legal' },
            ]}
            footerNoteKey='support.footerNote'
        >
            <SupportContent />
        </LocalizedLegalPage>
    );
}
