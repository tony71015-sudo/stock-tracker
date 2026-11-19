import datetime as dt
import json
import time
import urllib.request
from pathlib import Path

root = Path("data/margin")
root.mkdir(parents=True, exist_ok=True)
calendar = json.loads(Path("data/history/taiex.json").read_text())["rows"]
dates = [row[0] for row in calendar[-240:]]
today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
if today not in dates:
    dates.append(today)
num = lambda x: int(str(x).replace(",", ""))
for date in reversed(dates):
    dest = root / (date + ".json")
    if dest.exists() and date < dates[-2]:
        continue
    url = "https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?response=json&selectType=ALL&date=" + date.replace("-", "")
    req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
    payload = json.load(urllib.request.urlopen(req, timeout=60))
    if payload.get("stat") != "OK" or payload.get("date") != date.replace("-", ""):
        continue
    stocks = {}
    market = None
    for table in payload.get("tables", []):
        for row in table.get("data", []):
            if "融資金額" in row[0] and "仟元" in row[0]:
                market = [num(v) for v in row[1:6]]
            elif len(row)>=8 and row[0].strip().isalnum() and "代號" in str(table.get("fields",[])[:1]):
                stocks[row[0].strip()] = [num(v) for v in row[2:7]]
    if market and stocks:
        dest.write_text(json.dumps(dict(market=market,stocks=stocks),separators=(",",":")))
    time.sleep(1)
files = sorted(p.stem for p in root.glob("????-??-??.json"))[-240:]
if not files:
    raise RuntimeError("No valid TWSE margin reports")
(root/"index.json").write_text(json.dumps(dict(dates=files,checked=dt.datetime.now(dt.timezone.utc).isoformat())))
