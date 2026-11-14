#!/usr/bin/env python3
"""Official-source active-ETF actual-portfolio collector, v1.4.9.

For every catalog fund: publish explicit connection status. For issuer sources
verified as *actual complete holdings*, archive dated snapshots and preserve
history. Supports issuer CSV, JSON arrays and simple HTML tables; rejects PCF
creation baskets and incomplete/top-10 lists.

No source URL is invented; operators must configure a verified official endpoint.
No runtime API keys, paid feeds or unlicensed scraping dependencies.
"""
from __future__ import annotations
import argparse
import csv
import datetime as dt
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError,URLError
from urllib.parse import urlsplit
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'data'/'active-etf'
CATALOG=BASE/'catalog.json'
SOURCES=BASE/'sources.json'
LATEST=BASE/'latest.json'
STATUS=BASE/'status.json'
HISTORY=BASE/'history'
CODES=re.compile(r'[0-9A-Z]{4,15}')
DAY=re.compile(r'\d{4}-\d\d-\d\d')
MAX_HISTORY=240

class SourceError(ValueError):pass


def read(path,default):
    try:return json.loads(path.read_text('utf-8'))
    except (OSError,ValueError):return default


def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    raw=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n'
    if not path.exists() or path.read_text(encoding='utf-8')!=raw:path.write_text(raw,encoding='utf-8')


def normalize(name):
    return str(name or '').strip().replace(' ','').replace('\u3000','').lower()


def to_num(v,kind):
    if v is None or str(v).strip() in ('','—','-','--','N/A'):return None
    text=str(v).strip().replace(',','').replace('%','')
    if not re.fullmatch(r'(?:\d+\.?\d*|\.\d+)',text):raise SourceError(f'Invalid {kind} amount')
    val=float(text)
    if kind=='shares' and not val.is_integer():raise SourceError('Shares must be integer')
    if kind=='weight' and val>100:raise SourceError('Weight above 100%')
    return int(val) if kind=='shares' else val


def date_of(value):
    s=str(value or '').strip()
    if not DAY.fullmatch(s):raise SourceError(f'Invalid ISO disclosure date {s!r}')
    try:dt.date.fromisoformat(s)
    except ValueError as e:raise SourceError('Invalid calendar date') from e
    return s


def field_names(schema):
    """User-controlled per-issuer field mapping; mapped source labels are literal."""
    default={'date':'日期','code':'股票代號','name':'股票名稱','shares':'股數','weight':'權重'}
    return {**default,**(schema or {})}


def records_to_snapshot(records,source,etf):
    if not isinstance(records,list) or not records:raise SourceError('No disclosed securities')
    names=field_names(source.get('columns'))
    holdings=[];seen=set();dates=set()
    fixed=source.get('disclosure_date')
    for row in records:
        if not isinstance(row,dict):raise SourceError('Portfolio rows must be objects')
        normal={normalize(k):v for k,v in row.items()}
        def val(k):return normal.get(normalize(names[k]))
        code=str(val('code') or '').strip().upper()
        if not CODES.fullmatch(code):raise SourceError('Invalid issuer security identifier: '+code[:30])
        if code in seen:raise SourceError('Duplicate security: '+code)
        seen.add(code)
        disclosure=date_of(val('date') or fixed)
        dates.add(disclosure)
        shares=to_num(val('shares'),'shares')
        weight=to_num(val('weight'),'weight')
        if shares is None and weight is None:raise SourceError('Missing shares and weight')
        holdings.append({'code':code,'name':str(val('name') or code).strip(),
                         'shares':shares,'weight':weight})
    if len(dates)!=1:raise SourceError('Mixed dates in one official portfolio')
    min_items=int(source.get('minimum_holdings',5))
    if not 1<=min_items<=5000 or len(holdings)<min_items:raise SourceError('Incomplete portfolio (too few securities)')
    if len(holdings)>5000:raise SourceError('Unusually large portfolio')
    day=next(iter(dates))
    if day>dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat():raise SourceError('Future portfolio date')
    return {'date':day,'complete':True,'kind':'actual_portfolio',
            'source':source['url'],'etf':etf,'holdings':holdings}


