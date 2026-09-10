import { Capacitor, registerPlugin } from '@capacitor/core';

export type AppearanceMode =
    | 'system'
    | 'light'
    | 'dark'
    | 'sage'
    | 'amethyst'
    | 'ember';
export type AppIcon = 'primary' | 'dark' | 'sage' | 'amethyst' | 'ember';
export interface NativeState {
    supporter: boolean;
    price?: string;
    icon: AppIcon;
    updateVersion?: number;
    billingAvailable: boolean;
}
interface NativeAppPlugin {
    locale(): Promise<{ language: string }>;
    state(): Promise<NativeState>;
    purchase(): Promise<NativeState>;
    restore(): Promise<NativeState>;
    setIcon(options: { icon: AppIcon }): Promise<void>;
    appearance(options: { dark: boolean; background: string }): Promise<void>;
    share(options: { text: string }): Promise<void>;
    haptic(): Promise<void>;
    ignoreUpdate(options: { version: number }): Promise<void>;
    openStore(): Promise<void>;
    openLocationSettings(): Promise<void>;
    saveWidget(options: { snapshot: string }): Promise<void>;
}
export const NativeApp = registerPlugin<NativeAppPlugin>('OnTrackNative');
export const isAndroid = () => Capacitor.getPlatform() === 'android';
export function isNativePreview() {
    return (
        typeof window !== 'undefined' &&
        (process.env.NODE_ENV !== 'production' ||
            process.env.NEXT_PUBLIC_ONTRACK_SHOWCASE_MODE === '1') &&
        new URLSearchParams(window.location.search).has('showcase') &&
        new URLSearchParams(window.location.search).has('native')
    );
}
export const usesNativeUI = () => isAndroid() || isNativePreview();
export function selectionFeedback() {
    if (isAndroid()) void NativeApp.haptic().catch(() => {});
}
export function resolvedTheme(mode: AppearanceMode, systemDark: boolean) {
    return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
}
export const themeBackground = {
    light: '#f8fafc',
    dark: '#0f172a',
    sage: '#f6faf4',
    amethyst: '#181620',
    ember: '#231f1f',
};
export function isDarkTheme(mode: Exclude<AppearanceMode, 'system'>) {
    return mode === 'dark' || mode === 'amethyst' || mode === 'ember';
}

export const SystemBars = registerPlugin<{
    setStyle(options: { style: string }): Promise<void>;
}>('SystemBars');
