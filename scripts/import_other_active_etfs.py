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
from import_ezmoney_sqlite import (select_rows, BridgeError,
    connection, DATE_RE)
from update_active_etf import archive_entry, read, write, BASE, LATEST, STATUS, HISTORY, CATALOG

UPSTREAM = 'https://github.com/SheenArtem/TWActiveETFCrawler'
# Upstream README identifies these issuer collectors as PCF / creation basket feeds.
# Do not present them as full-fund actual-position trade changes.
PCF_ONLY = {'00401A', '00996A', '00407A', '00410A'}
SUPPORTED = {'00980A': {'issuer': '野村', 'domain': 'nomurafunds.com.tw'}, '00985A': {'issuer': '野村', 'domain': 'nomurafunds.com.tw'}, '00999A': {'issuer': '野村', 'domain': 'nomurafunds.com.tw'}, '00982A': {'issuer': '群益', 'domain': 'capitalfund.com.tw'}, '00992A': {'issuer': '群益', 'domain': 'capitalfund.com.tw'}, '00991A': {'issuer': '復華', 'domain': 'fhtrust.com.tw'}, '00995A': {'issuer': '中信', 'domain': 'ctbcinvestments.com'}, '00406A': {'issuer': '中信', 'domain': 'ctbcinvestments.com'}, '00994A': {'issuer': '第一金', 'domain': 'fsitc.com.tw'}, '00408A': {'issuer': '第一金', 'domain': 'fsitc.com.tw'}, '00987A': {'issuer': '台新', 'domain': 'tsit.com.tw'}, '00984A': {'issuer': '安聯', 'domain': 'allianzgi.com.tw'}, '00993A': {'issuer': '安聯', 'domain': 'allianzgi.com.tw'}, '00400A': {'issuer': '國泰', 'domain': 'cathaysite.com.tw'}, '00401A': {'issuer': '摩根', 'domain': 'am.jpmorgan.com'}, '00405A': {'issuer': '富邦', 'domain': 'fubon.com'}, '00404A': {'issuer': '聯博', 'domain': 'alliancebernstein.com'}, '00996A': {'issuer': '兆豐', 'domain': 'megafunds.com.tw'}, '00407A': {'issuer': '凱基', 'domain': 'kgifund.com.tw'}, '00410A': {'issuer': '永豐', 'domain': 'sitc.sinopac.com'}}


# Known display names only; verified source eligibility is controlled by SUPPORTED, not catalog.
FUND_NAMES = {'00400A': '主動國泰動能高息', '00401A': '主動摩根台灣鑫收', '00404A': '主動聯博動能50', '00405A': '主動富邦台灣龍耀', '00406A': '主動中信台灣收益', '00407A': '主動凱基台灣', '00408A': '主動第一金優股息', '00410A': '主動永豐科技趨勢', '00980A': '主動野村臺灣優選', '00982A': '主動群益台灣強棒', '00984A': '主動安聯台灣高息', '00985A': '主動野村台灣50', '00987A': '主動台新優勢成長', '00991A': '主動復華未來50', '00992A': '主動群益科技創新', '00993A': '主動安聯台灣', '00994A': '主動第一金台股優', '00995A': '主動中信台灣卓越', '00996A': '主動兆豐台灣豐收', '00999A': '主動野村臺灣高息'}