def parse_csv(text,source,etf=None):
    rdr=csv.DictReader(io.StringIO(text.lstrip('\ufeff')))
    if not rdr.fieldnames:raise SourceError('CSV must include a header row')
    return records_to_snapshot(list(rdr),source,etf or source.get("etf", ""))


def follow_path(obj,path):
    for key in str(path).split('.'):
        if isinstance(obj,dict):obj=obj.get(key)
        elif isinstance(obj,list) and key.isdigit():obj=obj[int(key)]
        else:raise SourceError('JSON path not found: '+path)
    return obj


def parse_json(text,source,etf):
    try:data=json.loads(text)
    except json.JSONDecodeError as e:raise SourceError('Malformed issuer JSON') from e
    records=follow_path(data,source.get('rows_path','data'))
    if not isinstance(records,list):raise SourceError('Expected JSON holdings array')
    return records_to_snapshot(records,source,etf)


class HTMLTables(HTMLParser):
    def __init__(self):
        super().__init__();self.tables=[];self.table=None;self.row=None;self.cell=None
    def handle_starttag(self,tag,attrs):
        if tag=='table':self.table=[]
        elif self.table is not None and tag=='tr':self.row=[]
        elif self.row is not None and tag in ('td','th'):self.cell=[]
    def handle_data(self,data):
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self,tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(''.join(self.cell).strip());self.cell=None
        elif tag=='tr' and self.row is not None:
            if self.row:self.table.append(self.row)
            self.row=None
        elif tag=='table' and self.table is not None:
            self.tables.append(self.table);self.table=None


def parse_html(text,source,etf):
    parser=HTMLTables();parser.feed(text)
    wanted=field_names(source.get('columns'))
    for table in parser.tables:
        for i,header in enumerate(table[:8]):
            lookup={normalize(k):j for j,k in enumerate(header)}
            required=[wanted['code']]
            if not any(normalize(wanted[k]) in lookup for k in ('shares','weight')):continue
            if not all(normalize(v) in lookup for v in required):continue
            entries=[]
            for row in table[i+1:]:
                if len(row)!=len(header):continue
                entries.append(dict(zip(header,row)))
            return records_to_snapshot(entries,source,etf)
    raise SourceError('No complete holdings table with declared columns found')


def validate_source(source,code):
    if source.get('etf')!=code:raise SourceError('Config ETF identifier mismatch')
    if source.get('portfolio_kind')!='actual_holdings':raise SourceError('Creation basket/PCF not verified as actual holdings')
    if source.get('verified_actual_holdings') is not True:raise SourceError('Issuer full actual holdings source not yet verified')
    fmt=source.get('format','csv')
    if fmt not in ('csv','json','html_table'):raise SourceError('Unsupported issuer format')
    url=source.get('url','');domain=str(source.get('issuer_domain','')).lower().strip()
    parsed=urlsplit(url)
    if parsed.scheme!='https' or not parsed.hostname or not domain or not (parsed.hostname==domain or parsed.hostname.endswith('.'+domain)):
        raise SourceError('HTTPS official issuer domain does not match configured allowlist')
    if parsed.username or parsed.password or parsed.port not in (None,443):raise SourceError('Nonstandard source URL')
    return fmt


def get_source(source,etf):
    fmt=validate_source(source,etf)
    req=Request(source['url'],headers={'User-Agent':'Mozilla/5.0 (TradeCompass official actual holdings archive)',
                                       'Accept':'text/csv,application/json,text/html;q=0.9,*/*;q=0.5'})
    with urlopen(req,timeout=25) as response:
        body=response.read(3_000_001)
        final_host=urlsplit(response.geturl()).hostname
        domain=source['issuer_domain'].lower()
        if not final_host or not (final_host==domain or final_host.endswith('.'+domain)):
            raise SourceError('Official source redirected to unverified host')
        if len(body)>3_000_000:raise SourceError('Issuer document exceeds 3 MB')
    text=body.decode(source.get('encoding','utf-8-sig'))
    return {'csv':parse_csv,'json':parse_json,'html_table':parse_html}[fmt](text,source,etf)


