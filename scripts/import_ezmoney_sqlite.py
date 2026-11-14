#!/usr/bin/env python3
"""Bridge a freshly fetched TWActiveETFCrawler SQLite *issuer* observation into Trade Compass.

This script NEVER fetches third-party holdings-site data. The optional upstream scraper
claims to read EZMoney issuer disclosures, but must be reconciled with official reports
before it is treated as trading evidence. A missing/incomplete day is NEVER a liquidation.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import math
from pathlib import Path
import re
import sqlite3
import sys

from update_active_etf import archive_entry, read, write, BASE, LATEST, STATUS, HISTORY, CATALOG

SYMBOL_RE=re.compile(r'\d{4,6}[A-Z]?')
DATE_RE=re.compile(r'\d{4}-\d{2}-\d{2}')
SOURCE_URL='https://www.ezmoney.com.tw/ETF/Transaction/PCF'
UPSTREAM='https://github.com/SheenArtem/TWActiveETFCrawler'
PORTFOLIO_CODES={'00981A','00403A'}
FUND_NAMES={'00981A':'主動統一台股增長','00403A':'主動統一升級50'}

class BridgeError(ValueError):pass

def connection(db_path:Path):
    uri=f'file:{db_path.resolve()}?mode=ro'
    return sqlite3.connect(uri, uri=True)

def holdings_tables(db):
    matches=[]
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table'"):
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',name):continue
        cols={r[1].lower():r[1] for r in db.execute(f'PRAGMA table_info("{name}")')}
        required=('etf_code','stock_code','stock_name','shares','weight','date')
        if all(c in cols for c in required):matches.append((name,cols))
    if len(matches)!=1:raise BridgeError('Expected one holdings table with issuer holdings columns, found '+str(len(matches)))
    return matches[0]

def select_rows(db,code):
    table, cols=holdings_tables(db)
    names=('etf_code','stock_code','stock_name','shares','weight','date')
    quoted=','.join('"'+cols[n]+'"' for n in names)
    sql=f'SELECT {quoted} FROM "{table}" WHERE "{cols["etf_code"]}"=?'
    return [dict(zip(names,row)) for row in db.execute(sql,(code,))]

def snap_from_rows(code,date,rows,now=None):
    now=now or dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    if not DATE_RE.fullmatch(date):raise BridgeError('Invalid date')
    day=dt.date.fromisoformat(date)
    if day>now:raise BridgeError('Future date')
    if (now-day).days>30:raise BridgeError('Stale observation (>30 days), refusing to publish as new')
    holdings=[];codes=set();total_weight=0
    for row in rows:
        symbol=str(row['stock_code']).strip().upper()
        if not SYMBOL_RE.fullmatch(symbol):raise BridgeError('Unexpected non-TW security id '+symbol)
        if symbol in codes:raise BridgeError('Duplicate stock id '+symbol)
        codes.add(symbol)
        name=str(row['stock_name'] or symbol).strip()
        if not name:raise BridgeError('Missing name')
        try:
            shares=float(row['shares']); weight=float(row['weight'])
        except (TypeError,ValueError):raise BridgeError('Missing numeric shares/weight')
        if not (math.isfinite(shares) and shares>=0 and shares.is_integer() and math.isfinite(weight) and 0<=weight<=100):
            raise BridgeError('Invalid shares or weight')
        total_weight+=weight
        holdings.append({'code':symbol,'name':name,'shares':int(shares),'weight':round(weight,5)})
    if len(holdings)<15 or len(holdings)>200:raise BridgeError('Not a plausible full equity portfolio: '+str(len(holdings)))
    if not 40<=total_weight<=103:raise BridgeError(f'Equity weight sum {total_weight:.2f}% implausible for full portfolio')
    return {
        'date':date,'complete':True,'kind':'actual_portfolio','etf':code,
        'source':SOURCE_URL,
        'collector':UPSTREAM,
        'provenance':'Open-source collector reports issuer EZMoney disclosure; independently reconcile PCF vs full portfolio',
        'holdings':holdings,
        'equityWeightTotal':round(total_weight,4),
    }

def ingest(db_path:Path, codes=('00981A',)):
    catalog={x['code']:x for x in read(CATALOG,{}).get('funds',[])}
    previous=read(LATEST,{'schema':1,'snapshots':{}})
    status=read(STATUS,{'schema':1,'etfs':{}})
    if not isinstance(previous.get('snapshots'),dict):previous={'schema':1,'snapshots':{}}
    if not isinstance(status.get('etfs'),dict):status={'schema':1,'etfs':{}}
    result={}; updated=0
    with connection(db_path) as db:
        for code in codes:
            if code not in PORTFOLIO_CODES:raise BridgeError('Unsupported code '+code)
            # ETF issuer allowlist is authoritative. The website catalog is optional
            # display metadata and must not prevent a permitted import.
            fund_name=(catalog.get(code) or {}).get('name') or FUND_NAMES[code]
            rows=select_rows(db,code)
            by_day={}
            for r in rows:
                day=str(r['date'])[:10]
                if DATE_RE.fullmatch(day):by_day.setdefault(day,[]).append(r)
            if not by_day:
                result[code]={'status':'no_data','detail':'爬蟲沒有取得統一投信實際持股；尚未建立任何日期快照'}
                continue
            eligible=sorted(by_day,reverse=True)
            saved=[];rejected=[]
            # Import at most the five latest valid observations, to avoid importing a large unverifiable history.
            for day in eligible[:5]:
                try:
                    snapshot=snap_from_rows(code,day,by_day[day]);
                    archive_entry(code,snapshot);saved.append(snapshot)
                except BridgeError as exc:rejected.append(day+': '+str(exc))
            if not saved:
                result[code]={'status':'invalid_data','detail':'; '.join(rejected)[:240]}
                continue
            current=sorted(saved,key=lambda x:x['date'],reverse=True)[0]
            hist=read(HISTORY/(code+'.json'),{'snapshots':[]}).get('snapshots',[])
            previous['snapshots'][code]=hist[:2]
            dates=read(BASE/'indexes'/(code+'.json'),{'dates':[]}).get('dates',[])
            status['etfs'][code]={
                'name':fund_name,'status':'ok',
                'detail':'開源抓取器轉取統一官網持股；請與原始官方完整投資組合覆核，非即時資料',
                'date':current['date'],'historicalDates':len(dates),
                'holdings':len(current['holdings']),'source':SOURCE_URL,
                'provenance':'upstream_issuer_scraper; validation_not_independent',
            }
            result[code]={'status':'saved','newDates':[x['date'] for x in saved], 'savedTotal':len(dates),'holdings':len(current['holdings'])}
            updated+=1
    now=dt.datetime.now(dt.timezone.utc).isoformat()
    if updated:
        previous['updatedAt']=now
        write(LATEST,previous)
        status['checkedAt']=now
        status['updatedSources']=max(status.get('updatedSources',0),updated)
        write(STATUS,status)
    return result

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--sqlite',required=True,type=Path)
    p.add_argument('--code',action='append',choices=sorted(PORTFOLIO_CODES),default=[])
    args=p.parse_args()
    if not args.sqlite.is_file():raise SystemExit('Missing crawler SQLite file '+str(args.sqlite))
    try:res=ingest(args.sqlite,tuple(args.code or ['00981A']))
    except (sqlite3.Error,BridgeError) as e:print('IMPORT ERROR:',e,file=sys.stderr);return 2
    print(json.dumps(res,ensure_ascii=False,indent=2))
    return 0 if any(x['status']=='saved' for x in res.values()) else 3

if __name__=='__main__':sys.exit(main())
