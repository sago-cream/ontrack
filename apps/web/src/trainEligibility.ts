import type { TrainInfo } from './types';

export function canBoardTrain(train: TrainInfo): boolean {
    return (
        train.status !== 'cancelled' &&
        !train.suspension &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(train.departureTime) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(train.arrivalTime)
    );
}

const ELECTRONIC_TICKET_UNSUPPORTED_TRAIN_MARKERS = [
    '觀光',
    '團體',
    '太魯閣',
    '普悠瑪',
    '新自強',
    '3000',
    '專開',
    '商務',
    '親子',
    '郵輪',
];

export function supportsElectronicTicket(train: TrainInfo): boolean {
    return !ELECTRONIC_TICKET_UNSUPPORTED_TRAIN_MARKERS.some((marker) =>
        train.trainType.includes(marker)
    );
}
