#!/usr/bin/env python3
"""Import official full-fund holdings, never a PCF. Fails closed on insufficient rows.

This standalone utility is intentionally independent from institutional flows.
The official sites may change markup or block automation; no snapshot is written
unless at least 40 distinct equity rows with legitimate quantities/weights parse.
"""
import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

SOURCES = {
    '0050': 'https://www.yuantaetfs.com/product/detail/0050/ratio',
    '006208': 'https://websys.fsit.com.tw/FubonETF/Fund/Assets.aspx?stkId=006208',
    '009816': 'https://www.kgifund.com.tw/Fund/Detail?fundID=J023',
}
DENY = re.compile(r'(期貨|權證|現金|存款|保證金|股票合計|合計|總計|申購|買回|PCF|creation basket)', re.I)
CODE = re.compile(r'(?<!\d)(\d{4,6})(?!\d)')
DATE = re.compile(r'(20\d{2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})')


def number(s):
    text = str(s).replace(',', '').replace('%', '').strip()
    text = re.sub(r'[^0-9.\-]', '', text)
    try:
        return float(text)
    except ValueError:
        return None


def clean_text(s):
    return re.sub(r'\s+', ' ', str(s)).strip()


def find_date(text):
    # Look for an explicit fund portfolio observation date, not the computer date.
    for expression in (r'(?:資料日期|交易日期|Trade Date|持股日期)\s*[：:\s]*' + DATE.pattern,):
        match = re.search(expression, text, re.I)
        if match:
            try:
                return dt.date(*map(int, match.groups()[-3:])).isoformat()
            except ValueError:
                continue
    return None


def parse_html(html, etf):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    text = soup.get_text(' ', strip=True)
    if re.search(r'(?i)PCF\s*(?:申購|籃子|basket)|申購買回清單', text[:3000]):
        raise ValueError('Possible PCF, refusing to classify as actual fund holdings')
    date = find_date(text)
    if not date:
        raise ValueError('No explicit official holdings observation date in page')
    if date > dt.date.today().isoformat():
        raise ValueError('Future dated holdings; refusing')
    # Table parse: official pages may have stock, future and cash tables.
    # Examine only rows with plausible TW equity stock codes and quantity fields.
    found = {}
    for table in soup.find_all('table'):
        table_text = clean_text(table.get_text(' ', strip=True))[:300]
        parent = clean_text(table.parent.get_text(' ', strip=True))[:240] if table.parent else ''
        context = (table_text + ' ' + parent)
        if ('股票' not in context and 'Stock' not in context and '商品代碼' not in context and '持股' not in context):
            # MoneyDJ sometimes has no section label, but has recognizable headers
            if not re.search(r'(個股名稱|持有股數|投資比例|商品代碼)', table_text):
                continue
        for tr in table.find_all('tr'):
            cols = [clean_text(el.get_text(' ', strip=True)) for el in tr.find_all(['th','td'], recursive=False)]
            if len(cols) < 3 or DENY.search(' '.join(cols[:2])):
                continue
            m = CODE.search(cols[0])
            if not m:
                continue
            code = m.group(1)
            if code in found:
                continue
            # Many official sources are code,name,shares,amount,weight.
            nums = [number(c) for c in cols[2:]]
            nums = [n for n in nums if n is not None]
            if len(nums) < 2:
                continue
            shares = nums[0]
            weight = nums[-1]
            if not (shares >= 0 and shares.is_integer() and 0 <= weight <= 100):
                continue
            name = cols[1][:80]
            if not name or CODE.fullmatch(name):
                continue
            found[code] = {'code': code, 'name': name, 'shares': int(shares), 'weight': weight}
    records = list(found.values())
    total_weight = sum(r['weight'] for r in records)
    if len(records) < 40 or not (75 <= total_weight <= 105):
        raise ValueError(f'Incomplete or unrecognized official table: {len(records)} equity rows, total weight {total_weight:.2f}%')
    return {'schema': 1, 'etf': etf, 'date': date, 'kind': 'actual_portfolio',
            'verified': True, 'source': SOURCES[etf], 'holdings': sorted(records, key=lambda r:r['code'])}


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    tmp.replace(path)


def save(root, snapshot):
    etf, date = snapshot['etf'], snapshot['date']
    folder = root/'data'/'index-etf'/'history'/etf
    target = folder/f'{date}.json'
    if target.exists():
        existing = json.loads(target.read_text(encoding='utf-8'))
        if existing != snapshot:
            raise ValueError(f'Existing validated snapshot differs: {target}; review manually')
    else:
        atomic_write(target, snapshot)
    idx = root/'data'/'index-etf'/'indexes'/f'{etf}.json'
    dates = sorted({p.stem for p in folder.glob('????-??-??.json') if re.fullmatch(r'\d{4}-\d{2}-\d{2}', p.stem)}, reverse=True)
    atomic_write(idx, {'schema':1, 'etf':etf, 'dates':dates, 'dataKind':'actual_portfolio',
                       'status':'comparable' if len(dates)>=2 else 'single_day',
                       'source':SOURCES[etf], 'note':'Official issuer portfolio, not PCF; check source date and quantity'})
    return target, len(dates)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--code',choices=sorted(SOURCES),required=True)
    p.add_argument('--html',help='Optional HTML file saved from the issuer official portfolio page')
    p.add_argument('--root',default='.')
    a=p.parse_args()
    if a.html:
        html=Path(a.html).read_text(encoding='utf-8')
    else:
        import requests
        r=requests.get(SOURCES[a.code],timeout=30,headers={'User-Agent':'Mozilla/5.0 TradeCompassResearch/1.0'})
        r.raise_for_status()
        html=r.text
    snap=parse_html(html,a.code)
    target,count=save(Path(a.root),snap)
    print(f'SAVED {a.code} date={snap["date"]} rows={len(snap["holdings"])} valid_dates={count} path={target}')

if __name__=='__main__':
    try:
        main()
    except Exception as e:
        print('UNAVAILABLE (no changes saved):',str(e),file=sys.stderr)
        raise SystemExit(2)
