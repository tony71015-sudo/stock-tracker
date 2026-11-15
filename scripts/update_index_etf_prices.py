#!/usr/bin/env python3
"""Idempotent official TWSE ETF daily price archive and missing-month backfill.

Output is backwards-compatible with Trade Compass v1.6.4:
    data/index-etf/prices/<ticker>.json {schema, etf, rows: [[YYYY-MM-DD, close], ...]}
Do not interpolate quotes, and do not mistake prices for complete ETF holdings.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import random
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

LISTED = {'0050': dt.date(2003, 6, 30),
          '006208': dt.date(2012, 7, 17),
          '009816': dt.date(2026, 2, 3)}
# The official STOCK_DAY endpoint rejects earlier query dates. Older 0050 prices
# must come from a separately verified official archive, never simulated.
STOCK_DAY_FIRST = dt.date(2010, 1, 4)
ROOT = Path('data/index-etf/prices')
URL = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY'


def months(start: dt.date, end: dt.date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield (y, m)
        m += 1
        if m == 13:
            y, m = y + 1, 1


def parse_payload(payload: dict, code: str, year: int, month: int, today: dt.date):
    if not isinstance(payload, dict) or payload.get('stat') != 'OK':
        raise ValueError('TWSE stat: ' + str(payload.get('stat') if isinstance(payload, dict) else 'invalid response'))
    fields = [str(x).replace(' ', '') for x in payload.get('fields', [])]
    try:
        date_i = fields.index('日期')
        close_i = fields.index('收盤價')
    except ValueError as exc:
        raise ValueError('TWSE response missing date/close columns: ' + str(fields)) from exc
    parsed = {}
    for row in payload.get('data', []):
        try:
            roc, mm, dd = str(row[date_i]).strip().split('/')
            day = dt.date(int(roc) + 1911, int(mm), int(dd))
            raw = str(row[close_i]).replace(',', '').strip()
            if raw in ('', '--', '---', '除權息'):
                continue
            price = float(raw)
            if (day.year, day.month) == (year, month) and LISTED[code] <= day <= today and price > 0:
                parsed[day.isoformat()] = round(price, 6)
        except (ValueError, TypeError, IndexError):
            continue
    return parsed


def official_month(code, year, month, today, attempts=3):
    query = urlencode({'response': 'json', 'date': f'{year}{month:02d}01', 'stockNo': code})
    req = Request(URL + '?' + query, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; TradeCompassResearch/1.0)',
        'Accept': 'application/json'})
    for n in range(attempts):
        try:
            with urlopen(req, timeout=35) as response:
                payload = json.load(response)
            return parse_payload(payload, code, year, month, today)
        except (OSError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            if n == attempts - 1:
                raise RuntimeError(f'{code} {year}-{month:02d}: {exc}') from exc
            time.sleep(min(12, 2 ** (n + 1)))


def load_archive(code: str, today: dt.date):
    path = ROOT / f'{code}.json'
    if not path.exists():
        return {}
    doc = json.loads(path.read_text(encoding='utf-8'))
    if doc.get('etf') not in (None, code):
        raise ValueError(f'ETF mismatch in {path}')
    rows = {}
    for row in doc.get('rows', []):
        try:
            d = dt.date.fromisoformat(row[0])
            p = float(row[1])
            if LISTED[code] <= d <= today and p > 0:
                rows[d.isoformat()] = p
        except (ValueError, TypeError, IndexError):
            continue
    return rows


def save_archive(code: str, rows: dict, errors: list, today: dt.date):
    path = ROOT / f'{code}.json'
    if not rows:
        print(f'WARNING {code}: no valid official historical prices; not writing an empty archive', flush=True)
        # Still publish a diagnostic record, rather than silently omitting 006208.
        ROOT.mkdir(parents=True, exist_ok=True)
        eligible = max(LISTED[code], STOCK_DAY_FIRST)
        target = [f'{y}-{m:02d}' for y, m in months(eligible, today)]
        diag = ROOT / f'{code}.coverage.json'
        diag.write_text(json.dumps({'etf': code, 'listingDate': LISTED[code].isoformat(),
              'source': URL, 'rows': 0, 'targetMonths': len(target), 'monthsWithPrices': 0,
              'missingMonthCount': len(target), 'missingMonthExamples': target[:40],
              'failedRequests': errors[:40], 'status': 'no-data',
              'generatedAtUTC': dt.datetime.now(dt.timezone.utc).isoformat()},
              ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        return
    values = [[d, rows[d]] for d in sorted(rows)]
    payload = {'schema': 1, 'etf': code, 'source': 'TWSE STOCK_DAY',
               'sourceUrl': URL, 'priceType': 'unadjusted_close',
               'listingDate': LISTED[code].isoformat(), 'asOf': values[-1][0],
               'rows': values}
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    os.replace(tmp, path)
    eligible = max(LISTED[code], STOCK_DAY_FIRST)
    target = [f'{y}-{m:02d}' for y, m in months(eligible, today)]
    present = {date[:7] for date in rows}
    missing_months = [m for m in target if m not in present]
    status = {'etf': code, 'listingDate': LISTED[code].isoformat(),
              'source': URL, 'earliestQuerySupported': STOCK_DAY_FIRST.isoformat(),
              'earliestSaved': values[0][0], 'latestSaved': values[-1][0],
              'rows': len(values), 'targetMonths': len(target), 'monthsWithPrices': len(target)-len(missing_months),
              'missingMonthCount': len(missing_months), 'missingMonthExamples': missing_months[:40],
              'failedRequests': errors[:40],
              'pre2010OfficialDataUnavailable': code == '0050',
              'warning': ('STOCK_DAY cannot supply 0050 2003-2009 data; use a verified alternate source.'
                          if code == '0050' else None),
              'generatedAtUTC': dt.datetime.now(dt.timezone.utc).isoformat()}
    # Diagnostic status kept separate, so front-end price schema stays unchanged.
    diag = ROOT / f'{code}.coverage.json'
    diag.write_text(json.dumps(status, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'COVERAGE {code}: {len(values)} days; {len(target)-len(missing_months)}/{len(target)} months; missing={len(missing_months)}; earliest={values[0][0]}; latest={values[-1][0]}', flush=True)


def run(code: str, today: dt.date, max_missing: int, pause: float, full: bool):
    rows = load_archive(code, today)
    eligible = max(LISTED[code], STOCK_DAY_FIRST)
    all_months = list(months(eligible, today))
    available = {s[:7] for s in rows}
    missing = [ym for ym in all_months if f'{ym[0]}-{ym[1]:02d}' not in available]
    # Explicitly fetch latest and previous months to refresh in-month changes.
    recent = all_months[-2:]
    if full:
        selected = all_months
    else:
        selected = missing[:max_missing] + [ym for ym in recent if ym not in missing[:max_missing]]
    failed = []
    print(f'[{code}] listing={LISTED[code]} had={len(rows)} official_supported_from={eligible} '
          f'missing_months={len(missing)} selected={len(selected)}', flush=True)
    for i, (year, month) in enumerate(selected, 1):
        try:
            got = official_month(code, year, month, today)
            rows.update(got)
            print(f'[{code}] {i}/{len(selected)} {year}-{month:02d} rows={len(got)}', flush=True)
        except RuntimeError as ex:
            failed.append(str(ex))
            print('WARNING', ex, flush=True)
        if pause:
            time.sleep(pause)
    save_archive(code, rows, failed, today)
    return len(rows), len(failed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--code', choices=tuple(LISTED), help='one ETF; default all')
    parser.add_argument('--max-missing-months', type=int, default=18,
                        help='missing months to attempt per ETF per run (default 18)')
    parser.add_argument('--full', action='store_true', help='attempt every supported official month now')
    parser.add_argument('--pause', type=float, default=0.7, help='seconds between requests')
    args = parser.parse_args()
    if args.max_missing_months < 1 or args.pause < 0:
        parser.error('max-missing-months must be >=1, pause must be >=0')
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    root = [args.code] if args.code else list(LISTED)
    failed = []
    for code in root:
        try:
            _, errors = run(code, today, args.max_missing_months, args.pause, args.full)
            if errors: failed.append(code)
        except Exception as exc:
            print(f'WARNING {code}: {exc}', flush=True)
            failed.append(code)
    if failed:
        print('WARNING: some official queries failed:', ','.join(failed), 'archives preserved', flush=True)
    # Partial upstream failures must not erase valid files. Diagnostic details are in .coverage.json.


if __name__ == '__main__':
    main()
