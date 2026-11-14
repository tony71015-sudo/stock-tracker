#!/usr/bin/env python3
"""Archive genuine TWSE STOCK_DAY unadjusted ETF closing prices by listing date.

Only monthly market-price data are gathered. ETF portfolio holdings are unrelated.
A missing month remains missing; this module never fabricates prices.
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
LISTED = {
    '0050': dt.date(2003, 6, 30),
    '006208': dt.date(2012, 7, 17),
    '009816': dt.date(2026, 2, 3),
}
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
            parts = str(row[0]).split('/')
            if len(parts) != 3:
                continue
            day = dt.date(int(parts[0]) + 1911, int(parts[1]), int(parts[2]))
            close = float(str(row[6]).replace(',', ''))
            if (day.year, day.month) != (year, month) or day < LISTED[code] or close <= 0:
                continue
            result.append([day.isoformat(), close])
        except (ValueError, TypeError, IndexError):
            continue
    return result


def fetch_month(code, year, month, retries=3):
    query = urllib.parse.urlencode({
        'response': 'json', 'date': f'{year}{month:02d}01', 'stockNo': code,
    })
    req = urllib.request.Request(
        'https://www.twse.com.tw/exchangeReport/STOCK_DAY?' + query,
        headers={'User-Agent': 'Mozilla/5.0 (compatible; TradeCompassResearch/1.0)',
                 'Accept': 'application/json'},
    )
    last_error = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                payload = json.load(response)
            if not isinstance(payload, dict):
                raise ValueError('non-object TWSE response')
            if payload.get('stat') != 'OK':
                raise ValueError(f"TWSE stat: {payload.get('stat', 'missing')}")
            return parse_month(code, year, month, payload)
        except (OSError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt + 1 < retries:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'{year}-{month:02d}: {last_error}')


def refresh(code, today, rebuild=False, backfill=False, pause=0.35, max_months=0):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f'{code}.json'
    old = {}
    if path.exists():
        try:
            old = json.loads(path.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            old = {}
    existing = {}
    for row in old.get('rows', []):
        try:
            day = dt.date.fromisoformat(row[0])
            close = float(row[1])
            if LISTED[code] <= day <= today and close > 0:
                existing[day.isoformat()] = close
        except (TypeError, ValueError, IndexError):
            continue

    first_month = (LISTED[code].year, LISTED[code].month)
    latest_month = (today.year, today.month)
    if rebuild or backfill:
        months = list(month_list(first_month, latest_month))
        if not rebuild:
            present_months = {date[:7] for date in existing}
            # Always refresh current month, and fill any genuinely absent historical month.
            months = [(y, m) for y, m in months
                      if f'{y}-{m:02d}' not in present_months or (y, m) == latest_month]
    elif existing:
        latest = max(existing)
        y, m = map(int, latest[:7].split('-'))
        months = list(month_list((y, m), latest_month))
    else:
        # A fresh installation still begins from the ETF's actual first listed month.
        months = list(month_list(first_month, latest_month))
    if max_months > 0 and len(months) > max_months:
        # Preserve a daily quote refresh even during a multi-month historical backfill.
        if backfill and not rebuild and latest_month in months:
            months = months[:max(0, max_months - 1)] + [latest_month]
        else:
            months = months[:max_months]

    errors = []
    downloaded = 0
    completed = 0
    for y, m in months:
        try:
            rows = fetch_month(code, y, m)
            for date, close in rows:
                existing[date] = close
            downloaded += len(rows)
            completed += 1
        except RuntimeError as exc:
            errors.append(str(exc))
        time.sleep(pause)

    if not existing:
        raise RuntimeError(f'{code}: no valid official closing prices; errors={errors[:4]}')
    output_rows = [[day, existing[day]] for day in sorted(existing)]
    payload = {
        'schema': 1, 'etf': code, 'source': 'TWSE STOCK_DAY',
        'priceType': 'unadjusted_close', 'listingDate': LISTED[code].isoformat(),
        'asOf': output_rows[-1][0], 'rows': output_rows,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{code}: listing={LISTED[code]} first_saved={output_rows[0][0]} '
          f'last_saved={output_rows[-1][0]} rows={len(output_rows)} '
          f'months_attempted={len(months)} months_ok={completed} '
          f'new_or_refetched_rows={downloaded} errors={len(errors)}', flush=True)
    for item in errors[:15]:
        print('WARNING:', code, item, flush=True)
    if errors:
        print(f'WARNING: {code} still has {len(errors)} failed month(s); rerun with --backfill '
              'to retry missing historical months.', flush=True)
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--rebuild', action='store_true',
                        help='re-fetch every month since each ETF listing date')
    parser.add_argument('--backfill', action='store_true',
                        help='fetch missing historical months while preserving existing data')
    parser.add_argument('--max-months', type=int, default=0,
                        help='optional per-ETF cap, useful for incremental backfill (0 = unlimited)')
    parser.add_argument('--code', choices=CODES, help='only this ETF, otherwise all three')
    args = parser.parse_args()
    if args.max_months < 0:
        parser.error('--max-months must be >= 0')
    today = dt.date.today()
    for code in [args.code] if args.code else CODES:
        refresh(code, today, args.rebuild, args.backfill, max_months=args.max_months)


if __name__ == '__main__':
    main()
