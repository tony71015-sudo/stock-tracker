"""Estimate daily maintenance under a disclosed uniform 60% borrowing scenario."""
import json
import time
import urllib.request
from pathlib import Path

root = Path('data/margin')
dates = json.loads((root/'index.json').read_text())['dates']
cache = root/'closes'
cache.mkdir(exist_ok=True)
series = {}
costs = {}
for day in dates:
    dest = cache/(day+'.json')
    if not dest.exists() or day == dates[-1]:
        url = 'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?type=ALLBUT0999&response=json&date='+day.replace('-','')
        report = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'}),timeout=60))
        prices = {}
        for table in report.get('tables', []):
            fields = table.get('fields', [])
            if '收盤價' in fields and '證券代號' in fields:
                for row in table['data']:
                    value = row[fields.index('收盤價')].replace(',','').strip()
                    if value.replace('.','',1).isdigit() and float(value)>0:
                        prices[row[fields.index('證券代號')].strip()] = float(value)
        if not prices or report.get('date') != day.replace('-',''):
            raise ValueError('Missing closing prices for '+day)
        dest.write_text(json.dumps(prices,separators=(',',':')))
        time.sleep(0.5)
    prices=json.loads(dest.read_text())
    stocks=json.loads((root/(day+'.json')).read_text())['stocks']
    next_costs={}
    for code,(buy,sell,repay,previous,balance) in stocks.items():
        price=prices.get(code)
        if not price or balance<=0:
            continue
        retained=max(0,balance-buy)
        old=costs.get(code,price)
        cost=(retained*old+min(buy,balance)*price)/balance
        if cost<=0: continue
        next_costs[code]=cost
        series.setdefault(code,[]).append([day,round(price/(cost*.6)*100,2),round(cost,2)])
    costs=next_costs
out=root/'ratios'
out.mkdir(exist_ok=True)
for code,rows in series.items():
    (out/(code+'.json')).write_text(json.dumps(rows,separators=(',',':')))
