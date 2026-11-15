#!/usr/bin/env python3
"""Safely convert existing Trade Compass index-ETF page to returns-only.

Patches current files in the checkout, not a stale index.html copy.
The returns computation module is never rewritten.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "index_etf.js"
HTML = ROOT / "index.html"
MARKER = "/* TC_INDEX_RETURNS_ONLY_V1 */"
PAGE_TITLE = "指數型 ETF 報酬試算"
FULL_TITLE = "指數型 ETF 股價與投入報酬試算（含配息、分割、總收益）"

# Use original state.fund and existing change handler to keep 0050/006208/009816 selector working.
INJECTION = '''\n  /* TC_INDEX_RETURNS_ONLY_V1 */
  if (!state.initialized) state.initialized = true;
  const fundOptions = Object.entries(FUNDS).map(([code,name]) =>
    `<option value="${code}"${code === state.fund ? ' selected' : ''}>${code} ${esc(name)}</option>`).join('');
  const returnsContent = window.TradeCompassETFReturns?.html?.(state.fund) ||
    '<section class="panel" style="padding:22px"><p class="alert">ETF 投資報酬試算模組尚未載入。請確認 index_etf_returns.js 已發布。</p></section>';
  // The existing investment widget owns dividends, splits, monthly investment and chart logic.
  // Do not call the old holdings / institutional comparison markup.
  return `<div class="head"><h1>指數型 ETF 股價與投入報酬試算（含配息、分割、總收益）</h1>
    <p class="subtitle">以歷史價格試算一次投入、分批加碼與定期定額；配息、分割與總收益依既有試算模組計算。</p></div>
    <section class="panel" style="padding:20px 23px;margin-bottom:16px"><div class="filter-row">
      <label for="indexFund">指數型 ETF</label><select id="indexFund" class="field">${fundOptions}</select>
    </div></section>` + returnsContent.replace(
      /<h2 class="panel-title">指數型 ETF 股價與投入報酬試算（含配息、分割、總收益）<\\/h2>/,
      '');
'''


def apply():
    if not JS.exists() or not HTML.exists():
        raise RuntimeError("找不到現有 index_etf.js 或 index.html；請從 stock-tracker 專案根目錄執行")
    original_js = JS.read_text(encoding="utf-8")
    original_html = HTML.read_text(encoding="utf-8")
    if "window.TradeCompassIndexETF=" not in original_js:
        raise RuntimeError("index_etf.js 結構與預期不同，拒絕覆蓋")
    if 'data-page="indexETF"' not in original_html:
        raise RuntimeError("index.html 找不到指數型 ETF 分頁，拒絕覆蓋")
    if "TradeCompassETFReturns" not in original_js and 'index_etf_returns.js' not in original_html:
        raise RuntimeError("index.html 沒有載入 index_etf_returns.js，拒絕刪除原介面")
    if MARKER not in original_js:
        target = "function render(){"
        if original_js.count(target) != 1:
            raise RuntimeError(f"index_etf.js 找到 {original_js.count(target)} 處 render()，為避免覆蓋其他程式而停止")
        original_js = original_js.replace(target, target + INJECTION, 1)

    # Replace breadcrumb and sidebar labels only, leave other pages untouched.
    original_html = re.sub(
        r'(?P<prefix>indexETF\s*:\s*[\'\"])(?:指數型\s*ETF[^\'\"]*)(?P<suffix>[\'\"])',
        lambda m: m.group('prefix') + PAGE_TITLE + m.group('suffix'),
        original_html,
    )
    original_html = re.sub(
        r'(?P<open><button\b[^>]*\bdata-page="indexETF"[^>]*>)(?P<body>.*?)(?P<close></button>)',
        lambda m: m.group('open') + re.sub(r'(</span>\s*).*', lambda x: x.group(1) + PAGE_TITLE, m.group('body'), flags=re.S) + m.group('close'),
        original_html,
        count=1, flags=re.S,
    )
    # Retire the older index-etf focus overlay: it re-adds holdings and institutional
    # sections, which would contradict this returns-only page. Keep the file itself.
    original_html = re.sub(
        r'<script\b(?=[^>]*\bsrc=[\'\"]index_etf_focus\.js(?:\?[^\'\"]*)?[\'\"])[^>]*>\s*</script>\s*',
        '', original_html, flags=re.I,
    )
    # No version-banner change: deployment success is still independently verified.
    JS.write_text(original_js, encoding="utf-8")
    HTML.write_text(original_html, encoding="utf-8")
    print('完成：指數型 ETF 分頁只顯示股價與投入報酬試算，導航與頁面標題已修改。')
    print('既有 ETF 模擬計算、三大法人與資料檔均未變更。')


if __name__ == '__main__':
    try:
        apply()
    except Exception as err:
        print('ERROR:', err, file=sys.stderr)
        sys.exit(1)
