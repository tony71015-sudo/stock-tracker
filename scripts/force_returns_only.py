#!/usr/bin/env python3
"""Rewire existing indexETF page to its already-installed returns widget.
Does not change finance calculations or data. Idempotent, fails closed.
"""
from pathlib import Path
import re
import sys

ROOT=Path(__file__).resolve().parents[1]
INDEX=ROOT/'index.html'
JS=ROOT/'index_etf.js'
PAGE='指數型 ETF 報酬試算'
FULL='指數型 ETF 股價與投入報酬試算（含配息、分割、總收益）'
MARK='/* TC_RETURNS_ONLY_DIRECT_V2 */'

INJECT=r'''
  /* TC_RETURNS_ONLY_DIRECT_V2 */
  if (!state.initialized) state.initialized = true;
  const selectedFund = ['0050','006208','009816'].includes(state.fund) ? state.fund : '0050';
  const selectOptions = Object.entries(FUNDS).map(([code,name]) =>
    `<option value="${code}"${selectedFund===code?' selected':''}>${code} ${esc(name)}</option>`).join('');
  const widget = window.TradeCompassETFReturns?.html?.(selectedFund);
  const content = widget ? widget.replace(/<h2\b[^>]*class="panel-title"[^>]*>\s*指數型 ETF 股價與投入報酬試算（含配息、分割、總收益）\s*<\/h2>/, '')
    : '<section class="panel" style="padding:22px"><p class="alert">報酬試算尚未載入。請確認 index_etf_returns.js 已發布。</p></section>';
  return `<div class="head"><div><div class="eyebrow">INDEX ETF INVESTMENT RETURNS</div><h1>指數型 ETF 股價與投入報酬試算（含配息、分割、總收益）</h1><p class="subtitle">0050、006208、009816：歷史股價、投入、配息、分割、定期定額與總收益試算。</p></div></div><section class="panel" style="padding:20px 23px"><div class="filter-row"><label for="indexFund">指數型 ETF</label><select id="indexFund" class="field">${selectOptions}</select></div></section>` + content;
'''

def fix():
    if not INDEX.exists() or not JS.exists(): raise ValueError('找不到 index.html 或 index_etf.js')
    html=INDEX.read_text(encoding='utf-8')
    js=JS.read_text(encoding='utf-8')
    if 'data-page="indexETF"' not in html: raise ValueError('首頁沒有 indexETF 分頁')
    if 'index_etf_returns.js' not in html: raise ValueError('找不到報酬試算模組引用 index_etf_returns.js；停止修改，避免空白頁')
    if 'window.TradeCompassIndexETF' not in js or 'function render(){' not in js: raise ValueError('index_etf.js 的模組介面不相容，停止修改')
    if MARK not in js:
        js=js.replace('function render(){','function render(){'+INJECT,1)
    # Apply consistent sidebar and breadcrumb labels, with narrow target scope.
    html,nnav=re.subn(r'(<button\b[^>]*data-page=["\']indexETF["\'][^>]*>)([\s\S]*?)(</button>)',
      lambda m:m.group(1)+re.sub(r'(</span>\s*)[\s\S]*$',lambda p:p.group(1)+PAGE,m.group(2),count=1)+m.group(3),html,count=1)
    if nnav!=1: raise ValueError('無法辨識指數型 ETF 左側選單')
    html,ncrumb=re.subn(r'(indexETF\s*:\s*["\'])[^"\']*(["\'])',lambda m:m.group(1)+PAGE+m.group(2),html)
    if ncrumb==0: raise ValueError('無法辨識 navTitle 中的 indexETF 標籤')
    # Remove any focus overlay, as it would wrap the old holdings+institutions UI.
    html=re.sub(r'<script\b(?=[^>]*\bsrc=["\']index_etf_focus\.js(?:\?[^"\']*)?["\'])[^>]*>\s*</script>\s*','',html,flags=re.I)
    if MARK not in js or PAGE not in html or FULL not in js: raise ValueError('修改後驗證失敗')
    JS.write_text(js,encoding='utf-8')
    INDEX.write_text(html,encoding='utf-8')
    print('PASS: 原始碼 index_etf.js 已直接優先渲染報酬試算')
    print('PASS: index.html 側邊選單與麵包屑標題更新、舊覆蓋模組移除')

if __name__=='__main__':
    try: fix()
    except Exception as e:
        print('ERROR:',e,file=sys.stderr)
        sys.exit(1)
