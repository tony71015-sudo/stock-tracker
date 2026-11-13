#!/usr/bin/env python3
"""Trade Compass v1.4 official after-close price and day-trading snapshot updater.
No private portfolio or credentials are transmitted. Only official TWSE / TPEx open data.
Fail closed for invalid/missing columns; old validated market snapshot may be retained.
"""
from __future__ import annotations
import datetime as dt
import json
import logging
import re
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'data'/'market'/'latest.json'
LOG=logging.getLogger('market')
HEADERS={'User-Agent':'Mozilla/5.0 (compatible; TradeCompass/1.4; public data research)','Accept':'application/json,text/plain,*/*'}
SOURCES={
 'twse':'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
 'tpex':'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes',
 'twse_daytrade':'https://www.twse.com.tw/exchangeReport/TWTB4U?response=json&date={date}&selectType=All',
 'tpex_daytrade':'https://www.tpex.org.tw/openapi/v1/tpex_intraday_trading_statistics',
}

def fetch_json(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=35) as resp:
        if resp.status != 200: raise ValueError('HTTP '+str(resp.status))
        blob=resp.read(5_000_000)
        if b'<' in blob[:50]: raise ValueError('API returned HTML instead of JSON')
        return json.loads(blob)

def num(v,integer=False):
    if v is None or isinstance(v,bool): return None
    s=str(v).replace(',','').replace('＋','+').replace('－','-').strip()
    if s in ('','--','—','-','N/A','除權息','X'): return None
    if not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)',s): return None
    x=float(s)
    if not (-1e16<x<1e16): return None
    if integer and x!=int(x): return None
    return int(x) if integer else x

def iso(v):
    s=str(v or '').strip().replace('.','/').replace('-','/')
    if re.fullmatch(r'\d{7}',s): y=int(s[:3])+1911;m=int(s[3:5]);d=int(s[5:])
    elif re.fullmatch(r'\d{8}',s):y=int(s[:4]);m=int(s[4:6]);d=int(s[6:])
    elif re.fullmatch(r'\d{2,4}/\d{1,2}/\d{1,2}',s):
        y,m,d=map(int,s.split('/')); y+=1911 if y<1911 else 0
    else: return None
    try:return dt.date(y,m,d).isoformat()
    except ValueError:return None

def get(row,*keys):
    for k in keys:
        if k in row and row[k] not in ('',None):return row[k]
    return None

def parse_twse(items):
    if not isinstance(items,list):raise ValueError('TWSE STOCK_DAY_ALL expected list')
    output=[]
    for x in items:
        if not isinstance(x,dict):continue
        code=str(get(x,'Code','證券代號') or '').strip()
        date=iso(get(x,'Date','日期'))
        if not re.fullmatch('[0-9A-Z]{4,8}',code) or not date:continue
        op=num(get(x,'OpeningPrice','開盤價'));hi=num(get(x,'HighestPrice','最高價'))
        lo=num(get(x,'LowestPrice','最低價'));cl=num(get(x,'ClosingPrice','收盤價'))
        vol=num(get(x,'TradeVolume','成交股數'),True)
        if None in (op,hi,lo,cl,vol) or lo<=0 or lo>op or op>hi or lo>cl or cl>hi or vol<0:continue
        output.append(dict(market='TWSE',date=date,code=code,name=str(get(x,'Name','證券名稱') or code).strip(),open=op,high=hi,low=lo,close=cl,volumeShares=vol,tradeValue=num(get(x,'TradingValue','TradingAmount','TradeValue','成交金額'),True),daytradeShares=None))
    if len(output)<100:raise ValueError('TWSE returned too few validated records')
    return output

def parse_tpex(items):
    if not isinstance(items,list):raise ValueError('TPEx daily quotes expected list')
    output=[]
    for x in items:
        if not isinstance(x,dict):continue
        code=str(get(x,'SecuritiesCompanyCode','SecuritiesCode','Code','代號','證券代號') or '').strip()
        date=iso(get(x,'Date','日期','資料日期'))
        if not re.fullmatch('[0-9A-Z]{4,8}',code) or not date:continue
        op=num(get(x,'OpeningPrice','Open','開盤'));hi=num(get(x,'HighestPrice','High','最高'))
        lo=num(get(x,'LowestPrice','Low','最低'));cl=num(get(x,'Close','ClosePrice','ClosingPrice','收盤'))
        vol=num(get(x,'TradingShares','TradeVolume','TradingVolume','成交股數'),True)
        if None in (op,hi,lo,cl,vol) or lo<=0 or lo>op or op>hi or lo>cl or cl>hi or vol<0:continue
        output.append(dict(market='TPEX',date=date,code=code,name=str(get(x,'CompanyName','SecuritiesName','Name','名稱') or code).strip(),open=op,high=hi,low=lo,close=cl,volumeShares=vol,tradeValue=num(get(x,'TradingValue','TradingAmount','TradeValue','成交金額'),True),daytradeShares=None))
    if len(output)<100:raise ValueError('TPEx returned too few validated records (field schema may have changed)')
    return output

