#!/usr/bin/env python3
"""Safe, repeatable opt-in insertion of the index-only presentation script.
Never touches institutional.js, institutional data, or any workflows.
"""
import argparse
from pathlib import Path
import re


def patch(source: str) -> tuple[str, bool]:
    tag = '<script src="index_etf_focus.js" defer></script>'
    if tag in source:
        return source, False
    found = list(re.finditer(r'<script\s+src=["\']index_etf\.js["\'][^>]*>\s*</script>', source, flags=re.I))
    if len(found) != 1:
        raise ValueError('找不到唯一的 index_etf.js 載入標籤。為避免覆蓋新版首頁，已停止。')
    m = found[0]
    return source[:m.end()] + '\n' + tag + source[m.end():], True


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--file', default='index.html')
    args = p.parse_args()
    path = Path(args.file)
    content = path.read_text(encoding='utf-8')
    new, changed = patch(content)
    if changed:
        path.write_text(new, encoding='utf-8')
    print('Index ETF focus interface: ' + ('installed' if changed else 'already installed'))


if __name__ == '__main__':
    main()
