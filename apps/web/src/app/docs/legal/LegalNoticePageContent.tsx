'use client';

import { useI18n } from '../../../i18n/useI18n';
import styles from '../../legal-page.module.css';
import { LocalizedLegalPage } from '../../LocalizedLegalPage';

function LegalNoticeContent() {
    const { t } = useI18n();

    return (
        <section className={styles.section} aria-labelledby='trademarks'>
            <h2 id='trademarks'>{t('legal.trademarks.title')}</h2>
            <p>{t('legal.trademarks.apple')}</p>
        </section>
    );
}

export function LegalNoticePageContent() {
    return (
        <LocalizedLegalPage
            titleKey='legal.title'
            subtitleKey='legal.subtitle'
            footerLinks={[
                { href: '/docs/privacy', labelKey: 'docs.footer.privacy' },
                { href: '/docs/support', labelKey: 'docs.footer.support' },
            ]}
            footerNoteKey='legal.footerNote'
        >
            <LegalNoticeContent />
        </LocalizedLegalPage>
    );
}
