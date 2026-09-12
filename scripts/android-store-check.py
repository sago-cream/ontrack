#!/usr/bin/env python3
"""Validate the committed Play listing without an SDK, account, or third-party packages."""
import argparse
import hashlib
from pathlib import Path
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parents[1]


def png_info(path):
    data = path.read_bytes()
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError(f'{path}: expected PNG')
    offset, info, ended = 8, None, False
    while offset < len(data):
        size = struct.unpack('>I', data[offset:offset + 4])[0]
        chunk = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + size]
        checksum = struct.unpack('>I', data[offset + 8 + size:offset + 12 + size])[0]
        if zlib.crc32(chunk + payload) != checksum:
            raise ValueError(f'{path}: corrupt PNG chunk')
        if chunk == b'IHDR':
            info = struct.unpack('>IIBBBBB', payload)
        if chunk == b'IEND':
            ended = True
            break
        offset += size + 12
    if not info or not ended:
        raise ValueError(f'{path}: incomplete PNG')
    width, height, depth, color, *_ = info
    return width, height, depth, color


def check_listing(root):
    problems = []
    for locale in ('en-US', 'zh-TW'):
        folder = root / 'listings' / locale
        for name, limit in (('title.txt', 30), ('short-description.txt', 80),
                            ('full-description.txt', 4000), (f'../../release-notes/{locale}/default.txt', 500)):
            try:
                text = (folder / name).read_text().strip()
                if not 1 <= len(text) <= limit:
                    problems.append(f'{locale}/{name}: needs 1–{limit} characters, got {len(text)}')
            except OSError:
                problems.append(f'{locale}/{name}: missing')
        images = folder / 'graphics'
        for name, size, color in (('icon/ontrack-icon.png', (512, 512), 6), ('feature-graphic/ontrack-feature.png', (1024, 500), 2)):
            try:
                w, h, depth, actual_color = png_info(images / name)
                if (w, h) != size or depth != 8 or actual_color not in ((2, 6) if color == 6 else (2,)):
                    problems.append(f'{locale}/{name}: expected {size}, 8-bit {"RGBA" if color == 6 else "RGB"}')
                if name == 'icon/ontrack-icon.png' and (images / name).stat().st_size > 1024 * 1024:
                    problems.append(f'{locale}/{name}: exceeds 1 MB')
            except (OSError, ValueError, struct.error) as error:
                problems.append(f'{locale}/{name}: {error}')
        screenshots = sorted((images / 'phone-screenshots').glob('*.png'))
        if not 2 <= len(screenshots) <= 8:
            problems.append(f'{locale}: requires 2–8 phone screenshots, got {len(screenshots)}')
        hashes = set()
        for screenshot in screenshots:
            try:
                w, h, depth, color = png_info(screenshot)
                if min(w, h) < 320 or max(w, h) > 3840 or max(w, h) > min(w, h) * 2:
                    problems.append(f'{screenshot}: invalid Play screenshot dimensions {w}×{h}')
                if depth != 8 or color != 2:
                    problems.append(f'{screenshot}: expected 24-bit RGB PNG without alpha')
                digest = hashlib.sha256(screenshot.read_bytes()).digest()
                if digest in hashes:
                    problems.append(f'{screenshot}: duplicate screenshot')
                hashes.add(digest)
            except (OSError, ValueError, struct.error) as error:
                problems.append(f'{screenshot}: {error}')
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--listing', type=Path, default=ROOT / 'apps/android/app/src/main/play')
    args = parser.parse_args()
    problems = check_listing(args.listing)
    if problems:
        print('\n'.join(problems), file=sys.stderr)
        return 1
    print('Play listing ready: English and Traditional Chinese copy, icons, feature graphics, and screenshots.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
