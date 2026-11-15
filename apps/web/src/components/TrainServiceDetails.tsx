import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

import { useI18n } from '../i18n/useI18n';
import { useModal } from '../native/useModal';
import type { TrainInfo } from '../types';

export function TrainServiceDetails({
    train,
    fetchedAt,
    onClose,
}: {
    train: TrainInfo;
    fetchedAt: string | null;
    onClose: () => void;
}) {
    const { t, language } = useI18n();
    const ref = useModal(true, onClose);
    const reason =
        train.suspension === 'partial'
            ? t('train.partialDescription')
            : train.suspension === 'unknown'
              ? t('train.unverifiedDescription')
              : train.suspension === 'origin-stop' ||
                  train.suspension === 'destination-stop'
                ? t('train.stopSuspendedDescription')
                : t('train.cancelledDescription');
    const timestamp =
        fetchedAt && Number.isFinite(Date.parse(fetchedAt))
            ? new Intl.DateTimeFormat(language, {
                  timeZone: 'Asia/Taipei',
                  dateStyle: 'short',
                  timeStyle: 'short',
              }).format(new Date(fetchedAt))
            : null;

    return createPortal(
        <div
            className='settings-backdrop train-service-backdrop'
            onClick={onClose}
        >
            <section
                ref={(element) => {
                    ref.current = element;
                }}
                role='dialog'
                aria-modal='true'
                aria-labelledby='train-service-title'
                className='train-service-details'
                onClick={(event) => event.stopPropagation()}
            >
                <header className='settings-header'>
                    <h2 id='train-service-title'>
                        {train.trainNo} · {t('train.serviceDetails')}
                    </h2>
                    <button
                        type='button'
                        className='settings-close'
                        onClick={onClose}
                        aria-label={t('common.close')}
                    >
                        <X aria-hidden='true' />
                    </button>
                </header>
                <div className='train-service-body'>
                    <p>{reason}</p>
                    {!!train.suspendedStations?.length && (
                        <p>
                            {t('train.suspendedStops', {
                                stations: train.suspendedStations.join('、'),
                            })}
                        </p>
                    )}
                    <p className='train-service-source'>
                        {t('train.timetableSource')}
                        {timestamp && (
                            <>
                                <br />
                                {t('train.snapshotAt', {
                                    time: timestamp,
                                })}{' '}
                                (UTC+8)
                            </>
                        )}
                    </p>
                    <a
                        href='https://www.railway.gov.tw/tra-tip-web/tip/tip007/tip711/blockList'
                        target='_blank'
                        rel='noopener noreferrer'
                    >
                        {t('train.officialNotices')} ↗
                    </a>
                </div>
            </section>
        </div>,
        document.body
    );
}
