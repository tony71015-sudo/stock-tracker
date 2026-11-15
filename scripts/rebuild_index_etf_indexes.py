#!/usr/bin/env python3
"""Rebuild index-date listings from structurally checked actual-fund snapshots."""
import json
import pathlib
import re
from datetime import datetime,timezone
ROOT=pathlib.Path('data/index-etf')
for code in ('0050','006208','009816'):
    folder=ROOT/'history'/code
    found=[];sources={}
    for file in sorted(folder.glob('????-??-??.json')):
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',file.stem):continue
        try:
            snap=json.loads(file.read_text(encoding='utf-8'))
            items=snap.get('holdings',[])
            source=snap.get('sourceType','unknown')
            minrows=25 if code=='006208' and source=='official' else 40
            total=sum(float(r['weight']) for r in items)
            ok=(snap.get('etf')==code and snap.get('date')==file.stem and snap.get('kind')=='actual_portfolio'
                and snap.get('verified') is True and len(items)>=minrows and 90<=total<=105
                and len({r['code'] for r in items})==len(items))
            if ok:
                found.append(file.stem);sources[file.stem]=source
        except Exception as e:
            print('INVALID_SNAPSHOT',file,str(e)[:150])
    dates=sorted(set(found),reverse=True)
    index={'schema':1,'etf':code,'dates':dates,'dataKind':'actual_portfolio',
        'status':'comparable' if len(dates)>=2 else 'single_day' if dates else 'unavailable',
        'sourceTypesByDate':sources,'updatedAt':datetime.now(timezone.utc).isoformat(),
        'note':'實際持股快照。第三方完整持股經程式結構檢查，非投信官方逐筆驗證；PCF 不得冒充基金持股。'}
    path=ROOT/'indexes'/f'{code}.json';path.parent.mkdir(parents=True,exist_ok=True)
    # Avoid rewriting when contents unchanged (except update time).
    if path.exists():
        try:
            old=json.loads(path.read_text(encoding='utf-8'))
            if all(old.get(k)==index[k] for k in ('dates','status','sourceTypesByDate')):
                print('INDEX',code,len(dates),'unchanged');continue
        except Exception:pass
    path.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('INDEX',code,len(dates),index['status'])
