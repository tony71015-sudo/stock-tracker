#!/usr/bin/env python3
"""Safely resolve only data/active-etf/status.json in a git rebase conflict.

Git stage 2 is upstream during rebase; stage 3 is the snapshot commit.
Never treats PCF/unverified data as valid; merges metadata only.
"""
import json
import subprocess
from pathlib import Path

PATH = 'data/active-etf/status.json'


def stage(n):
    data = subprocess.check_output(['git', 'show', f':{n}:{PATH}'])
    value = json.loads(data)
    if not isinstance(value, dict) or not isinstance(value.get('etfs'), dict):
        raise ValueError(f'stage {n} missing etfs dictionary')
    return value


def quality(value):
    if not isinstance(value, dict):
        return (-1, '', -1)
    try:
        n = int(value.get('historicalDates') or 0)
    except (ValueError, TypeError):
        n = 0
    date = str(value.get('date') or '')
    states = {'saved': 4, 'ready': 4, 'available': 4, 'retained': 3,
              'partial': 2, 'unavailable': 1, 'not_configured': 0}
    return (n, date, states.get(str(value.get('status') or '').lower(), 1))


def main():
    upstream, incoming = stage(2), stage(3)
    # Preserve upstream's other status metadata. Merge per ETF rather than picking
    # an entire branch's status.json, which would hide concurrently updated funds.
    merged = dict(upstream)
    entries = dict(upstream['etfs'])
    for code, incoming_entry in incoming['etfs'].items():
        if code not in entries or quality(incoming_entry) > quality(entries[code]):
            entries[code] = incoming_entry
    merged['etfs'] = dict(sorted(entries.items()))
    merged['checkedAt'] = max(str(upstream.get('checkedAt') or ''),
                              str(incoming.get('checkedAt') or ''))
    merged['catalogCount'] = len(entries)
    for count_key in ('configuredSources', 'updatedSources'):
        try:
            merged[count_key] = max(int(upstream.get(count_key) or 0),
                                    int(incoming.get(count_key) or 0))
        except (ValueError, TypeError):
            pass
    out = Path(PATH)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(merged, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Merged {len(entries)} ETF statuses without overwriting other ETFs')


if __name__ == '__main__':
    main()
