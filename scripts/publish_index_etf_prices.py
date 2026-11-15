#!/usr/bin/env python3
"""Safely publish only public index ETF price/dividend JSON archives.

Fetch current main and merge by date rather than rebasing the data-producing commit.
No forced pushes, no workflow modifications, no destructive overwrite of unrelated paths.
"""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time

FILES = [*map(lambda c: f'data/index-etf/prices/{c}.json', ('0050', '006208', '009816')),
         *map(lambda c: f'data/index-etf/prices/{c}.coverage.json', ('0050', '006208', '009816')),
         *map(lambda c: f'data/index-etf/dividends/{c}.json', ('0050', '006208', '009816'))]

def git(*args):
    return subprocess.run(['git', *args], check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()

def choose_rows(local, remote):
    # Avoid treating price as a chronological version counter. Same dates favor
    # newly fetched official data, while retaining all non-overlapping days.
    merged = {}
    for source in (remote, local):
        for row in source.get('rows', []):
            if isinstance(row, list) and len(row) == 2:
                merged[row[0]] = row
    base = dict(remote or local)
    base.update(local)
    base['rows'] = [merged[d] for d in sorted(merged)]
    if base['rows']:
        base['asOf'] = base['rows'][-1][0]
    return base

def choose_dividends(local, remote):
    combined = {}
    for source in (remote, local):
        for ev in source.get('events', []):
            if isinstance(ev, dict) and ev.get('exDate'):
                combined[ev['exDate']] = ev
    base = dict(remote or local)
    base.update(local)
    base['events'] = [combined[k] for k in sorted(combined)]
    return base

def main():
    # Run in the checked-out repository, not as a general-purpose merge command.
    with tempfile.TemporaryDirectory() as temp:
        temp = pathlib.Path(temp)
        for name in FILES:
            source = pathlib.Path(name)
            if source.is_file():
                copy_to = temp / name
                copy_to.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, copy_to)
        for attempt in range(1, 6):
            git('fetch', 'origin', 'main')
            # Restore only tracked paths by explicitly resetting to origin/main;
            # staged archives were saved in the temp directory before reset.
            git('reset', '--hard', 'origin/main')
            changed = []
            for name in FILES:
                incoming = temp / name
                if not incoming.is_file():
                    continue
                dest = pathlib.Path(name)
                local = json.loads(incoming.read_text(encoding='utf-8'))
                if dest.is_file():
                    remote = json.loads(dest.read_text(encoding='utf-8'))
                else:
                    remote = {}
                if name.endswith('.coverage.json'):
                    # Coverage is diagnostic; use the latest produced status.
                    merged = local
                elif '/dividends/' in name:
                    merged = choose_dividends(local, remote)
                else:
                    merged = choose_rows(local, remote)
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(json.dumps(merged, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
                changed.append(name)
            if not changed:
                print('No generated archives to publish')
                return
            git('add', '--', *changed)
            if not git('diff', '--cached', '--name-only'):
                print('No new public price or dividend data')
                return
            git('commit', '-m', 'data: backfill official index ETF daily price history')
            try:
                git('push', 'origin', 'HEAD:main')
                print('Published official price archives safely')
                return
            except subprocess.CalledProcessError as ex:
                print(f'Push contention, retry {attempt}/5:', ex.stderr[:250], flush=True)
                time.sleep(2 * attempt)
        raise RuntimeError('Could not publish after 5 attempts; no force push performed')

if __name__ == '__main__':
    main()