def convert_day(code, date, rows, now=None):
    """Validate dated equity holdings without the old 30-day ingestion cap.

    This checks structural plausibility, NOT whether the issuer file is an
    actual full-fund portfolio rather than a PCF/creation basket.
    """
    if code in PCF_ONLY:
        raise BridgeError('Source is PCF / creation basket, not verified actual fund holdings')
    now = now or dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    if not DATE_RE.fullmatch(date):
        raise BridgeError('Invalid YYYY-MM-DD date')
    day = dt.date.fromisoformat(date)
    if day > now:
        raise BridgeError('Future disclosure date')
    if (now - day).days > 500:
        raise BridgeError('Date more than 500 days old')
    holdings=[]
    seen=set()
    weight_total=0.0
    symbol_re=re.compile(r'\d{4,6}[A-Z]?')
    asset_positions=[]
    for item in rows:
        symbol=str(item['stock_code'] or '').strip().upper()
        name=str(item['stock_name'] or symbol).strip()
        if not symbol_re.fullmatch(symbol):
            # Some issuer tables include a `股票` category/subtotal row, not
            # an individual security. Never treat it as a holding, and do not
            # count a category subtotal again when summing stock weights.
            if symbol in {'股票', '股票合計', '股票小計', '股票部位', '股票投資', '股票類'}:
                continue
            # The upstream SQLite `shares` column is not always a monetary
            # amount or contract count for cash/futures. Preserve its raw
            # numeric value, but never guess that the unit is TWD or lots.
            text=(symbol+' '+name).lower()
            if any(x in text for x in ('現金', '存款', 'cash', 'c_ntd', 'deposit', '活存', '定存')):
                kind='cash'
            elif any(x in text for x in ('期貨','期指','futures','future','台指','小台','微台','保證金')):
                kind='futures' if '保證金' not in text else 'margin'
            elif any(x in text for x in ('應收','應付','receivable','payable')):
                kind='receivable_payable'
            else:
                raise BridgeError('Unrecognized TW-equity symbol: '+repr(symbol))
            try:
                raw_amount=float(item['shares']) if item['shares'] is not None else None
                raw_weight=float(item['weight']) if item['weight'] is not None else None
            except (TypeError,ValueError):
                raise BridgeError('Invalid non-equity asset number: '+repr(symbol))
            if raw_amount is not None and not math.isfinite(raw_amount):
                raise BridgeError('Nonfinite asset quantity')
            if raw_weight is not None and (not math.isfinite(raw_weight) or abs(raw_weight)>200):
                raise BridgeError('Invalid non-equity asset weight')
            # Two-sided comparisons of *weights* are safe; units for absolute
            # amounts stay unverified unless the issuer explicitly labels them.
            explicit_unit='TWD' if any(x in text for x in ('新臺幣','新台幣','twd',' 元','nt$')) else ('contracts' if '口' in text and kind=='futures' else None)
            asset_positions.append({'id':symbol or name,'name':name,'type':kind,
                'reportedValue':raw_amount,'unit':explicit_unit or 'upstream_unverified',
                'unitVerified':bool(explicit_unit),
                'weight':round(raw_weight,5) if raw_weight is not None else None})
            continue
        if symbol in seen:
            raise BridgeError('Duplicate constituent: '+symbol)
        seen.add(symbol)
        try:
            shares=float(item['shares'])
            weight=float(item['weight'])
        except (ValueError,TypeError):
            raise BridgeError('Missing numeric shares/weight')
        if not (math.isfinite(shares) and shares>=0 and shares.is_integer()
                and math.isfinite(weight) and 0<=weight<=100):
            raise BridgeError('Invalid shares/weight values')
        name=str(item['stock_name'] or symbol).strip()
        holdings.append({'code':symbol,'name':name,'shares':int(shares),
                         'weight':round(weight,5)})
        weight_total+=weight
    if not 15 <= len(holdings) <= 200:
        raise BridgeError('Portfolio incomplete or unusual: '+str(len(holdings))+' constituents')
    if not 40 <= weight_total <= 103:
        raise BridgeError('Implausible aggregate equity weight: %.2f%%'%weight_total)
    return {
        'date':date,'complete':True,'kind':'actual_portfolio','etf':code,
        'source':UPSTREAM,'collector':UPSTREAM,
        'issuer':SUPPORTED[code]['issuer'],
        'issuerReferenceDomain':SUPPORTED[code]['domain'],
        'provenance':'upstream_issuer_scraper; independent_official_reconciliation_pending',
        'dataVerification':'structural_validation_only',
        'holdings':holdings,'equityWeightTotal':round(weight_total,4),
        'assetPositions':asset_positions,
        'assetPositionNote':'非股票類別來源數值的幣別或口數若未註明，不做金額/口數推定；可比較同一類別權重百分點。',
    }


def ingest(db_path:Path, today=None, max_history_days=240):
    today=today or dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    if not 1<=max_history_days<=500:raise BridgeError('max_history_days outside 1..500')
    # A partial or older website catalog must not disable explicitly supported sources.
    catalog_doc=read(CATALOG, {'schema':1,'funds':[]})
    if not isinstance(catalog_doc,dict) or not isinstance(catalog_doc.get('funds'),list):
        raise BridgeError('Invalid ETF catalog format')
    catalog={str(row.get('code','')).strip().upper():row for row in catalog_doc['funds']
             if isinstance(row,dict) and row.get('code')}
    added=[]
    for code,meta in SUPPORTED.items():
        if code not in catalog:
            item={'code':code,'name':FUND_NAMES.get(code,code),'category':'股票'}
            catalog[code]=item
            catalog_doc['funds'].append(item)
            added.append(code)
    if added:
        # Preserve existing catalog entries, metadata and unrelated ETF records.
        write(CATALOG,catalog_doc)
        print('CATALOG_RECOVERED',len(added),'codes:',','.join(added))
    latest=read(LATEST,{'schema':1,'snapshots':{}})
    status=read(STATUS,{'schema':1,'etfs':{}})
    if not isinstance(latest.get('snapshots'),dict):raise BridgeError('Invalid latest.json')
    if not isinstance(status.get('etfs'),dict):raise BridgeError('Invalid status.json')
    report={};saved_count=0
    with connection(db_path) as db:
        for code,meta in SUPPORTED.items():
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
                    'assetPositions':len(newest.get('assetPositions',[])),
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
                report[code]={'status':'unavailable','reason':status['etfs'][code]['detail'], 'databaseRows':len(rows), 'distinctDates':len(by_date)}
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
    for code, result in report.items():
        print('ETF_RESULT', code, result.get('status'), 'dates='+str(result.get('dates',0)),
              'rows='+str(result.get('databaseRows','?')),
              'reason='+str(result.get('reason',''))[:140])
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
