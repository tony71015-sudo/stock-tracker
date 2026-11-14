#!/usr/bin/env python3
"""Best-effort fallback to non-PCF actual-holdings disclosure pages.

Only publish an equity portfolio when a dated, full-looking row table with shares
and weights passes structural checks. Third-party observations are labeled as
such: completeness is NOT an independent reconciliation to the issuer.

No invented historic data: one live page = at most one dated snapshot/run.
"""
from __future__ import annotations
import argparse
import datetime as dt
from html.parser import HTMLParser
import json
import re
from pathlib import Path
import sys
from urllib.request import urlopen,Request
from urllib.parse import urlparse
from import_other_active_etfs import SUPPORTED, FUND_NAMES
from import_ezmoney_sqlite import BridgeError
from update_active_etf import archive_entry,read,write,BASE,LATEST,STATUS,HISTORY,CATALOG

SOURCES = {
 '00401A': {'url':'https://accounts.cmoney.tw/etf/tw/00401A/fundholding','type':'third_party','provider':'CMoney'},
 '00996A': {'url':'https://www.megafunds.com.tw/MEGA/etf/etf_product.aspx?id=23','type':'issuer_official','provider':'兆豐投信'},
 '00407A': {'url':'https://www.moneydj.com/etf/x/basic/basic0007.xdjhtm?etfid=00407a.tw','type':'third_party','provider':'MoneyDJ'},
 '00410A': {'url':'https://www.moneydj.com/etf/x/basic/basic0007.xdjhtm?etfid=00410a.tw','type':'third_party','provider':'MoneyDJ'},
}
DAY = re.compile(r'(20\d{2})[/-](\d{1,2})[/-](\d{1,2})')
STOCK = re.compile(r'^(?:\s*([\d]{4,6}[A-Z]?)\s*|.*?\(([\d]{4,6}[A-Z]?)(?:\.(?:TW|TWO))?\)\s*)$',re.I)


def clean(s):return re.sub(r'\s+','',str(s or '')).lower().replace('％','%')
def n_float(s):
 text=str(s or '').replace(',','').replace('%','').replace('％','').strip()
 if not re.fullmatch(r'\d+(?:\.\d+)?',text):raise BridgeError('Non-numeric holding value: '+repr(s)[:100])
 return float(text)

class TableHTML(HTMLParser):
 def __init__(self):
  super().__init__();self.tables=[];self.table=None;self.row=None;self.cell=None;self.all_text=[]
 def handle_starttag(self,tag,attrs):
  if tag=='table':self.table=[]
  elif self.table is not None and tag=='tr':self.row=[]
  elif self.row is not None and tag in ('td','th'):self.cell=[]
 def handle_data(self,data):
  if data.strip():self.all_text.append(data.strip())
  if self.cell is not None:self.cell.append(data)
 def handle_endtag(self,tag):
  if tag in ('th','td') and self.cell is not None:
   if self.row is not None:self.row.append(' '.join(self.cell).strip())
   self.cell=None
  elif tag=='tr' and self.row is not None:
   if self.row and self.table is not None:self.table.append(self.row)
   self.row=None
  elif tag=='table' and self.table is not None:
   self.tables.append((self.table,list(self.all_text)))
   self.table=None


def match_headers(header):
 cols=[clean(c) for c in header]
 def loc(candidates):return next((i for i,x in enumerate(cols) if any(k in x for k in candidates)),None)
 code=loc(('代號','個股名稱','股票名稱'))
 shares=loc(('持有股數','股數','持有數','持股股數'))
 weight=loc(('權重','投資比例','持股比重'))
 if None in (code,shares,weight):return None
 return code,shares,weight


