"""Collect official TWSE ETF income distributions without synthesizing missing dividends.

Queries the TWSE ETF history in calendar-year chunks to avoid the long-range
query returning an incomplete response. Dates are stored in ISO form.
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request

CODES = ('0050', '006208', '009816')
LISTED = {'0050': '2003-06-30', '006208': '2012-07-17', '009816': '2026-02-03'}
OUT = pathlib.Path('data/index-etf/dividends')
URL = 'https://www.twse.com.tw/rwd/zh/ETF/etfDiv'
HISTORY_START = {'0050': '2005-01-01', '006208': '2012-07-17'}


def parse_date(value):
    text = re.sub(r'<[^>]+>', '', str(value or '')).strip()
    # TWSE responses may use either Gregorian or ROC calendar notation.
    match = re.search(r'(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})', text)
    if not match:
        match = re.search(r'(\d{2,4})年(\d{1,2})月(\d{1,2})日?', text)
    if not match:
        return None
    year, month, day = map(int, match.groups())
    if year < 1911:
        year += 1911
    try:
        return dt.date(year, month, day).isoformat()
    except ValueError:
        return None


def parse_amount(value):
    text = re.sub(r'<[^>]+>', '', str(value or '')).replace(',', '').strip()
    if not re.fullmatch(r'\d+(?:\\.\d+)?', text):
        return None
    amount = float(text)
    return amount if 0 < amount < 10000 else None


def parse_history(payload, code, start, end):
    if not isinstance(payload, dict) or not isinstance(payload.get('fields'), list) or not isinstance(payload.get('data'), list):
        raise ValueError('TWSE etfDiv response lacks fields/data arrays')
    fields = [re.sub(r'<[^>]+>', '', str(value)).replace(' ', '') for value in payload['fields']]

    def col(*needles):
        return next((i for i, field in enumerate(fields) if any(needle in field for needle in needles)), None)

    symbol_idx = col('證券代號', 'ETF代號')
    ex_idx = col('除息交易日', '除息日')
    pay_idx = col('收益分配發放日', '配息發放日', '發放日期')
    amount_idx = col('收益分配金額', '每單位收益分配金額', '每受益權單位分配金額')
    if None in (symbol_idx, ex_idx, pay_idx, amount_idx):
        raise ValueError('Unknown TWSE etfDiv columns: ' + repr(fields))

    events = {}
    for row in payload['data']:
        if not isinstance(row, (list, tuple)) or len(row) <= max(symbol_idx, ex_idx, pay_idx, amount_idx):
            continue
        symbol = re.sub(r'<[^>]+>', '', str(row[symbol_idx] or '')).strip()
        if symbol != code:
            continue
        ex_date = parse_date(row[ex_idx])
        pay_date = parse_date(row[pay_idx])
        amount = parse_amount(row[amount_idx])
        if (ex_date and pay_date and amount is not None and ex_date <= pay_date
                and start <= ex_date <= end):
            events[ex_date] = {
                'exDate': ex_date,
                'paymentDate': pay_date,
                'amount': amount,
            }
    return list(events.values())


def fetch_year(code, year, retries=3):
    start = f'{year}0101'
    end = f'{year}1231' if year < dt.date.today().year else dt.date.today().strftime('%Y%m%d')
    query = urllib.parse.urlencode({
        'stkNo': code, 'startDate': start, 'endDate': end, 'response': 'json'
    })
    request = urllib.request.Request(URL + '?' + query, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; TradeCompassResearch/1.0)',
        'Accept': 'application/json',
    })
    last_error = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                payload = json.load(response)
            return parse_history(payload, code, f'{year}-01-01', end[:4] + '-' + end[4:6] + '-' + end[6:8])
        except (OSError, ValueError, json.JSONDecodeError) as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'{code} {year}: official TWSE query failed: {last_error}')


def load_archive(path):
    if not path.exists():
        return {}
    try:
        old = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}
    if old.get('etf') != path.stem or not isinstance(old.get('events'), list):
        return {}
    events = {}
    for item in old['events']:
        if not isinstance(item, dict):
            continue
        ex = parse_date(item.get('exDate'))
        pay = parse_date(item.get('paymentDate'))
        amount = parse_amount(item.get('amount'))
        if ex and pay and ex <= pay and amount is not None:
            events[ex] = {'exDate': ex, 'paymentDate': pay, 'amount': amount}
    return {'metadata': old, 'events': events}


def update(code, payload=None):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f'{code}.json'
    previous = load_archive(path)

    # Official fund policy: 009816 does not distribute income.
    if code == '009816':
        out = {
            'schema': 1, 'etf': code, 'source': 'KGI fund profile',
            'sourceUrl': 'https://www.kgifund.com.tw/Fund/Detail?fundID=J023',
            'distributionPolicy': 'none', 'policyVerifiedAsOf': '2026-11-15',
            'listingDate': LISTED[code], 'asOf': dt.date.today().isoformat(),
            'events': [],
            'note': '收益不分配；不得將無現金配息誤判為歷史資料缺漏',
        }
        path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\\n', encoding='utf-8')
        print('009816: official non-distributing ETF; empty events are expected')
        return out

    events = dict(previous.get('events', {}))
    start_year = int(HISTORY_START[code][:4])
    current_year = dt.date.today().year
    failed_years = []
    for year in range(start_year, current_year + 1):
        try:
            rows = fetch_year(code, year) if payload is None else parse_history(
                payload, code, f'{year}-01-01',
                dt.date.today().isoformat() if year == current_year else f'{year}-12-31')
            for row in rows:
                events[row['exDate']] = row
            if rows:
                print(f'{code} {year}: {len(rows)} official dividend events')
        except RuntimeError as error:
            failed_years.append(year)
            print('WARNING:', error)

    if not events:
        raise RuntimeError(f'{code}: no validated distributions; refusing to write an empty dividend archive')

    sorted_events = [events[key] for key in sorted(events)]
    out = {
        'schema': 1,
        'etf': code,
        'source': 'TWSE ETF etfDiv; yearly queries',
        'sourceUrl': URL,
        'listingDate': LISTED[code],
        'coverageStart': HISTORY_START[code],
        'completeBefore2005': False if code == '0050' else None,
        'asOf': dt.date.today().isoformat(),
        'events': sorted_events,
        'firstEventDate': sorted_events[0]['exDate'],
        'lastEventDate': sorted_events[-1]['exDate'],
        'failedYears': failed_years,
        'verificationStatus': 'official-events-collected; failed years listed; history not individually audited',
        'warning': (
            '0050 2003–2004 distributions precede TWSE ETF history coverage; do not infer zero distributions.'
            if code == '0050' else
            'Any failed query years are listed; do not infer zero distributions for those periods.'
        ),
    }
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\\n', encoding='utf-8')
    print(f'{code}: verified_events={len(sorted_events)} first={out["firstEventDate"]} last={out["lastEventDate"]} failed_years={failed_years}')
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--code', choices=CODES)
    args = parser.parse_args()
    failed = []
    for code in [args.code] if args.code else CODES:
        try:
            update(code)
        except RuntimeError as error:
            failed.append(code)
            print('WARNING:', error, flush=True)
    if failed:
        print('WARNING: dividend archives incomplete:', ','.join(failed), flush=True)


if __name__ == '__main__':
    main()
