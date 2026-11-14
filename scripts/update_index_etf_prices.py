#!/usr/bin/env python3
"""Archive official TWSE monthly daily closing prices for index ETFs.

No PCF/holdings are ever inferred from price data. Outputs date+unadjusted close.
"""
import argparse
import datetime as dt
import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

CODES = ('0050', '006208', '009816')
START = {'0050': (2024, 1), '006208': (2024, 1), '009816': (2026, 2)}
OUT = pathlib.Path('data/index-etf/prices')


def month_list(begin, end):
    y, m = begin
    while (y, m) <= end:
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


def parse_month(code, year, month, payload):
    if payload.get('stat') != 'OK':
        return []
    result = []
    for row in payload.get('data', []):
        try:
            local = str(row[0]).split('/')
            if len(local) != 3:
                continue
            date = dt.date(int(local[0]) + 1911, int(local[1]), int(local[2]))
            close = float(str(row[6]).replace(',', ''))
            if (date.year, date.month) != (year, month) or close <= 0:
                continue
            result.append([date.isoformat(), close])
        except (ValueError, TypeError, IndexError):
            continue
    return result


def fetch_month(code, year, month):
    q = urllib.parse.urlencode({'response': 'json', 'date': f'{year}{month:02d}01', 'stockNo': code})
    request = urllib.request.Request('https://www.twse.com.tw/exchangeReport/STOCK_DAY?' + q,
        headers={'User-Agent': 'TradeCompassPersonalResearch/1.0 (public historical closing prices)', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=25) as r:
        return parse_month(code, year, month, json.load(r))


def refresh(code, today, rebuild=False, pause=0.25):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f'{code}.json'
    old = {}
    if path.exists():
        try:
            old = json.loads(path.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            old = {}
    existing = {r[0]: r[1] for r in old.get('rows', []) if isinstance(r, list) and len(r) >= 2}
    begin = START[code]
    if existing and not rebuild:
        latest = max(existing)
        y, m = map(int, latest[:7].split('-'))
        begin = (y, m)  # refetch the last saved month to accommodate corrections
    errors = []
    downloaded = 0
    for y, m in month_list(begin, (today.year, today.month)):
        try:
            data = fetch_month(code, y, m)
            for date, close in data:
                existing[date] = close
            downloaded += len(data)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            errors.append(f'{y}-{m:02d}: {exc}')
        time.sleep(pause)
    if not existing:
        raise RuntimeError(f'{code}: no valid historical closing prices; errors: {errors[:4]}')
    rows = [[d, existing[d]] for d in sorted(existing) if d <= today.isoformat()]
    payload = {'schema': 1, 'etf': code, 'source': 'TWSE STOCK_DAY', 'priceType': 'unadjusted_close',
               'asOf': rows[-1][0], 'rows': rows}
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{code}: rows={len(rows)} new_or_refetched={downloaded} latest={rows[-1][0]} errors={len(errors)}')
    for item in errors[:5]:
        print('WARNING:', code, item)
    return payload


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--rebuild', action='store_true', help='re-fetch all months from configured start')
    p.add_argument('--code', choices=CODES, help='one fund only, otherwise all three')
    args = p.parse_args()
    today = dt.date.today()
    for code in [args.code] if args.code else CODES:
        refresh(code, today, args.rebuild)


if __name__ == '__main__':
    main()
