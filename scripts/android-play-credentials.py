#!/usr/bin/env python3
"""Check credential shape locally; Play Console grants are checked only by Google's API."""
import json
import os
from pathlib import Path
import sys


def main():
    path = os.environ.get('PLAY_SERVICE_ACCOUNT_JSON', '')
    inline = os.environ.get('ANDROID_PUBLISHER_CREDENTIALS', '')
    if not inline and (not path or not Path(path).is_file()):
        sys.exit('PLAY_SERVICE_ACCOUNT_JSON must point to a service-account JSON file.')
    try:
        data = json.loads(inline or Path(path).read_text())
        valid = (data.get('type') == 'service_account'
                 and data.get('client_email', '').endswith('.iam.gserviceaccount.com')
                 and bool(data.get('project_id'))
                 and data.get('private_key', '').startswith('-----BEGIN PRIVATE KEY-----'))
    except (ValueError, OSError, AttributeError):
        valid = False
    if not valid:
        sys.exit('Invalid Play service-account JSON. Download a JSON key for the intended Google Cloud service account.')
    print('Play credential file is present and has the expected service-account fields.')


if __name__ == '__main__':
    main()
