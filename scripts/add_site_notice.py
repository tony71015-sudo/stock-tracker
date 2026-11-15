#!/usr/bin/env python3
"""Add an honest, persistent development/data verification notice and changelog.
Safe narrow edit of index.html; idempotent. Does not touch market/ETF data.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / 'index.html'
MARK = 'TC_SITE_NOTICE_V1'
CSS = '''
/* TC_SITE_NOTICE_V1 */
.tc-site-notice{max-width:1500px;margin:16px auto 0;padding:0 40px;font-size:12.5px;line-height:1.8;color:#785214}
.tc-site-notice-inner{background:#fff7e8;border:1px solid #f0d9aa;border-radius:12px;padding:12px 17px}
.tc-site-notice strong{color:#794712}
.tc-site-notice details{margin-top:6px}
.tc-site-notice summary{font-weight:750;color:#6d4b23;cursor:pointer;width:fit-content}
.tc-site-notice ul{margin:6px 0 0 0;padding-left:20px}
.tc-site-notice a{color:#4a5f75;text-decoration:underline}
@media(max-width:700px){.tc-site-notice{margin:10px auto 0;padding:0 14px}.tc-site-notice-inner{padding:10px 12px}}
'''
NOTICE = '''
<!-- TC_SITE_NOTICE_V1: visible across website sections -->
<section class="tc-site-notice" role="status" aria-label="網站資料驗證狀態">
  <div class="tc-site-notice-inner">
    <strong>⚠️ 網站功能與資料仍在修正及驗證中</strong>：部分行情、ETF 持股、日期、配息或試算結果可能不完整、延遲或有誤。<strong>採用任何資料前，請先與證交所、櫃買中心及各投信等官方資料交叉核對</strong>；本網站僅供研究及試算參考，不構成投資建議。
    <details>
      <summary>查看修改說明與目前已知限制</summary>
      <ul>
        <li><strong>2026/11/15｜頁面調整：</strong>「指數型 ETF」分頁改為股價與投入報酬試算，保留配息、分割及總收益功能。</li>
        <li><strong>2026/11/15｜股票行情：</strong>上市、上櫃個股查詢及資料解析持續修正；部分證券可能因資料來源錯誤、延遲或缺漏而無法查詢。</li>
        <li><strong>2026/11/15｜ETF 持股：</strong>0050、009816 的歷史完整持股日期尚不足，不能推定未取得日期的持股變化；006208 的已有日期仍須核對實際來源。</li>
        <li><strong>已知限制：</strong>免費公開資料不一定即時；歷史資料、配息與試算方式可能與券商、投信官方揭露不一致，請自行核對。</li>
      </ul>
      <div>官方查核：<a href="https://www.twse.com.tw/" target="_blank" rel="noopener noreferrer">臺灣證交所</a> ・ <a href="https://www.tpex.org.tw/" target="_blank" rel="noopener noreferrer">櫃買中心</a> ・ <a href="https://www.yuantaetfs.com/" target="_blank" rel="noopener noreferrer">元大投信</a> ・ <a href="https://www.fubon.com/asset-management/" target="_blank" rel="noopener noreferrer">富邦投信</a> ・ <a href="https://www.kgifund.com.tw/" target="_blank" rel="noopener noreferrer">凱基投信</a></div>
    </details>
  </div>
</section>
'''

def run():
    if not FILE.is_file():
        raise RuntimeError('index.html 不存在')
    html = FILE.read_text(encoding='utf-8')
    if MARK in html:
        if html.count('<!-- TC_SITE_NOTICE_V1') == 1 and html.count('/* TC_SITE_NOTICE_V1 */') == 1:
            print('PASS: caution and changelog already installed; no duplication')
            return
        raise RuntimeError('網站警示標記不一致，停止更新')
    css_anchor = '</style>'
    main_anchor = '<main class="content" id="main"></main>'
    if html.count(css_anchor) != 1 or html.count(main_anchor) != 1:
        raise RuntimeError('HTML 結構與安全修正規則不符，停止更新')
    html = html.replace(css_anchor, CSS + '\n' + css_anchor, 1)
    html = html.replace(main_anchor, NOTICE + '\n    ' + main_anchor, 1)
    if html.count('採用任何資料前') != 1 or html.count('查看修改說明與目前已知限制') != 1:
        raise RuntimeError('修改結果驗證失敗')
    FILE.write_text(html, encoding='utf-8')
    print('PASS: site-wide visible development warning and expandable changelog added')

if __name__ == '__main__':
    try:
        run()
    except Exception as e:
        print('ERROR:', e, file=sys.stderr)
        raise SystemExit(1)
