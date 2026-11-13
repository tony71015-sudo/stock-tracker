#!/usr/bin/env python3
"""Trade Compass: public TWSE T86 and TPEx daily institutional net volumes.

Data are measured in shares (NOT lots); no credentials, no private trades.
Cached daily JSONs are written to data/institutional; GitHub Pages serves them.

Use Python 3.10+ standard library only. API schemas are validated so silently
changed positional columns cannot turn into misleading trading signals.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
from pathlib import Path
import random
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'institutional'
DAY_DIR = DATA / 'days'
FIVE = (5, 10, 20, 60)
MARKETS = ('TWSE', 'TPEX')
USER_AGENT = 'Mozilla/5.0 (compatible; TradeCompassInstitutional/1.3; research; public daily data)'
LOG = logging.getLogger('institutions')


def number(value):
    if isinstance(value, bool): raise ValueError('Boolean is not a volume')
    if isinstance(value, int): return value
    if isinstance(value, float) and value.is_integer(): return int(value)
    if not isinstance(value, str): raise ValueError('Non-numeric volume')
    text = value.strip().replace(',', '').replace('＋', '+').replace('－', '-')
    if not re.fullmatch(r'[+-]?\d+', text): raise ValueError(f'Non-integer volume {value!r}')
    return int(text)


def symbol_code(v):
    return str(v).strip().replace('\u3000', '').upper()


def valid_stock_id(v):
    # TWSE/TPEx include stocks, ETFs, TDRs; exclude narrative/aggregate rows.
    return bool(re.fullmatch(r'[0-9A-Z]{4,8}', v)) and v[0].isdigit()


def verify(foreign, trust, dealer, own, hedge, total, *, code):
    if own + hedge != dealer: raise ValueError(f'{code}: dealer subtotal mismatch')
    if foreign + trust + dealer != total: raise ValueError(f'{code}: three-party subtotal mismatch')


def parse_twse(payload):
    if not isinstance(payload, dict): raise ValueError('TWSE expected object')
    records = payload.get('data')
    if records is None and isinstance(payload.get('tables'), list):
        # Some TWSE versions wrap each report in tables.
        for tab in payload['tables']:
            if isinstance(tab, dict) and isinstance(tab.get('data'), list) and len(tab.get('fields', [])) >= 18:
                records = tab['data']; break
    if not isinstance(records, list):
        stat = str(payload.get('stat') or '')
        if '沒有' in stat or '查無' in stat or '無資料' in stat:
            return None
        raise ValueError(f'TWSE missing report data: {stat[:120]}')
    if not records: return None
    entries = {}
    rejected = 0
    for row in records:
        try:
            if not isinstance(row, (list, tuple)) or len(row) < 19: raise ValueError('TWSE row requires 19 columns')
            code = symbol_code(row[0])
            if not valid_stock_id(code):
                rejected += 1; continue
            name = str(row[1]).strip()
            foreign = number(row[4]); trust = number(row[10]); dealer = number(row[11]); own = number(row[14]); hedge = number(row[17]); total = number(row[18])
            verify(foreign, trust, dealer, own, hedge, total, code=code)
            entries[code] = [code, name, foreign, trust, dealer, own, hedge, total]
        except (IndexError, TypeError, ValueError):
            rejected += 1
    if not entries or rejected > max(3, len(records) * .03):
        raise ValueError(f'TWSE schema mismatch: good={len(entries)}, rejected={rejected}')
    return list(entries.values())


def parse_tpex(payload):
    if not isinstance(payload, dict): raise ValueError('TPEx expected object')
    tables = payload.get('tables', [])
    if not isinstance(tables, list): raise ValueError('TPEx tables must be array')
    records = None
    for tab in tables:
        if not isinstance(tab, dict): continue
        for key in ('data', 'aaData'):
            value = tab.get(key)
            if isinstance(value, list) and value and isinstance(value[0], (list, tuple)) and len(value[0]) >= 24:
                records = value; break
        if records is not None: break
    if records is None:
        # Different TPEx deployments may expose a plain data array.
        value = payload.get('data')
        if isinstance(value, list) and value and isinstance(value[0], (list, tuple)) and len(value[0]) >= 24:
            records = value
    if not records:
        msg = str(payload.get('stat') or payload.get('message') or '').strip()
        if any(s in msg for s in ('沒有', '查無', '無資料', '休市')) or payload.get('tables') == []:
            return None
        raise ValueError(f'TPEx missing 24-column daily table: {msg[:120]}')
    entries = {}
    rejected = 0
    for row in records:
        try:
            code = symbol_code(row[0]); name = str(row[1]).strip()
            if not valid_stock_id(code): rejected += 1; continue
            foreign = number(row[4]); trust = number(row[13]); own = number(row[16]); hedge = number(row[19]); dealer = number(row[22]); total = number(row[23])
            verify(foreign, trust, dealer, own, hedge, total, code=code)
            entries[code] = [code, name, foreign, trust, dealer, own, hedge, total]
        except (IndexError, TypeError, ValueError): rejected += 1
    if not entries or rejected > max(3, len(records) * .03):
        raise ValueError(f'TPEx schema mismatch: good={len(entries)}, rejected={rejected}')
    return list(entries.values())


def date_urls(day: dt.date):
    twse_url = 'https://www.twse.com.tw/rwd/zh/fund/T86?' + urlencode({
        'date': day.strftime('%Y%m%d'), 'selectType': 'ALLBUT0999', 'response': 'json'
    })
    roc = f'{day.year - 1911}/{day.month:02d}/{day.day:02d}'
    tpex_url = 'https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?' + urlencode({
        'type': 'Daily', 'sect': 'EW', 'date': roc, 'id': '', 'response': 'json'
    })
    return {'TWSE': twse_url, 'TPEX': tpex_url}


def http_json(url, attempts=4):
    for i in range(attempts):
        try:
            req = Request(url, headers={
                'User-Agent': USER_AGENT,
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://www.tpex.org.tw/' if 'tpex' in url else 'https://www.twse.com.tw/',
            })
            with urlopen(req, timeout=25) as response:
                payload = response.read(12_000_000)
                if response.read(1): raise ValueError('Unexpected large response')
            return json.loads(payload.decode('utf-8-sig'))
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            if i == attempts - 1: raise RuntimeError(f'Failed {attempts} attempts: {type(exc).__name__}: {exc}') from exc
            time.sleep(min(20, 1.5 * 2 ** i + random.random()))


def read_json(path):
    try: return json.loads(path.read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError): return None


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    compact = json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n'
    if path.exists() and path.read_text(encoding='utf-8') == compact: return False
    path.write_text(compact, encoding='utf-8')
    return True


def trading_dates(days, market):
    return sorted(day for day, report in days.items() if report.get('markets', {}).get(market))


def generate(daily, generated_at=None, errors=None):
    """Produce ranked latest summary + 60-session daily per-stock series."""
    generated_at = generated_at or dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    summary = {'schema': 1, 'generatedAt': generated_at, 'marketData': {}, 'windowDays': list(FIVE), 'units': 'shares',
               'notes': '資料為法人買賣超股數；非持股增減與非即時報價。'}
    histories = {}
    for market in MARKETS:
        sessions = trading_dates(daily, market)
        if not sessions:
            summary['marketData'][market] = {'date': None, 'sessions': 0, 'start': None, 'entries': []}
            histories[market] = {'schema': 1, 'market': market, 'dates': [], 'series': {}}
            continue
        latest = sessions[-1]
        relevant = sessions[-65:]
        # Latest day symbols only for ranking, but multi-day stock detail contains the
        # full union, including symbols that traded before the most recent date.
        series = {}
        index_by_date = {day: i for i, day in enumerate(relevant)}
        for day in relevant:
            for row in daily[day]['markets'][market]:
                code = row[0]
                series.setdefault(code, []).append([index_by_date[day], *row[2:5]])
        histories[market] = {'schema': 1, 'market': market, 'dates': relevant, 'series': series}
        all_maps = [dict((row[0], row) for row in daily[day]['markets'][market]) for day in sessions]
        latest_rows = []
        for row in daily[latest]['markets'][market]:
            code = row[0]
            windows = []
            for count in FIVE:
                if len(sessions) < count:
                    windows.append(None)
                    continue
                vals = [0, 0, 0]
                seen = 0
                for smap in all_maps[-count:]:
                    match = smap.get(code)
                    if match:
                        seen += 1
                        for j in range(3): vals[j] += match[j + 2]
                # 60 sessions exist; for a new stock 'seen' may be lower.
                windows.append([*vals, sum(vals), seen])
            latest_rows.append([*row, *windows])
        summary['marketData'][market] = {'date': latest, 'sessions': len(sessions), 'start': sessions[0], 'entries': latest_rows}
    if errors: summary['lastRunErrors'] = errors[-25:]
    return summary, histories


def load_daily():
    days = {}
    for path in sorted(DAY_DIR.glob('????-??-??.json')):
        payload = read_json(path)
        if not isinstance(payload, dict): continue
        date = payload.get('date')
        markets = payload.get('markets')
        if date == path.stem and isinstance(markets, dict) and any(markets.get(m) for m in MARKETS):
            days[date] = payload
    return days


def main(argv=None):
    parser = argparse.ArgumentParser(description='Update official institutional trading snapshots')
    parser.add_argument('--mode', choices=('auto', 'bootstrap', 'daily'), default='auto')
    parser.add_argument('--today', help='Target date YYYY-MM-DD, defaults to Taiwan calendar date')
    parser.add_argument('--bootstrap-days', type=int, default=112)
    parser.add_argument('--retry-days', type=int, default=8)
    parser.add_argument('--delay', type=float, default=.55)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    today = dt.date.fromisoformat(args.today) if args.today else (dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))).date()
    if args.bootstrap_days < 90 or args.bootstrap_days > 180: parser.error('--bootstrap-days must be 90..180')
    if args.retry_days < 1 or args.retry_days > 30: parser.error('--retry-days must be 1..30')
    daily = load_daily()
    old_status = read_json(DATA / 'status.json') or {}
    # Keep previously failed market/dates visible until successfully rechecked.
    unresolved = {}
    for problem in old_status.get('errors', []):
        if isinstance(problem, str):
            match = re.match(r'^(\d{4}-\d{2}-\d{2}) (TWSE|TPEX): ', problem)
            if match: unresolved[(match.group(1), match.group(2))] = problem
    mode = ('bootstrap' if not daily else 'daily') if args.mode == 'auto' else args.mode
    days_back = args.bootstrap_days if mode == 'bootstrap' else args.retry_days
    # Avoid querying a future date; skip weekend requests but don't treat errors as holidays.
    days_to_check = [today - dt.timedelta(days=i) for i in range(days_back - 1, -1, -1)]
    days_to_check = [d for d in days_to_check if d.weekday() < 5]
    failures = []
    success = 0
    for target in days_to_check:
        date = target.isoformat()
        doc = daily.get(date, {'date': date, 'markets': {}})
        for market, url in date_urls(target).items():
            if doc['markets'].get(market): continue
            try:
                rows = parse_twse(http_json(url)) if market == 'TWSE' else parse_tpex(http_json(url))
                if rows:
                    doc['markets'][market] = rows
                    success += 1
                    unresolved.pop((date, market), None)
                    LOG.info('%s %s: %s records', date, market, len(rows))
                else:
                    unresolved.pop((date, market), None)
                    LOG.info('%s %s: no trading records', date, market)
            except Exception as exc:
                reason = f'{date} {market}: {exc}'
                failures.append(reason)
                unresolved[(date, market)] = reason
                LOG.warning('Query failed %s', reason)
            time.sleep(max(args.delay, 0))
        if doc['markets']:
            daily[date] = doc
            write_json(DAY_DIR / (date + '.json'), doc)
    # Keep ~95 market session calendar dates, including separately unavailable data.
    day_keys = sorted(daily)
    for old in day_keys[:-95]:
        path = DAY_DIR / (old + '.json')
        if path.exists(): path.unlink()
        daily.pop(old, None)
    gen_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    pending_errors = [unresolved[k] for k in sorted(unresolved)]
    latest, histories = generate(daily, gen_at, pending_errors)
    write_json(DATA / 'latest.json', latest)
    for market in MARKETS:
        write_json(DATA / f'history-{market.lower()}.json', histories[market])
    status = {'schema': 1, 'attemptedAt': gen_at, 'mode': mode, 'newMarketDates': success,
              'latest': {m: latest['marketData'][m]['date'] for m in MARKETS},
              'sessions': {m: latest['marketData'][m]['sessions'] for m in MARKETS},
              'errors': pending_errors[-100:]}
    write_json(DATA / 'status.json', status)
    LOG.info('Done: %s new market-days; market latest %s; %s errors', success, status['latest'], len(failures))
    # Fail only if absolutely no market data can be shown. Existing data must remain publishable.
    if not any(latest['marketData'][m]['entries'] for m in MARKETS):
        LOG.error('No valid market data. Retain empty templates and retry with workflow_dispatch.')
        # Deploy the UI anyway, showing a transparent empty-data warning.
        # Do not claim an automatic data update was successful.
        return 0
    return 0

if __name__ == '__main__':
    sys.exit(main())
