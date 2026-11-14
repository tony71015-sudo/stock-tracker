#!/usr/bin/env python3
"""Import supported Taiwan-equity active ETF issuer-crawler holdings to Trade Compass.

Not an official API; upstream scraper claims issuer website provenance. Both dates
must be present and plausibility checks pass before comparing. PCF/creation basket
is NOT automatically equivalent to fund actual portfolio. A missing date is not a sale.
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
from import_ezmoney_sqlite import (select_rows, normalize_etf_code, BridgeError,
    connection, DATE_RE, snap_from_rows)
from update_active_etf import archive_entry, read, write, BASE, LATEST, STATUS, HISTORY, CATALOG

UPSTREAM = 'https://github.com/SheenArtem/TWActiveETFCrawler'
SUPPORTED = {'00980A': {'issuer': '野村', 'domain': 'nomurafunds.com.tw'}, '00985A': {'issuer': '野村', 'domain': 'nomurafunds.com.tw'}, '00999A': {'issuer': '野村', 'domain': 'nomurafunds.com.tw'}, '00982A': {'issuer': '群益', 'domain': 'capitalfund.com.tw'}, '00992A': {'issuer': '群益', 'domain': 'capitalfund.com.tw'}, '00991A': {'issuer': '復華', 'domain': 'fhtrust.com.tw'}, '00995A': {'issuer': '中信', 'domain': 'ctbcinvestments.com'}, '00406A': {'issuer': '中信', 'domain': 'ctbcinvestments.com'}, '00994A': {'issuer': '第一金', 'domain': 'fsitc.com.tw'}, '00408A': {'issuer': '第一金', 'domain': 'fsitc.com.tw'}, '00987A': {'issuer': '台新', 'domain': 'tsit.com.tw'}, '00984A': {'issuer': '安聯', 'domain': 'allianzgi.com.tw'}, '00993A': {'issuer': '安聯', 'domain': 'allianzgi.com.tw'}, '00400A': {'issuer': '國泰', 'domain': 'cathaysite.com.tw'}, '00401A': {'issuer': '摩根', 'domain': 'am.jpmorgan.com'}, '00405A': {'issuer': '富邦', 'domain': 'fubon.com'}, '00404A': {'issuer': '聯博', 'domain': 'alliancebernstein.com'}, '00996A': {'issuer': '兆豐', 'domain': 'megafunds.com.tw'}, '00407A': {'issuer': '凱基', 'domain': 'kgifund.com.tw'}, '00410A': {'issuer': '永豐', 'domain': 'sitc.sinopac.com'}}


def convert_day(code, date, rows, now=None):
    """Conservative equity portfolio validation with verified issuer scraped fields.

    The importer cannot independently prove scraping target is an actual portfolio;
    provenance is explicitly labeled as unverified until issuer-side spot checking.
    """
    snap=snap_from_rows(code,date,rows,now=now)
    snap['source']=UPSTREAM
    snap['collector']=UPSTREAM
    snap['issuer']=SUPPORTED[code]['issuer']
    snap['issuerReferenceDomain']=SUPPORTED[code]['domain']
    snap['provenance']='upstream_issuer_scraper; independent_official_reconciliation_pending'
    snap['dataVerification']='structural_validation_only'
    return snap


def ingest(db_path:Path, today=None, max_history_days=240):
    today=today or dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    if not 1<=max_history_days<=500:raise BridgeError('max_history_days outside 1..500')
    catalog={row['code']:row for row in read(CATALOG,{}).get('funds',[])}
    latest=read(LATEST,{'schema':1,'snapshots':{}})
    status=read(STATUS,{'schema':1,'etfs':{}})
    if not isinstance(latest.get('snapshots'),dict):raise BridgeError('Invalid latest.json')
    if not isinstance(status.get('etfs'),dict):raise BridgeError('Invalid status.json')
    report={};saved_count=0
    with connection(db_path) as db:
        for code,meta in SUPPORTED.items():
            if code not in catalog:
                report[code]={'status':'unlisted','reason':'Not in current Trade Compass catalog'}
                continue
            try:
                rows=select_rows(db,code)
            except BridgeError as exc:
                report[code]={'status':'error','reason':str(exc)[:180]}
                continue
            by_date={}
            for row in rows:
                date=str(row['date'])[:10]
                if DATE_RE.fullmatch(date):by_date.setdefault(date,[]).append(row)
            saved=[];rejected=[]
            for date in sorted(by_date,reverse=True)[:max_history_days]:
                try:
                    snapshot=convert_day(code,date,by_date[date],now=today)
                    archive_entry(code,snapshot)
                    saved.append(snapshot)
                except (BridgeError,ValueError) as exc:rejected.append(date+': '+str(exc))
            # Do not erase successful historical data on network failure or lack of new observations
            index=read(BASE/'indexes'/(code+'.json'),{'dates':[]}).get('dates',[])
            hist=read(HISTORY/(code+'.json'),{'snapshots':[]}).get('snapshots',[])
            if index and hist:
                existing_status=status['etfs'].get(code,{})
                newest=hist[0]
                age=(today-dt.date.fromisoformat(newest['date'])).days
                state='ok' if age<=7 else 'stale'
                latest['snapshots'][code]=hist[:2]
                status['etfs'][code]={
                    'name':catalog[code].get('name',code),'status':state,
                    'date':newest['date'],'historicalDates':len(index),
                    'holdings':len(newest.get('holdings',[])), 'source':UPSTREAM,
                    'issuer':meta['issuer'],
                    'detail':('已保存 '+str(len(index))+' 個日期；'+
                              ('可選兩個有效日期比較' if len(index)>=2 else '只有一個日期，暫時無法比較')+
                              '。來源為開源程式彙整的投信揭露，仍需與官網實際投資組合覆核'),
                    'verification':'structural_only; independent issuer reconciliation pending',
                    'comparisonReady':len(index)>=2,
                }
                report[code]={'status':'saved' if saved else 'retained',
                              'dates':len(index),'newDates':[x['date'] for x in saved],
                              'comparisonReady':len(index)>=2,'rejected':rejected[:2]}
                if saved:saved_count+=1
            else:
                # No issuer-complete archive: show explicit unsupported/error instead of a fake 0-share comparison.
                status['etfs'][code]={
                    'name':catalog[code].get('name',code),'status':'not_verified',
                    'historicalDates':0,'source':UPSTREAM,'issuer':meta['issuer'],
                    'detail':'暫時無法比較：'+('當次資料未通過完整持股檢查：'+rejected[0] if rejected else '尚未取得可用的完整持股快照'),
                    'comparisonReady':False
                }
                report[code]={'status':'unavailable','reason':status['etfs'][code]['detail']}
    # Keep other 22 catalog funds and the existing unified records untouched.
    for code, fund in catalog.items():
        if code in SUPPORTED or code in status['etfs']:continue
        status['etfs'][code]={
            'name':fund.get('name',code),'status':'not_configured',
            'detail':'暫時無法比較：未確認正確的每日完整實際持股來源（不能以申購贖回籃子代替）',
            'comparisonReady':False,'historicalDates':0
        }
    latest['updatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    status['checkedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    status['catalogCount']=len(catalog)
    status['updatedSources']=saved_count
    write(LATEST,latest);write(STATUS,status)
    print(json.dumps({'imported':saved_count,'supported':len(SUPPORTED),'results':report},ensure_ascii=False,indent=2))
    return report


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--sqlite',required=True,type=Path)
    p.add_argument('--max-history-days',type=int,default=240)
    args=p.parse_args()
    if not args.sqlite.is_file():print('IMPORT ERROR: crawler SQLite does not exist',file=sys.stderr);return 2
    try:ingest(args.sqlite,max_history_days=args.max_history_days)
    except (sqlite3.Error,BridgeError) as e:
        print('IMPORT ERROR:',e,file=sys.stderr);return 2
    return 0

if __name__=='__main__':sys.exit(main())
