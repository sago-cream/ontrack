import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'dev.hsichen.ontrack',
    appName: 'OnTrack',
    webDir: 'apps/web/out',
    loggingBehavior: 'debug',
    android: {
        path: 'apps/android',
        backgroundColor: '#ffffff',
        minWebViewVersion: 111,
    },
    server: {
        appStartPath: '/app.html',
        androidScheme: 'https',
    },
};

export default config;
