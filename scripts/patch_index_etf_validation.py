#!/usr/bin/env python3
"""Targeted frontend validator patch for official 006208 25-39 stock snapshots.
Does not replace the user's latest index_etf.js with an older copy.
"""
from pathlib import Path
import sys
path=Path('index_etf.js')
if not path.exists():
    print('FRONTEND_PATCH skipped: index_etf.js does not exist');sys.exit(0)
text=path.read_text(encoding='utf-8')
old="if(s.holdings.length<40)throw Error('少於 40 檔，不能確認為完整成分股持股');"
new="if(s.holdings.length < (etf==='006208' && s.sourceType==='official' ? 25 : 40))throw Error('持股檔數不足，無法確認完整實際持股');"
if new in text:
    print('FRONTEND_PATCH already installed');sys.exit(0)
if text.count(old)!=1:
    print('FRONTEND_PATCH skipped: current frontend version differs; do not overwrite it');sys.exit(0)
text=text.replace(old,new).replace('每份不少於 40 檔成分股的完整持股資料','通過來源與完整性驗證的實際持股資料')
path.write_text(text,encoding='utf-8')
print('FRONTEND_PATCH applied to index_etf.js (006208 official only)')
