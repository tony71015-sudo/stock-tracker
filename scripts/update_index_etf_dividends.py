#!/usr/bin/env python3
"""Collect official TWSE ETF income distributions without synthesizing missing dividends.

Official history begins in 2005; earlier periods may be incomplete. We require
ex-dividend date, distribution payment date and positive per-unit cash amount.
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
OUT = pathlib.Path('data/index-etf/dividends')
URL = 'https://www.twse.com.tw/rwd/zh/ETF/etfDiv'


def parse_date(v):
    s = re.sub(r'<[^>]+>', '', str(v or '')).strip()
    m = re.search(r'(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})', s)
    if not m:
        return None
    year, month, day = map(int, m.groups())
    if year < 1911:
        year += 1911
    try:
        return dt.date(year, month, day).isoformat()
    except ValueError:
        return None


def parse_amount(v):
    s = re.sub(r'<[^>]+>', '', str(v or '')).replace(',', '').strip()
    if not re.fullmatch(r'\d+(?:\.\d+)?', s):
        return None
    amt = float(s)
    return amt if amt > 0 else None


def parse_history(payload, code, today=None):
    if not isinstance(payload, dict) or not isinstance(payload.get('fields'), list) or not isinstance(payload.get('data'), list):
        raise ValueError('TWSE etfDiv response lacks fields/data; no events saved')
    fields = [re.sub(r'<[^>]+>', '', str(x)).replace(' ', '') for x in payload['fields']]
    def col(*needles):
        return next((i for i, f in enumerate(fields) if any(n in f for n in needles)), None)
    symbol_idx = col('證券代號')
    ex_idx = col('除息交易日')
    pay_idx = col('收益分配發放日')
    amt_idx = col('收益分配金額')
    if None in (symbol_idx, ex_idx, pay_idx, amt_idx):
        raise ValueError('TWSE etfDiv response has unknown column names: ' + repr(fields))
    today = today or dt.date.today()
    ev = {}
    invalid = 0
    for row in payload['data']:
        try:
            symbol = str(row[symbol_idx]).strip()
            if symbol != code:
                continue
            ex = parse_date(row[ex_idx]); pay = parse_date(row[pay_idx]); amount = parse_amount(row[amt_idx])
            if not ex or not pay or amount is None or pay < ex or ex > today.isoformat():
                invalid += 1
                continue
            ev[ex] = {'exDate':ex,'paymentDate':pay,'amount':amount}
        except (IndexError, TypeError):
            invalid += 1
    return sorted(ev.values(), key=lambda x:x['exDate']), invalid


def fetch(code, retries=3):
    query = urllib.parse.urlencode({
        'stkNo':code,'startDate':'20050101',
        'endDate':dt.date.today().strftime('%Y%m%d'), 'response':'json'})
    req = urllib.request.Request(URL+'?'+query, headers={
        'User-Agent':'Mozilla/5.0 (compatible; TradeCompassResearch/1.0)',
        'Accept':'application/json'})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req,timeout=35) as resp:
                return json.load(resp)
        except (OSError, ValueError) as err:
            if attempt+1==retries: raise RuntimeError(f'{code} official dividend download failed: {err}') from err
            time.sleep(3*(attempt+1))


def update(code, payload=None):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f'{code}.json'
    old = {}
    if path.exists():
        try: old=json.loads(path.read_text(encoding='utf-8'))
        except (OSError,ValueError): pass
    if payload is None: payload=fetch(code)
    events,invalid=parse_history(payload,code)
    if not events:
        # A legitimate non-distributing ETF can have no events; do not claim completeness.
        if old.get('events'):
            print('WARNING:',code,'official response has no valid dividends; existing archive retained')
            return old
        raise RuntimeError(f'{code}: official history returned no valid distributions; refusing empty archive')
    combined={x['exDate']:x for x in old.get('events',[]) if isinstance(x,dict) and x.get('exDate')}
    combined.update({x['exDate']:x for x in events})
    out={'schema':1,'etf':code,'source':'TWSE ETF etfDiv',
         'sourceUrl':URL,'coverageStart':'2005-01-01','completeBefore2005':False,
         'asOf':dt.date.today().isoformat(),'invalidRows':invalid,
         'events':sorted(combined.values(),key=lambda x:x['exDate'])}
    path.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(f'{code}: distributions={len(out["events"])} invalid_rows={invalid} as_of={out["asOf"]}')
    return out


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--code',choices=CODES)
    a=p.parse_args()
    failures=[]
    for code in [a.code] if a.code else CODES:
        try: update(code)
        except RuntimeError as ex:
            failures.append(code); print('WARNING:',ex,flush=True)
    if failures: print('WARNING: dividend dataset incomplete:',','.join(failures),flush=True)
    # Preserve successful price updates even if the official dividend endpoint is temporarily unavailable.

if __name__=='__main__': main()