def parse_daytrade(payload):
    """Extract only when a table explicitly identifies its symbol and daytrade volume columns.
    No silent reliance on positional columns; if unavailable UI shows '--'.
    """
    tables=[]
    if isinstance(payload,list) and payload and isinstance(payload[0],dict):
        for x in payload:
            code=str(get(x,'Code','SecuritiesCode','代號','證券代號') or '').strip()
            value=get(x,'DayTradingVolume','DayTradeVolume','當日沖銷交易成交股數','當沖成交股數')
            if code and num(value,True) is not None:tables.append((code,num(value,True)))
        return dict(tables)
    if not isinstance(payload,dict):return {}
    block=payload.get('tables') or [payload]
    for t in block:
        fields=t.get('fields') or []
        rows=t.get('data') or []
        if not fields or not rows:continue
        low=[str(v).replace('\n','').replace(' ','') for v in fields]
        try:code_idx=next(i for i,x in enumerate(low) if x in ('證券代號','股票代號','代號'))
        except StopIteration:continue
        try:vol_idx=next(i for i,x in enumerate(low) if ('當日沖銷' in x or '當沖' in x) and ('成交股數' in x or '交易股數' in x))
        except StopIteration:continue
        for row in rows:
            if not isinstance(row,list) or max(code_idx,vol_idx)>=len(row):continue
            code=str(row[code_idx]).strip();n=num(row[vol_idx],True)
            if re.fullmatch('[0-9A-Z]{4,8}',code) and n is not None and n>=0:tables.append((code,n))
    return dict(tables)

def choose_date(rows):
    counts={}
    for row in rows:counts[row['date']]=counts.get(row['date'],0)+1
    return max(counts,key=counts.get)

def update():
    old={}
    if DEST.exists():
        try: old=json.loads(DEST.read_text('utf8'))
        except (ValueError,OSError):pass
    old_items={m:[x for x in old.get('items',[]) if x.get('market')==m] for m in ('TWSE','TPEX')}
    items=[];dates={};warnings=[];status={}
    for m,parser in [('TWSE',parse_twse),('TPEX',parse_tpex)]:
        try:
            records=parser(fetch_json(SOURCES[m.lower()]))
            d=choose_date(records)
            records=[x for x in records if x['date']==d]
            if d>dt.date.today().isoformat():raise ValueError('Unexpected future date: '+d)
            # Prevent backward rollback if an official API is delayed.
            prev=old.get('markets',{}).get(m,{}).get('date')
            if prev and d<prev and old_items[m]:
                warnings.append(f'{m}: API date {d} is older than published {prev}, retained previous validated snapshot')
                records=old_items[m];d=prev
            dates[m]=d
            if m=='TWSE':
                url=SOURCES['twse_daytrade'].format(date=d.replace('-',''))
            else:url=SOURCES['tpex_daytrade']
            try:
                daytrade=parse_daytrade(fetch_json(url))
                for x in records:
                    amt=daytrade.get(x['code'])
                    if amt is not None and 0<=amt<=x['volumeShares']:
                        x['daytradeShares']=amt
                if not daytrade:warnings.append(m+': official day-trading volume columns not validated; displaying N/A')
            except Exception as e:warnings.append(m+': day-trading API unavailable ('+str(e)[:100]+')')
            items+=records;status[m]={'date':d,'count':len(records),'source':SOURCES[m.lower()]}
        except Exception as e:
            warnings.append(f'{m}: unable to refresh: {e}')
            items+=old_items[m]
            status[m]=old.get('markets',{}).get(m,{'date':None,'count':0,'source':SOURCES[m.lower()]})
    obj={'schema':1,'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'markets':status,'items':items,'warnings':warnings,'sources':SOURCES}
    DEST.parent.mkdir(parents=True,exist_ok=True)
    DEST.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    print('Market snapshot:',len(items),'rows','TWSE',status['TWSE']['date'],'TPEX',status['TPEX']['date'])
    for w in warnings:print('WARNING',w)
    return bool(items)

if __name__=='__main__':
    logging.basicConfig(level=logging.INFO)
    if not update():raise SystemExit('No validated stock market data; retaining empty placeholder')
