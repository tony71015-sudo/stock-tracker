#!/usr/bin/env python3
"""Conservative incremental archive of 006208 cash dividends.

Reads the existing historical JSON (seeded with verified issuer disclosures), then
tries the existing official TWSE collector and Fubon issuer annual pages. Only
fully validated ex-date/payment-date/amount records are added. Network/parsing
failure never removes archived events. This does NOT itself deploy GitHub Pages.
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path('data/index-etf/dividends/006208.json')
ISSUER_URL = 'https://www.fubon.com/asset-management/fund/dividends/by_yield'
TWSE_URL = 'https://www.twse.com.tw/rwd/zh/ETF/etfDiv'
START = dt.date(2012, 7, 17)


def iso_date(value):
    text = str(value or '').strip().replace('.', '/')
    m = re.search(r'(?<!\d)(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})(?!\d)', text)
    if not m: return None
    y, mo, day = map(int, m.groups())
    if y < 1911: y += 1911
    try: return dt.date(y, mo, day).isoformat()
    except ValueError: return None


def clean_amount(value):
    raw = re.sub(r'<[^>]*>', '', str(value or '')).replace(',', '').strip()
    if not re.fullmatch(r'\d+(?:\.\d+)?', raw): return None
    amount = float(raw)
    return amount if 0 < amount < 1000 else None


def valid(event, today=None):
    today = today or dt.date.today()
    if not isinstance(event, dict): return None
    ex, pay, amount = iso_date(event.get('exDate')), iso_date(event.get('paymentDate')), clean_amount(event.get('amount'))
    if not ex or not pay or amount is None: return None
    if not (START.isoformat() <= ex <= today.isoformat()) or pay < ex: return None
    if (dt.date.fromisoformat(pay) - dt.date.fromisoformat(ex)).days > 180: return None
    return {'exDate':ex, 'paymentDate':pay, 'amount':amount, 'source':event.get('source','issuer/TWSE disclosed')}


def read_archive():
    if not ROOT.exists(): raise FileNotFoundError('006208 seed file missing: data/index-etf/dividends/006208.json')
    obj = json.loads(ROOT.read_text(encoding='utf-8'))
    if obj.get('etf') != '006208' or not isinstance(obj.get('events'), list):
        raise ValueError('The existing JSON is not a valid 006208 dividend archive')
    return obj


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 TradeCompass/1.0','Accept':'application/json'})
    with urllib.request.urlopen(req, timeout=28) as response: return json.load(response)


def twse_events():
    p = {'stkNo':'006208','startDate':'20120717','endDate':dt.date.today().strftime('%Y%m%d'),'response':'json'}
    data = fetch_json(TWSE_URL+'?'+urllib.parse.urlencode(p))
    if not isinstance(data, dict) or not isinstance(data.get('fields'),list) or not isinstance(data.get('data'),list):
        raise ValueError('TWSE response does not contain official fields/data')
    cols = [re.sub(r'<[^>]*>|\s+','',str(x)) for x in data['fields']]
    def ix(*names): return next((i for i,c in enumerate(cols) if any(s in c for s in names)),None)
    ci,ei,pi,ai=ix('證券代號'),ix('除息交易日','收益分配除息日'),ix('收益分配發放日','發放日'),ix('收益分配金額','每單位分配金額')
    if None in (ci,ei,pi,ai): raise ValueError('TWSE columns were changed: '+repr(cols))
    results=[]
    for row in data['data']:
        try:
            if str(row[ci]).strip() != '006208': continue
            v=valid({'exDate':row[ei], 'paymentDate':row[pi], 'amount':row[ai], 'source':'TWSE etfDiv'})
            if v: results.append(v)
        except (IndexError, TypeError): continue
    if not results: raise ValueError('TWSE responded, but no verified 006208 dividends in response')
    return results


def issuer_events(year):
    """Parse conservatively from issuer annual page; ambiguous layouts are skipped.

    For pages which use a vertical fund card, capture repeated records. For a
    horizontal table, capture a row only if all fields are in one row. No guessed
    dates or amounts are accepted.
    """
    from bs4 import BeautifulSoup
    q=urllib.parse.urlencode({'Fd':'0','contact':'1','toDate':str(year)})
    req=urllib.request.Request(ISSUER_URL+'?'+q,headers={'User-Agent':'Mozilla/5.0 TradeCompass/1.0'})
    with urllib.request.urlopen(req, timeout=32) as resp: soup=BeautifulSoup(resp.read(),'html.parser')
    found=[]
    # Look for individual card/row records which contain the target fund code and
    # all three necessary fields. Overly large parent containers are ignored.
    for tag in soup.find_all(['tr','li','article','section','div']):
        content=tag.get_text(' ',strip=True)
        if '006208' not in content or len(content)>1800: continue
        amount=re.search(r'(?:每單位\s*分配金額|配息金額)[^\d]{0,25}(\d+(?:\.\d+)?)',content)
        ex=re.search(r'(?:收益分配\s*)?除息日[^\d]{0,25}(\d{3,4}[/-]\d{1,2}[/-]\d{1,2})',content)
        pay=re.search(r'(?:收益分配\s*)?發放日[^\d]{0,25}(\d{3,4}[/-]\d{1,2}[/-]\d{1,2})',content)
        if not (amount and ex and pay): continue
        v=valid({'exDate':ex.group(1),'paymentDate':pay.group(1),'amount':amount.group(1),'source':'Fubon issuer annual disclosure'})
        if v and v['exDate'].startswith(str(year)): found.append(v)
    # No matching records is NOT evidence that this year paid zero dividends.
    return list({e['exDate']:e for e in found}.values())


def merge_archive(existing, fetched, status):
    old={}
    for e in existing.get('events',[]):
        v=valid(e)
        if v: old[v['exDate']]=v
    for e in fetched:
        v=valid(e)
        if v: old[v['exDate']]=v
    if not old: raise ValueError('No verified dividends to preserve')
    out=dict(existing)
    out.update({'schema':1, 'etf':'006208','listingDate':'2012-07-17', 'coverageStart':'2012-07-17',
                'asOf':dt.date.today().isoformat(),'firstEventDate':min(old),'lastEventDate':max(old),
                'completeHistory':False,'verificationStatus':'verified-events-partial-history',
                'source':'Fubon issuer official disclosures / TWSE verified events',
                'sourceUrl':ISSUER_URL,'events':[old[k] for k in sorted(old)],
                'lastSync':status,
                'warning':'Only individually verified distribution events are included; uncollected years are not zero distributions.'})
    return out


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--years',type=int,default=4,help='Most recent years to query from the issuer (default 4)')
    p.add_argument('--full',action='store_true',help='Try all years since listing')
    a=p.parse_args()
    original=read_archive()
    fetched=[]; status=[]
    try:
        values=twse_events();fetched+=values;status.append('TWSE verified='+str(len(values)))
    except Exception as e: status.append('TWSE unavailable: '+str(e)[:180])
    years=range(2012,dt.date.today().year+1) if a.full else range(max(2012,dt.date.today().year-a.years+1),dt.date.today().year+1)
    for year in years:
        try:
            vals=issuer_events(year);fetched+=vals;status.append(f'Fubon {year}: verified {len(vals)}')
        except Exception as e: status.append(f'Fubon {year}: unavailable {str(e)[:100]}')
        time.sleep(.35)
    merged=merge_archive(original, fetched, '; '.join(status))
    # Do not commit transient error metadata on each scheduled run: unchanged
    # verified records should not create pointless git commits.
    if [(x['exDate'],x['amount'],x['paymentDate']) for x in merged['events']] == [(x['exDate'],x['amount'],x['paymentDate']) for x in original['events']]:
        print('006208: no new verified events; preserved',len(merged['events']),'events')
        print('; '.join(status))
        return
    ROOT.parent.mkdir(parents=True,exist_ok=True)
    ROOT.write_text(json.dumps(merged,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('006208: saved',len(merged['events']),'verified dividends')
    print('; '.join(status))


if __name__=='__main__': main()