def archive_entry(code,snapshot):
    """Publish an incremental date index and one immutable date file per snapshot.

    Retain a short legacy history window for previous UI versions; never rewrite
    all 240 full snapshots in latest/history JSON on every trading day.
    """
    file=HISTORY/(code+'.json')
    old=read(file,{'schema':1,'etf':code,'snapshots':[]})
    if old.get('schema')!=1 or old.get('etf')!=code or not isinstance(old.get('snapshots'),list):
        raise SourceError('Previous history format invalid')
    by_date={s['date']:s for s in old['snapshots'] if s.get('complete') and isinstance(s.get('holdings'),list)}
    by_date[snapshot['date']]=snapshot
    records=sorted(by_date.values(),key=lambda s:s['date'],reverse=True)
    day_dir=BASE/'daily'/code
    # On first upgrade, migrate existing verified historical snapshots into
    # independent date files before slimming the legacy aggregate.
    for item in records:
        write(day_dir/(item['date']+'.json'),{'schema':1,'etf':code,'snapshot':item})
    # Preserve previously indexed dates even after legacy window is trimmed.
    prior=read(BASE/'indexes'/(code+'.json'),{'dates':[]}).get('dates',[])
    dates=sorted(set(d for d in prior if isinstance(d,str) and DAY.fullmatch(d))|
                 {s['date'] for s in records},reverse=True)
    write(BASE/'indexes'/(code+'.json'),{
        'schema':1,'etf':code,'dates':dates,
        'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat()})
    write(file,{'schema':1,'etf':code,'snapshots':records[:15]})
    return records[:15]


def run():
    catalog=read(CATALOG,{}).get('funds',[])
    if len(catalog)<1:raise SourceError('Missing ETF catalog')
    codes=[item['code'] for item in catalog]
    if len(set(codes))!=len(codes):raise SourceError('Duplicate fund codes in catalog')
    config=read(SOURCES,{'sources':[]})
    configured={s['etf']:s for s in config.get('sources',[]) if isinstance(s,dict) and s.get('etf') in codes}
    previous=read(LATEST,{'schema':1,'snapshots':{}})
    if previous.get('schema')!=1 or not isinstance(previous.get('snapshots'),dict):raise SourceError('Invalid latest.json')
    summary={};updated=0
    for item in catalog:
        code=item['code'];source=configured.get(code)
        archive=read(HISTORY/(code+'.json'),{'snapshots':[]})
        history=archive.get('snapshots',[])
        base={'name':item.get('name',code),'historicalDates':len(history),
              'date':history[0]['date'] if history else None}
        if not source:
            summary[code]={**base,'status':'not_configured','detail':'尚未核實完整官方投資組合來源'}
            continue
        try:
            validate_source(source,code)
            snapshot=get_source(source,code)
            saved=archive_entry(code,snapshot)
            previous['snapshots'][code]=saved[:2]
            summary[code]={**base,'status':'ok','date':saved[0]['date'],'historicalDates':len(read(BASE/'indexes'/(code+'.json'),{'dates':[]}).get('dates',[])),'holdings':len(snapshot['holdings']),
                           'source':source['url']}
            updated+=1
            print('OK',code,snapshot['date'],len(snapshot['holdings']))
        except Exception as error:
            code_status='not_verified' if isinstance(error,SourceError) and ('not yet verified' in str(error) or 'Creation basket' in str(error)) else 'error'
            summary[code]={**base,'status':code_status,'detail':str(error)[:180]}
            print('WARNING',code,str(error)[:180])
        time.sleep(max(0,float(config.get('delay_seconds',0.5))))
    now=dt.datetime.now(dt.timezone.utc).isoformat()
    if updated:previous['updatedAt']=now
    write(LATEST,previous)
    write(STATUS,{'schema':1,'checkedAt':now,'catalogCount':len(codes),'configuredSources':len(configured),'updatedSources':updated,'etfs':summary})
    print(f'Active ETF: {updated} verified official feeds updated / {len(codes)} listed; {len(configured)} configured')
    return summary

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--validate-only',action='store_true',help='Validate catalog and source declarations without remote fetch')
    opts=parser.parse_args()
    if opts.validate_only:
        catalog=read(CATALOG,{}).get('funds',[])
        configured=read(SOURCES,{'sources':[]}).get('sources',[])
        print('Listed funds',len(catalog),'configured issuer feeds',len(configured))
        for entry in configured:print(entry.get('etf'),validate_source(entry,entry.get('etf')))
    else:run()
