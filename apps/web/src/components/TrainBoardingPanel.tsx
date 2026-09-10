import { Share } from 'lucide-react';

import { useI18n } from '../i18n/useI18n';
import {
    createShareMessageTemplateValues,
    renderShareMessageTemplate,
} from '../shareMessage';
import type { TrainInfo } from '../types';
import type { TimeMode } from './TimeSelector';
import { addMinutes, parseTrainType, TrainList } from './TrainList';

import './TrainBoardingPanel.css';

interface TrainBoardingPanelProps {
    canLoadSchedule: boolean;
    originId: string;
    destId: string;
    originName: string;
    destName: string;
    date: string;
    time: string;
    timeMode: TimeMode;
    selectedTrain: TrainInfo | null;
    electronicTicketOnly: boolean;
    messageTemplate: string;
    onSelectTrain: (train: TrainInfo) => void;
    refreshLiveNonce?: number;
    onRefreshingLiveChange?: (isRefreshing: boolean) => void;
}

function getAdjustedArrivalTime(train: TrainInfo) {
    const delay = train.delay ?? 0;

    return delay > 0 ? addMinutes(train.arrivalTime, delay) : train.arrivalTime;
}

export function TrainBoardingPanel({
    canLoadSchedule,
    originId,
    destId,
    originName,
    destName,
    date,
    time,
    timeMode,
    selectedTrain,
    electronicTicketOnly,
    messageTemplate,
    onSelectTrain,
    refreshLiveNonce = 0,
    onRefreshingLiveChange,
}: TrainBoardingPanelProps) {
    const { t, language } = useI18n();
    const activeTrain = canLoadSchedule ? selectedTrain : null;
    const adjustedArrivalTime = activeTrain
        ? getAdjustedArrivalTime(activeTrain)
        : '';
    const trainType = activeTrain
        ? parseTrainType(activeTrain.trainType, language)
        : '';
    const shareMessage = activeTrain
        ? renderShareMessageTemplate(
              messageTemplate,
              createShareMessageTemplateValues({
                  train: activeTrain,
                  origin: originName,
                  destination: destName,
                  trainType,
                  arrivalTime: adjustedArrivalTime,
                  line:
                      activeTrain.tripLine === 1
                          ? t('train.mountainLine')
                          : activeTrain.tripLine === 2
                            ? t('train.coastLine')
                            : '',
                  delay:
                      (activeTrain.delay ?? 0) > 0
                          ? t('train.delayedBy', {
                                minutes: activeTrain.delay ?? 0,
                            })
                          : t('train.onTime'),
              })
          )
        : null;
    const shareSummary =
        shareMessage ??
        (canLoadSchedule ? t('train.noTrainsAvailable') : t('app.selectRoute'));

    const handleShare = async () => {
        if (!shareMessage) return;

        if (navigator.share) {
            try {
                await navigator.share({ text: shareMessage });
            } catch (error) {
                console.log('Share canceled', error);
            }
            return;
        }

        try {
            await navigator.clipboard.writeText(shareMessage);
        } catch (error) {
            console.error('Copy failed', error);
        }
    };

    return (
        <section
            className='train-boarding-panel'
            aria-labelledby='train-boarding-title'
        >
            <div className='train-boarding-section'>
                <h2
                    id='train-boarding-title'
                    className='train-boarding-heading'
                >
                    {t('train.shareInfo')}
                </h2>

                <div className='train-boarding-summary'>
                    <div className='train-boarding-copy'>
                        <p aria-live='polite'>{shareSummary}</p>
                    </div>

                    <button
                        type='button'
                        className='train-boarding-share-button'
                        onClick={handleShare}
                        disabled={!shareMessage}
                        aria-label={t('share.shareMessage')}
                        title={t('share.shareMessage')}
                    >
                        <Share aria-hidden='true' />
                    </button>
                </div>
            </div>

            <div className='train-boarding-list'>
                {canLoadSchedule ? (
                    <TrainList
                        key={`${originId}-${destId}`}
                        originId={originId}
                        destId={destId}
                        date={date}
                        time={time}
                        timeMode={timeMode}
                        electronicTicketOnly={electronicTicketOnly}
                        onSelect={onSelectTrain}
                        selectedTrainNo={activeTrain?.trainNo || null}
                        refreshLiveNonce={refreshLiveNonce}
                        onRefreshingLiveChange={onRefreshingLiveChange}
                        showHeading
                    />
                ) : (
                    <div className='train-boarding-empty' aria-hidden='true' />
                )}
            </div>
        </section>
    );
}
