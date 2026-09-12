#!/usr/bin/env python3
"""Read-only release preflight for the deployed Android API and public policy pages."""
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def main():
    origin = os.environ.get('ANDROID_API_ORIGIN', 'https://ontrack.hsichen.dev').rstrip('/')
    problems = []
    for path in ('/api/stations', '/docs/privacy', '/docs/support'):
        base = origin if path.startswith('/api/') else 'https://ontrack.hsichen.dev'
        try:
            request = Request(base + path, headers={'Origin': 'https://localhost', 'User-Agent': 'OnTrack-release-check'})
            with urlopen(request, timeout=30) as response:
                body = response.read().decode('utf-8')
                if path.startswith('/api/'):
                    if response.headers.get('Access-Control-Allow-Origin') != 'https://localhost':
                        problems.append('Deploy the Android CORS allowlist before releasing.')
                    json.loads(body)
                elif path.endswith('privacy') and 'Google Play' not in body:
                    problems.append('Publish the prepared Android/Google Play privacy policy before releasing.')
        except (HTTPError, URLError, ValueError, TimeoutError) as error:
            problems.append(f'{base}{path}: {error}')
    if problems:
        print('\n'.join(problems), file=sys.stderr)
        return 1
    print('Live API accepts the Android origin; Android privacy and support pages are public.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
