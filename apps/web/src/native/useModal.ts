import { useEffect, useRef } from 'react';

import { usesNativeUI } from './platform';

/** One close path for Escape, Android Back and pointer dismissal; restore focus. */
export function useModal(open: boolean, onClose: () => void) {
    const ref = useRef<HTMLElement | null>(null);
    const closeRef = useRef(onClose);
    useEffect(() => {
        closeRef.current = onClose;
    }, [onClose]);
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const frame = requestAnimationFrame(() => {
            const modal = ref.current;
            if (modal && !modal.contains(document.activeElement)) {
                modal.tabIndex = -1;
                modal.focus({ preventScroll: true });
            }
        });
        const back = (event: Event) => {
            event.preventDefault();
            closeRef.current();
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                back(event);
                return;
            }
            if (event.key !== 'Tab' || !ref.current) return;
            const elements = Array.from(
                ref.current.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input, a[href], [contenteditable="true"], [tabindex="0"]'
                )
            ).filter((el) => el.getClientRects().length);
            const first = elements[0],
                last = elements[elements.length - 1];
            if (
                event.shiftKey &&
                (document.activeElement === first ||
                    document.activeElement === ref.current)
            ) {
                event.preventDefault();
                last?.focus();
            }
            if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        };
        let startY: number | null = null;
        let distance = 0;
        const start = (event: TouchEvent) => {
            const modal = ref.current;
            const target = event.target as HTMLElement;
            if (
                !usesNativeUI() ||
                !modal ||
                event.touches.length !== 1 ||
                target.closest('button, input, a, [contenteditable]')
            )
                return;
            if (
                !target.closest('.settings-header') &&
                !(
                    modal.classList.contains('time-editor-sheet') &&
                    event.touches[0].clientY -
                        modal.getBoundingClientRect().top <
                        24
                )
            )
                return;
            startY = event.touches[0].clientY;
            distance = 0;
        };
        const move = (event: TouchEvent) => {
            if (startY === null || !ref.current) return;
            distance = Math.max(0, event.touches[0].clientY - startY);
            if (distance > 0) {
                event.preventDefault();
                ref.current.style.translate = `0 ${distance}px`;
            }
        };
        const finish = () => {
            if (startY === null) return;
            startY = null;
            if (ref.current) ref.current.style.translate = '';
            if (distance >= 80) closeRef.current();
        };
        const cancel = () => {
            startY = null;
            if (ref.current) ref.current.style.translate = '';
        };
        document.addEventListener('touchstart', start, { passive: true });
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('touchend', finish);
        document.addEventListener('touchcancel', cancel);
        document.addEventListener('keydown', key);
        window.addEventListener('ontrack-back', back);
        return () => {
            cancelAnimationFrame(frame);
            document.body.style.overflow = overflow;
            document.removeEventListener('touchstart', start);
            document.removeEventListener('touchmove', move);
            document.removeEventListener('touchend', finish);
            document.removeEventListener('touchcancel', cancel);
            document.removeEventListener('keydown', key);
            window.removeEventListener('ontrack-back', back);
            previous?.focus({ preventScroll: true });
        };
    }, [open]);
    return ref;
}
