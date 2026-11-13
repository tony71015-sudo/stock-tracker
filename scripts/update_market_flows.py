#!/usr/bin/env python3
"""Fetch TWSE whole-market BFI82U institutional buy/sell *amounts*.

Improved history backfill version for Trade Compass:
- bootstrap backfills enough verified trading days (up to 90 records)
- daily/auto refresh recent windows without treating all non-trading days as fatal
- preserves previously validated history
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'data/institutional/market-flow.json'
URL = 'https://www.twse.com.tw/rwd/zh/fund/BFI82U'
LOG = logging.getLogger('market-flow')
NAMES = {
    'foreign': '外資及陸資(不含外資自營商)',
    'trust': '投信',
    'dealerOwn': '自營商(自行買賣)',
    'dealerHedge': '自營商(避險)',
    'total': '合計',
}


def integer(text):
    if isinstance(text, bool):
        raise ValueError('Boolean amount')
    if isinstance(text, int):
        return text
    if not isinstance(text, str):
        raise ValueError('Invalid TWD amount')
    compact = text.replace(',', '').replace('－', '-').replace('＋', '+').strip()
    if not re.fullmatch(r'[+-]?\d+', compact):
        raise ValueError('Invalid TWD number')
    return int(compact)


def triplet(vals):
    buy, sell, net = (integer(v) for v in vals)
    if buy < 0 or sell < 0 or net != buy - sell:
        raise ValueError('BFI82U net amount mismatch')
    return {'buy': buy, 'sell': sell, 'net': net}


def parse_bfi82u(payload, requested):
    if not isinstance(payload, dict):
        raise ValueError('BFI82U expected JSON object')
    stat = payload.get('stat')
    if stat != 'OK':
        return None
    response_date = str(payload.get('date', ''))
    if response_date != requested.strftime('%Y%m%d'):
        raise ValueError(f'BFI82U date mismatch: requested={requested} received={response_date}')
    rows = payload.get('data')
    fields = payload.get('fields')
    if not isinstance(rows, list) or not isinstance(fields, list) or len(fields) < 4:
        raise ValueError('BFI82U invalid row/column format')
    if not all(x in str(fields[i]) for i, x in enumerate(('單位名稱', '買進金額', '賣出金額', '買賣差額'))):
        raise ValueError('BFI82U unexpected column labels')
    mapping = {}
    for row in rows:
        if not isinstance(row, list) or len(row) != 4:
            raise ValueError('BFI82U unexpected row format')
        name = str(row[0]).strip().replace('（', '(').replace('）', ')').replace(' ', '')
        if name in NAMES.values():
            if name in mapping:
                raise ValueError(f'Duplicate BFI82U row {name}')
            mapping[name] = triplet(row[1:4])
    if not all(name in mapping for name in NAMES.values()):
        raise ValueError('BFI82U required category missing')
    actors = {k: mapping[n] for k, n in NAMES.items()}
    dealer = {k: actors['dealerOwn'][k] + actors['dealerHedge'][k] for k in ('buy', 'sell', 'net')}
    actors['dealer'] = dealer
    for k in ('buy', 'sell', 'net'):
        if actors['foreign'][k] + actors['trust'][k] + dealer[k] != actors['total'][k]:
            raise ValueError(f'BFI82U aggregate mismatch: {k}')
    return {'date': requested.isoformat(), 'actors': actors}


def fetch_day(day, retries=3):
    url = URL + '?' + urlencode({'date': day.strftime('%Y%m%d'), 'response': 'json'})
    for attempt in range(retries):
        try:
            req = Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; TradeCompass/1.4.3; official post-market research)',
                    'Accept': 'application/json',
                    'Referer': 'https://www.twse.com.tw/',
                },
            )
            with urlopen(req, timeout=22) as response:
                raw = response.read(250_000)
                if response.read(1):
                    raise ValueError('Unexpected oversized response')
            return parse_bfi82u(json.loads(raw.decode('utf-8-sig')), day)
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as err:
            if attempt == retries - 1:
                raise RuntimeError(f'{day}: {type(err).__name__}: {err}') from err
            time.sleep(1.5 * (attempt + 1))


def load_previous():
    try:
        data = json.loads(DEST.read_text(encoding='utf-8'))
        if data.get('schema') == 1 and data.get('market') == 'TWSE' and data.get('unit') == 'TWD':
            result = {}
            for row in data.get('records', []):
                day = dt.date.fromisoformat(row['date'])
                actors = row['actors']
                for key in ('foreign', 'trust', 'dealerOwn', 'dealerHedge', 'dealer', 'total'):
                    values = actors[key]
                    if values['buy'] < 0 or values['sell'] < 0 or values['net'] != values['buy'] - values['sell']:
                        raise ValueError('Existing data invalid')
                result[day.isoformat()] = {'date': day.isoformat(), 'actors': actors}
            return result
    except (FileNotFoundError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        pass
    return {}


def candidate_dates(today: dt.date, mode: str, existing_count: int):
    """Yield business weekdays to probe, newest first at runtime after reversal.

    bootstrap: look back far enough to try building ~90 verified trading days.
    auto: if no history, behave like bootstrap; else refresh recent ~15 weekdays.
    daily: refresh recent ~10 weekdays.
    """
    if mode == 'bootstrap' or (mode == 'auto' and existing_count == 0):
        max_calendar = 180
    elif mode == 'daily':
        max_calendar = 20
    else:
        max_calendar = 30
    dates = [today - dt.timedelta(days=i) for i in range(max_calendar - 1, -1, -1)]
    return [d for d in dates if d.weekday() < 5]


def run(today, mode='auto', delay=.65):
    old = load_previous()
    failures = []
    successes = 0
    dates = candidate_dates(today, mode, len(old))

    bootstrap_like = mode == 'bootstrap' or (mode == 'auto' and not old)
    target_records = 90 if bootstrap_like else max(15, len(old))
    recent_cutoff = today - dt.timedelta(days=7)

    for day in dates:
        # Skip already validated older dates on regular refresh, but allow recent re-checks.
        if day.isoformat() in old and not (bootstrap_like and len(old) < target_records) and day < recent_cutoff:
            continue
        try:
            result = fetch_day(day)
            if result:
                old[result['date']] = result
                successes += 1
                LOG.info('TWSE total market BFI82U %s verified', day)
            else:
                LOG.info('TWSE total market BFI82U %s has no official data (holiday/non-trading)', day)
        except Exception as err:
            failures.append(str(err))
            LOG.warning('%s', err)
        if bootstrap_like and len(old) >= target_records:
            break
        time.sleep(max(0, delay))

    rows = [old[k] for k in sorted(old)[-90:]]
    saved = {
        'schema': 1,
        'market': 'TWSE',
        'unit': 'TWD',
        'updatedAt': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'records': rows,
        'lastRunErrors': failures[:30],
        'source': 'https://www.twse.com.tw/zh/trading/foreign/bfi82u.html',
        'notes': '官方上市集中市場三大法人買賣金額彙總（元）。非個股買賣超股數；外資自營商不重複計入。',
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(saved, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    LOG.info('Saved %s validated dates; %s new reports; %s query errors', len(rows), successes, len(failures))
    return saved


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=('auto', 'bootstrap', 'daily'), default='auto')
    parser.add_argument('--today', help='YYYY-MM-DD, for testing/backfill')
    parser.add_argument('--delay', type=float, default=.65)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    day = dt.date.fromisoformat(args.today) if args.today else dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    run(day, args.mode, args.delay)
