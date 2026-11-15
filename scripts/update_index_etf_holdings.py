#!/usr/bin/env python3
"""Trade Compass verified holdings capture: official 006208 and labeled third-party fallback.

Do not treat PCF baskets, top-10 lists or index theoretical constituents as actual
fund holdings.  Third-party observations carry explicit provenance and are not
claiming issuer verification.  Source HTML can be tested offline via --html.
"""
import argparse
import datetime as dt
import json
import re
import sys
import urllib.parse
from pathlib import Path

SOURCES = {
 '0050': 'https://www.yuantaetfs.com/product/detail/0050/ratio',
 '006208': 'https://websys.fsit.com.tw/FubonETF/Trade/Assets.aspx?lan=TW&stkId=006208',
 '009816': 'https://www.kgifund.com.tw/Fund/Detail?fundID=J023',
}
THIRD_PARTY = {code: 'https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid='+code+'.TW' for code in SOURCES}
DATE_RE = re.compile(r'(20\d\d)\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})')
STOCK_CODE = re.compile(r'^\d{4,6}$')
MONEYDJ_CODE = re.compile(r'\(\s*(\d{4,6})\s*\.\s*TW\s*\)',re.I)
REJECT = re.compile(r'申購買回清單|申購贖回籃子|creation\s*basket|PCF',re.I)


def read_date(s, labels=('資料日期','交易日期','Trade Date','Date:')):
    for label in labels:
        m=re.search(re.escape(label)+r'\s*[:：]?\s*'+DATE_RE.pattern,s,re.I)
        if m:
            try: return dt.date(*map(int,m.groups()[-3:])).isoformat()
            except ValueError: pass
    return None


def number(s):
    s=str(s).strip().replace(',','').replace('%','').replace('，','')
    m=re.fullmatch(r'\s*([+-]?\d+(?:\.\d+)?)\s*',s)
    return float(m.group(1)) if m else None


def rows_from_table(table):
    from bs4 import BeautifulSoup
    output=[]
    for tr in table.find_all('tr'):
        cols=[' '.join(x.stripped_strings) for x in tr.find_all(['td','th'],recursive=False)]
        if cols:output.append(cols)
    return output


def parse_fubon(html):
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(html,'html.parser')
    text=soup.get_text(' ',strip=True)
    day=read_date(text)
    if not day:raise ValueError('Fubon: no explicit 資料日期')
    found={}
    # Strict stock-section header. Do not accidentally parse futures or cash rows.
    for table in soup.find_all('table'):
        rows=rows_from_table(table)
        if not rows:continue
        hi=next((i for i,r in enumerate(rows) if ('股票代碼' in ' '.join(r) and '股數' in ' '.join(r) and ('權重' in ' '.join(r) or '比重' in ' '.join(r)))),None)
        if hi is None:continue
        for cells in rows[hi+1:]:
            if len(cells)<5 or not STOCK_CODE.fullmatch(cells[0]):continue
            shares=number(cells[2]); weight=number(cells[-1]); code=cells[0]
            if shares is None or weight is None or not shares.is_integer() or shares<=0 or not 0<=weight<=100:continue
            found[code]={'code':code,'name':cells[1].strip(),'shares':int(shares),'weight':weight}
    if not found:
        # Static HTML can present a single table without explicit thead.
        raise ValueError('Fubon: stock table with 股數/權重 header not found (possibly JS-driven)')
    return day,list(found.values())


def parse_moneydj(html,etf):
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(html,'html.parser')
    text=soup.get_text(' ',strip=True)
    if '全部持股' not in text:raise ValueError('MoneyDJ: not an all-holdings page')
    day=read_date(text,('資料日期',))
    if not day:raise ValueError('MoneyDJ: holdings date missing')
    found={}
    for table in soup.find_all('table'):
        rows=rows_from_table(table)
        hi=next((i for i,r in enumerate(rows) if '個股名稱' in ' '.join(r) and ('投資比例' in ' '.join(r) or '權重' in ' '.join(r)) and ('股數' in ' '.join(r) or '口數' in ' '.join(r))),None)
        if hi is None:continue
        for cells in rows[hi+1:]:
            if len(cells)<3:continue
            m=MONEYDJ_CODE.search(cells[0]);
            if not m:continue
            code=m.group(1);weight=number(cells[1]);shares=number(cells[2]);
            if shares is None or weight is None or not shares.is_integer() or shares<=0 or not 0<=weight<=100:continue
            name=MONEYDJ_CODE.sub('',cells[0]).strip()
            found[code]={'code':code,'name':name,'shares':int(shares),'weight':weight}
    if not found:raise ValueError('MoneyDJ: no complete stock rows parsed; table may be paginated or changed')
    return day,list(found.values())


def parse_yuanta(html):
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(html,'html.parser')
    text=soup.get_text(' ',strip=True)
    # Official site often exposes only top 5 until JS user interaction.
    anchor=text.find('基金權重-股票'); stock_part=text[anchor: text.find('基金權重-期貨',anchor)] if anchor>=0 else text
    day=read_date(stock_part,('Trade Date','資料日期'))
    if not day:raise ValueError('Yuanta: explicit fund stock observation date unavailable')
    pattern=re.compile(r'商品代碼\s+(\d{4,6})\s+商品名稱\s+(.+?)\s+商品數量\s+([\d,]+)\s+商品權重\s+([\d.]+)')
    found={}
    for m in pattern.finditer(stock_part):
        code,name,amount,weight=m.groups();qty=number(amount);wt=number(weight)
        if qty is None or wt is None or not qty.is_integer():continue
        found[code]={'code':code,'name':name[:80],'shares':int(qty),'weight':wt}
    return day,list(found.values())


