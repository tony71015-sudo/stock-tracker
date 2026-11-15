#!/usr/bin/env python3
"""Try official TWSE historical 0050 distributions; never invent missing events.

If the official endpoint does not return verifiable events, retain an existing
valid archive and print a diagnostic. The Pages publishing step is independent.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import pathlib
import re
import tempfile
import time
import urllib.parse
import urllib.request

CODE='0050'
URL='https://www.twse.com.tw/rwd/zh/ETF/etfDiv'
TARGET=pathlib.Path('data/index-etf/dividends/0050.json')

def dval(v):
    s=re.sub(r'<[^>]*>','',str(v or '')).strip()
    m=re.search(r'(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})',s)
    if not m:return None
    y,mo,da=map(int,m.groups());y+=1911 if y<1911 else 0
    try:return dt.date(y,mo,da).isoformat()
    except ValueError:return None

def amount(v):
    s=re.sub(r'<[^>]*>','',str(v or '')).replace(',','').strip()
    if not re.fullmatch(r'\d+(?:\.\d+)?',s):return None
    x=float(s)
    return x if 0<x<10000 else None

def validate_archive(obj):
    if not isinstance(obj,dict) or obj.get('etf')!=CODE or not isinstance(obj.get('events'),list):
        raise ValueError('Wrong ETF/archive structure')
    valid={}
    for e in obj['events']:
        if not isinstance(e,dict):continue
        ex=dval(e.get('exDate'));pay=dval(e.get('paymentDate'));cash=amount(e.get('amount'))
        if ex and pay and ex<=pay and cash and ex>='2003-06-30':valid[ex]={'exDate':ex,'paymentDate':pay,'amount':cash}
    if not valid:raise ValueError('No verified distribution events')
    return valid

def parse_twse(payload):
    if not isinstance(payload,dict) or not isinstance(payload.get('fields'),list) or not isinstance(payload.get('data'),list):
        raise ValueError('TWSE did not return fields/data arrays')
    cols=[re.sub(r'<[^>]*>','',str(v)).replace(' ','') for v in payload['fields']]
    def ci(*names):return next((i for i,c in enumerate(cols) if any(n in c for n in names)),None)
    sym=ci('證券代號','ETF代號','股票代號','基金代號')
    exidx=ci('除息交易日','除息日')
    payidx=ci('收益分配發放日','收益分配發放日期','配息發放日','發放日期')
    amtidx=ci('收益分配金額','每單位收益分配金額','每受益權單位分配金額')
    if None in (sym,exidx,payidx,amtidx):raise ValueError('Unrecognized TWSE fields: '+repr(cols))
    out={}
    for row in payload['data']:
        if not isinstance(row,list) or len(row)<=max(sym,exidx,payidx,amtidx):continue
        if str(row[sym]).strip()!=CODE:continue
        ex=dval(row[exidx]);pay=dval(row[payidx]);cash=amount(row[amtidx])
        if ex and pay and ex<=pay and cash and '2003-06-30'<=ex<=dt.date.today().isoformat():
            out[ex]={'exDate':ex,'paymentDate':pay,'amount':cash}
    if not out:raise ValueError('No valid 0050 distributions returned by TWSE')
    return out

def fetch_twse():
    query=urllib.parse.urlencode({'stkNo':CODE,'startDate':'20050101',
       'endDate':dt.date.today().strftime('%Y%m%d'),'response':'json'})
    request=urllib.request.Request(URL+'?'+query,headers={'User-Agent':'Mozilla/5.0 TradeCompassResearch','Accept':'application/json'})
    failure=None
    for n in range(3):
        try:
            with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
        except (OSError,ValueError) as e:
            failure=e
            if n<2:time.sleep(2*(n+1))
    raise RuntimeError(f'Official TWSE request failed: {failure}')

def atomic_json(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=path.parent,prefix='.tmp0050-',delete=False) as f:
        json.dump(obj,f,ensure_ascii=False,indent=2);f.write('\n');tmp=pathlib.Path(f.name)
    tmp.replace(path)

def run(require=False):
    old={}; prior={}
    if TARGET.exists():
        try:
            old=json.loads(TARGET.read_text(encoding='utf-8'))
            prior=validate_archive(old)
            print(f'Existing 0050 archive: {len(prior)} validated events')
        except (OSError,ValueError) as e:
            print('::warning::Existing dividend archive is not valid:',e)
            old={};prior={}
    updated={}
    try:
        updated=parse_twse(fetch_twse())
        print(f'TWSE response: {len(updated)} individually parseable 0050 distribution events')
    except (ValueError,RuntimeError) as e:
        print('::warning::Failed to refresh official dividend events:',e)
    # Persist only data from a successfully returned official record or a previously archived record.
    merged={**prior,**updated}
    if not merged:
        msg='0050 verified dividend archive unavailable; original browser warning must remain visible'
        print('::warning::'+msg)
        return 1 if require else 0
    result={**old,'schema':1,'etf':CODE,'source':'TWSE ETF etfDiv (with earlier validated archive if present)',
       'sourceUrl':URL,'coverageStart':'2005-01-01','completeBefore2005':False,
       'asOf':dt.date.today().isoformat(),'events':[merged[d] for d in sorted(merged)],
       'firstEventDate':min(merged),'lastEventDate':max(merged),
       'verificationStatus':'history-incomplete-before-2005-and-not-individually-audited',
       'note':'2003-2004 and any unavailable periods are not assumed to pay zero; verify with Yuanta/TWSE before investment decisions.'}
    atomic_json(TARGET,result)
    print('Validated 0050 dividend archive:',TARGET,'events=',len(merged),
          'first=',min(merged),'last=',max(merged))
    return 0

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--require',action='store_true');a=p.parse_args()
    raise SystemExit(run(a.require))
