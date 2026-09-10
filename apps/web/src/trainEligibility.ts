import type { TrainInfo } from './types';

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
