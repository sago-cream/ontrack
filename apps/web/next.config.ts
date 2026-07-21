import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const API_ORIGIN =
    process.env.ONTRACK_API_ORIGIN ?? 'https://ontrack.hsichen.dev';
const TURBOPACK_ROOT = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../..'
);

const nextConfig = (phase: string): NextConfig => {
    const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;

    return {
        allowedDevOrigins: ['127.0.0.1'],
        turbopack: {
            root: TURBOPACK_ROOT,
        },
        ...(isDevServer ? {} : { output: 'export' as const }),
        reactCompiler: true,
        ...(isDevServer
            ? {
                  async rewrites() {
                      return [
                          {
                              source: '/api/:path*',
                              destination: `${API_ORIGIN}/api/:path*`,
                          },
                      ];
                  },
              }
            : {}),
    };
};

export default nextConfig;