def validate(code,day,records,source_type,source):
    if not day:raise ValueError('No disclosed holdings date')
    if day>dt.date.today().isoformat():raise ValueError('Disclosed date is in the future')
    if len({r['code'] for r in records})!=len(records):raise ValueError('Duplicate stock codes')
    # Actual 006208 stock-section may have fewer than 40 equity rows.
    minimum=25 if code=='006208' and source_type=='official' else 40
    total=round(sum(r['weight'] for r in records),4)
    if len(records)<minimum or not (90<=total<=105):
        raise ValueError(f'Incomplete portfolio {len(records)} rows (min {minimum}), weights={total:.2f}%, source={source_type}')
    return {'schema':1,'etf':code,'date':day,'kind':'actual_portfolio','verified':True,
      'source':source,'sourceType':source_type,'sourceQuality':'official_full_portfolio' if source_type=='official' else 'third_party_full_portfolio_structural_check',
      'verificationNote':'格式及完整性檢查通過；第三方來源並非投信逐筆核對。持股變動不等於基金經理人交易。',
      'holdings':sorted(records,key=lambda x:x['code'])}


def fetch(session,url):
    response=session.get(url,timeout=35,headers={'User-Agent':'Mozilla/5.0 (compatible; TradeCompassPortfolio/2.0; research)'})
    response.raise_for_status();response.encoding=response.apparent_encoding or response.encoding
    return response.text


def capture(code, allow_third_party, backfill_days, html_file=None):
    import requests
    session=requests.Session();errors=[]; results=[]
    attempts=[]
    if html_file:
        raw=Path(html_file).read_text(encoding='utf-8');
        attempts.append(('offline','file://'+str(html_file),raw,None))
    else:
        if code=='006208':
            # Official archive supports the `ddate` parameter; preserve actual returned date.
            days=[dt.date.today()-dt.timedelta(days=i) for i in range(max(1,backfill_days*2+2))]
            days=[d for d in days if d.weekday()<5][:max(1,backfill_days)]
            for d in days:
                url=SOURCES[code]+'&ddate='+urllib.parse.quote(d.strftime('%Y/%m/%d'),safe='')
                attempts.append(('official',url,None,'fubon'))
        else:
            attempts.append(('official',SOURCES[code],None, 'yuanta' if code=='0050' else 'unavailable_official'))
        if allow_third_party:
            attempts.append(('third_party',THIRD_PARTY[code],None,'moneydj'))
    for typ,url,raw,parser in attempts:
        try:
            if raw is None:raw=fetch(session,url)
            if html_file:
                parser='fubon' if code=='006208' else 'moneydj'
                typ='offline'
            if parser=='fubon': day,records=parse_fubon(raw)
            elif parser=='yuanta':day,records=parse_yuanta(raw)
            elif parser=='moneydj':day,records=parse_moneydj(raw,code)
            else:raise ValueError('Official page exposes no verified full-position shares; do not parse top 10 as complete')
            snap=validate(code,day,records,'official' if typ=='official' else 'third_party' if typ=='third_party' else 'official',url)
            if snap['date'] not in {s['date'] for s in results}:results.append(snap)
            print(f'VALID code={code} asof={day} stocks={len(records)} weight={sum(r["weight"] for r in records):.2f}% source={typ}',flush=True)
            if typ=='official' and code!='006208':break
        except Exception as e:
            reason=f'{typ} {url}: {type(e).__name__}: {str(e)[:240]}'
            errors.append(reason);print('SOURCE_UNAVAILABLE',reason,flush=True)
    return results,errors


def dump(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');tmp.replace(path)


def save(root,snapshot):
    code,day=snapshot['etf'],snapshot['date']
    path=root/'data/index-etf/history'/code/(day+'.json')
    if path.exists():
        other=json.loads(path.read_text(encoding='utf-8'))
        if other.get('sourceType')=='official' and snapshot['sourceType']!='official':return False
        if other==snapshot:return False
        # Avoid rewriting historical snapshots, especially if third-party updated its past values.
        return False
    dump(path,snapshot);return True


def main():
    p=argparse.ArgumentParser();p.add_argument('--code',required=True,choices=SOURCES)
    p.add_argument('--allow-third-party',action='store_true',help='Optional clearly labeled MoneyDJ fallback')
    p.add_argument('--backfill-days',type=int,default=4)
    p.add_argument('--html',help='Offline HTML fixture for parser testing')
    p.add_argument('--root',default='.')
    args=p.parse_args();snapshots,errors=capture(args.code,args.allow_third_party,max(1,min(12,args.backfill_days)),args.html)
    saved=sum(save(Path(args.root),snap) for snap in snapshots)
    report={'etf':args.code,'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
            'snapshotsParsed':len(snapshots),'newSnapshots':saved,'errors':errors,
            'status':'saved' if snapshots else 'unavailable',
            'note':'不可將 PCF/前十大持股視為完整實際持股；第三方資料需交叉核對'}
    dump(Path(args.root)/'data/index-etf/capture-status'/f'{args.code}.json',report)
    print('RESULT '+json.dumps({k:v for k,v in report.items() if k!='errors'},ensure_ascii=False))
    # Even when unavailable, log the cause and continue to archive status safely.
    return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as e:
        print('CAPTURE_ERROR',repr(e),file=sys.stderr);raise SystemExit(2)