def extract_html(text,code,source,now=None):
 now=now or dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
 parser=TableHTML();parser.feed(text)
 candidates=[]
 for table,preceding in parser.tables:
  for i,head in enumerate(table[:5]):
   fields=match_headers(head)
   if not fields:continue
   codes_i,shares_i,weight_i=fields
   # Date must precede the actual holdings table: never take site 'updated at'
   # blindly if the portfolio disclosure itself is not dated.
   earlier=' '.join(preceding)
   block=earlier[-1800:]
   date_mentions=list(DAY.finditer(block))
   if not date_mentions:continue
   last=date_mentions[-1];date=f'{last[1]}-{int(last[2]):02d}-{int(last[3]):02d}'
   try:disclosure=dt.date.fromisoformat(date)
   except ValueError:continue
   if disclosure>now or (now-disclosure).days>500:continue
   rows=[];seen=set();weight_total=0
   for cells in table[i+1:]:
    if len(cells)<=max(fields):continue
    label=cells[codes_i].strip()
    m=STOCK.fullmatch(label)
    if not m:continue
    sym=(m.group(1) or m.group(2)).upper()
    if sym in seen:raise BridgeError('Duplicate issuer/security row: '+sym)
    seen.add(sym)
    qty=n_float(cells[shares_i]);weight=n_float(cells[weight_i])
    if not qty.is_integer() or qty<0 or not 0<=weight<=100:raise BridgeError('Invalid shares or weight')
    if not m.group(1):name=label.rsplit('(',1)[0].strip()
    else:
     name=cells[codes_i+1].strip() if codes_i+1<len(cells) and codes_i+1 not in (shares_i,weight_i) else sym
    rows.append({'code':sym,'name':name,'shares':int(qty),'weight':round(weight,5)})
    weight_total+=weight
   if 15<=len(rows)<=200 and 40<=weight_total<=103:
    candidates.append({'date':date,'complete':True,'kind':'actual_portfolio','etf':code,
       'source':source['url'],'issuer':SUPPORTED[code]['issuer'],
       'sourceType':source['type'],'dataVerification':'structural_validation_only',
       'provenance':('official_issuer_webpage' if source['type']=='issuer_official' else 'third_party_holdings_page')+
                   '; completeness_not_independently_reconciled',
       'holdings':rows,'equityWeightTotal':round(weight_total,4)})
 # Some responsive sites print identical desktop/mobile tables. Accept only
 # identical duplicate renderings, never inconsistent date or constituents.
 unique={json.dumps(x,ensure_ascii=False,sort_keys=True):x for x in candidates}
 if len(unique)!=1:
  raise BridgeError('Expected one clearly dated complete holdings table, found '+str(len(unique))+
      '; do not replace PCF or guess a partial portfolio')
 return next(iter(unique.values()))


def fetch_source(src):
 # Explicit fixed URL allowlist. This is a conservative best-effort fetch;
 # HTML/JS changes, access restrictions, and provider terms may prevent it.
 host=urlparse(src['url']).hostname
 if host not in {'accounts.cmoney.tw','www.megafunds.com.tw','www.moneydj.com'}:
  raise BridgeError('Unexpected source host')
 req=Request(src['url'],headers={'User-Agent':'Mozilla/5.0 (TradeCompass portfolio archive research)','Accept':'text/html'})
 with urlopen(req,timeout=20) as response:
  if urlparse(response.geturl()).hostname!=host:raise BridgeError('Unexpected redirect hostname')
  raw=response.read(3_000_001)
 if len(raw)>3_000_000:raise BridgeError('Document too large')
 for codec in ('utf-8-sig','big5'):
  try:return raw.decode(codec)
  except UnicodeDecodeError:continue
 raise BridgeError('Unrecognized page encoding')


def run(codes,html_dir=None):
 reports={};latest=read(LATEST,{'schema':1,'snapshots':{}});status=read(STATUS,{'schema':1,'etfs':{}})
 for code in codes:
  source=SOURCES[code]
  try:
   html=(Path(html_dir)/(code+'.html')).read_text('utf-8') if html_dir else fetch_source(source)
   snap=extract_html(html,code,source)
   archive_entry(code,snap)
   dates=read(BASE/'indexes'/(code+'.json'),{'dates':[]}).get('dates',[])
   hist=read(HISTORY/(code+'.json'),{'snapshots':[]}).get('snapshots',[])
   latest.setdefault('snapshots',{})[code]=hist[:2]
   status.setdefault('etfs',{})[code]={'name':FUND_NAMES.get(code,code),'status':'ok',
     'date':dates[0],'historicalDates':len(dates),'holdings':len(snap['holdings']),
     'source':source['url'],'sourceType':source['type'],
     'verification':'structural_only; reconciliation_pending',
     'detail':('投信官方' if source['type']=='issuer_official' else '第三方')+
        '完整持股候選資料：結構驗證通過，尚未逐筆核對投信官方；不是 PCF，股數變化不等於經理人成交量。',
     'comparisonReady':len(dates)>=2}
   reports[code]={'status':'saved','date':snap['date'],'dates':len(dates),'rows':len(snap['holdings']),
                  'provider':source['provider']}
  except Exception as ex:
   # A source failing NEVER erases a prior valid snapshot/status.
   reports[code]={'status':'unavailable','reason':str(ex)[:220],'provider':source['provider']}
  print('ALT_SOURCE_RESULT',code,json.dumps(reports[code],ensure_ascii=False))
 write(STATUS,status);write(LATEST,latest)
 return reports


def main():
 p=argparse.ArgumentParser()
 p.add_argument('--fetch-all',action='store_true')
 p.add_argument('--code',choices=sorted(SOURCES),action='append')
 p.add_argument('--html-dir',type=Path,help='Offline test directory with per-code HTML exports; no network request')
 a=p.parse_args()
 if not a.fetch_all and not a.code:p.error('Use --fetch-all or --code')
 run(a.code or list(SOURCES),a.html_dir)
 return 0
if __name__=='__main__':sys.exit(main())
