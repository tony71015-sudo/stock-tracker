#!/usr/bin/env python3
"""Optional source-configured PCF snapshot sync for officially verified CSV endpoints.
Default sources.json has zero URLs; NEVER claim automatic holdings without valid PCF URLs.
Only complete source portfolios may be compared. Source must give full fund holdings in shares.
"""
from __future__ import annotations
import csv
import datetime as dt
import io
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'data'/'active-etf'
CONFIG=BASE/'sources.json'
LATEST=BASE/'latest.json'

def parse_csv(text,entry):
    reader=csv.DictReader(io.StringIO(text.lstrip('\ufeff')))
    if not reader.fieldnames:raise ValueError('Missing CSV header')
    fields={s.strip().lower():s for s in reader.fieldnames}
    def find(*keys):
        for k in keys:
            if k.strip().lower() in fields:return fields[k.strip().lower()]
        return None
    code_col=find('股票代號','證券代號','code','symbol','stock_code')
    name_col=find('股票名稱','證券名稱','name','stock_name')
    shares_col=find('持有股數','股數','shares','quantity')
    weight_col=find('權重','權重(%)','持股權重','weight','weight_pct')
    date_col=find('日期','資料日期','date')
    if not code_col or (not shares_col and not weight_col):raise ValueError('Required PCF columns missing')
    if not date_col:raise ValueError('Need per-row PCF disclosure date to avoid treating stale snapshot as new')
    rows=[];dates=set();codes=set()
    for row in reader:
        code=(row.get(code_col) or '').strip().upper()
        date=(row.get(date_col) or '').strip()
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',date):raise ValueError('Invalid ISO date in PCF: '+date)
        dt.date.fromisoformat(date)
        if not re.fullmatch(r'[0-9A-Z]{4,8}',code):raise ValueError('Invalid stock code')
        if code in codes:raise ValueError('Duplicated ticker '+code)
        dates.add(date);codes.add(code)
        def n(k):
            v=(row.get(k) or '').replace(',','').replace('%','').strip() if k else ''
            return float(v) if v else None
        shares=n(shares_col);weight=n(weight_col)
        if shares is not None and (shares<0 or not shares.is_integer()):raise ValueError('Invalid shares for '+code)
        if weight is not None and not (0<=weight<=100):raise ValueError('Invalid weight')
        if shares is None and weight is None:raise ValueError('No shares/weight for '+code)
        rows.append({'code':code,'name':(row.get(name_col) or code).strip() if name_col else code,'shares':int(shares) if shares is not None else None,'weight':weight})
    if len(dates)!=1:raise ValueError('Mixed PCF disclosure dates')
    if len(rows)<int(entry.get('minimum_holdings',5)):raise ValueError('Too few PCF constituents for complete snapshot')
    return {'date':next(iter(dates)),'source':entry['url'],'complete':True,'holdings':rows}

def main():
    settings=json.loads(CONFIG.read_text('utf8')) if CONFIG.exists() else {'sources':[]}
    published=json.loads(LATEST.read_text('utf8')) if LATEST.exists() else {'schema':1,'snapshots':{}}
    published.setdefault('snapshots',{})
    changed=0
    for source in settings.get('sources',[]):
        code=str(source.get('etf','')).upper().strip()
        url=source.get('url','')
        if not re.fullmatch(r'[0-9A-Z]{4,8}',code):print('Skip invalid ETF');continue
        parsed=urllib.parse.urlsplit(url)
        if parsed.scheme!='https' or not parsed.hostname or not parsed.hostname.endswith(('.com.tw','.org.tw','.tw')):
            print('Skip non-official or insecure source:',code);continue
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (TradeCompass public PCF)'})
            with urllib.request.urlopen(req,timeout=25) as resp:
                blob=resp.read(2_000_000)
            text=blob.decode(source.get('encoding','utf-8-sig'))
            snapshot=parse_csv(text,source)
            if snapshot['date']>dt.date.today().isoformat():raise ValueError('Future disclosure date')
            old=published['snapshots'].get(code,[])
            published['snapshots'][code]=sorted([snap for snap in old if snap['date']!=snapshot['date']]+[snapshot],key=lambda x:x['date'],reverse=True)[:30]
            changed+=1
            print('Updated',code,snapshot['date'],len(snapshot['holdings']),'holdings')
        except Exception as exc:print('WARNING: PCF source unavailable',code,str(exc)[:120])
    published.update(schema=1,updatedAt=dt.datetime.now(dt.timezone.utc).isoformat() if changed else published.get('updatedAt'))
    LATEST.write_text(json.dumps(published,ensure_ascii=False,separators=(',',':'))+'\n','utf8')
    print(f'PCF sync: {changed} sources updated; {len(settings.get("sources",[]))} configured')

if __name__=='__main__':main()
