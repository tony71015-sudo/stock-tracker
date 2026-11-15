/* Trade Compass v1.7.1: index ETF page presentation only.
 * No modification to institutional.js, historical institutional data or pipelines.
 * Institutional figures are market trading in component stocks, NOT ETF manager trades.
 */
(function () {
  'use strict';
  if (window.__TC_INDEX_FOCUS_INSTALLED__) return;
  window.__TC_INDEX_FOCUS_INSTALLED__ = true;
  const funds = ['0050', '006208', '009816'];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = n => Number(n).toLocaleString('zh-TW', {maximumFractionDigits: 1});
  const state = () => window.TradeCompassIndexETF?._test?.state;
  let availability = null;
  let availabilityNote = '資料完整度報告尚未發布（不代表資料為零）';
  async function loadAvailability() {
    try {
      const r = await fetch('data/index-etf/availability.json?ts=' + Date.now(), {cache:'no-store'});
      if (!r.ok) throw Error('HTTP ' + r.status);
      const data = await r.json();
      if (data?.schema !== 1 || !data.funds) throw Error('狀態格式不符');
      availability = data;
      availabilityNote = '';
    } catch (err) { availabilityNote = '資料完整度報告目前不可用：' + err.message; }
    if (window.TradeCompassBridge?.isPage?.('indexETF')) window.TradeCompassBridge.render();
  }
  function coverageHtml() {
    const s = state();
    const fund = s?.fund || '0050';
    const record = availability?.funds?.[fund];
    if (!record) return '<p class="fine">' + esc(availabilityNote) + '</p>';
    const label = ({comparable:'至少兩個經驗證持股日期',single_day:'只有單日有效持股',unavailable:'暫無兩份有效完整持股'})[record.portfolioStatus] || '待核對';
    const stamp = availability?.updatedAt || '未知';
    return '<p class="fine">持股來源檢查：' + esc(label) + '；有效日期 ' + esc(record.verifiedPortfolioCount) + ' 筆；最新 ' + esc(record.portfolioLatest || '無') + '；檢查時間 ' + esc(stamp) + '。</p>';
  }
  function holdingsFor(s) {
    if (!s || !funds.includes(s.fund)) return null;
    const d = s.date;
    return s.local?.snapshots?.[s.fund]?.[d] || s.remote?.[s.fund + ':' + d] || null;
  }
  function summaryHtml() {
    const s = state();
    const snap = holdingsFor(s);
    const inst = s?.inst;
    let inner = '<p class="subtitle">先選擇 ETF 並載入已驗證的完整持股，才會統計這些成分股的法人交易。法人交易不代表 ETF 自身調倉。</p>';
    if (snap?.holdings?.length && inst?.marketData) {
      const look = new Map();
      for (const market of ['TWSE', 'TPEX']) {
        for (const r of inst.marketData?.[market]?.entries || []) {
          if (Array.isArray(r) && r.length >= 11) look.set(String(r[0]).trim(), r);
        }
      }
      const results = [];
      for (const [days, ix] of [[5,8],[20,10]]) {
        const sums = [0,0,0]; let covered = 0;
        for (const h of snap.holdings) {
          const row = look.get(String(h.code).trim());
          const flows = row?.[ix];
          if (!Array.isArray(flows) || flows.length < 3 || !flows.slice(0,3).every(Number.isFinite)) continue;
          sums.forEach((_, i) => { sums[i] += flows[i]; }); covered++;
        }
        results.push({days, sums, covered});
      }
      const date = ['TWSE','TPEX'].map(m => inst.marketData[m]?.date).filter(Boolean).join('／');
      inner = '<p class="subtitle">統計範圍：查詢日 ETF 成分股（非 ETF 基金交易）；法人截至 ' + esc(date || '未確認') + '；單位：張（1 張＝1,000 股）。</p>';
      inner += '<div class="table-wrap"><table class="data-table"><thead><tr><th>交易期間</th><th class="num">外資淨買賣</th><th class="num">投信淨買賣</th><th class="num">自營商淨買賣</th><th class="num">具資料成分股</th></tr></thead><tbody>';
      for (const r of results) {
        inner += '<tr><td>近 ' + r.days + ' 個交易日</td>' + r.sums.map(n => '<td class="num">' + (r.covered ? esc(fmt(n / 1000)) : '—') + '</td>').join('') + '<td class="num">' + r.covered + '／' + snap.holdings.length + '</td></tr>';
      }
      inner += '</tbody></table></div>';
      if (results.some(r => r.covered < snap.holdings.length)) inner += '<p class="fine">提醒：部分成分股缺少同一統計期間的法人資料，合計只涵蓋上表所列股數，不能當成完整 ETF 成分股法人總額。</p>';
    } else if (s?.instError) {
      inner += '<p class="fine">既有三大法人資料暫時無法取得：' + esc(s.instError) + '</p>';
    }
    return '<section class="panel tc-index-flow-summary" style="padding:20px 23px;margin-top:16px"><h2 class="panel-title">成分股法人摘要（5／20 日）</h2>' + coverageHtml() + inner + '<div class="filter-row" style="margin-top:10px"><button type="button" class="btn" id="tcOpenInstitutional">查看完整三大法人籌碼查詢</button></div></section>';
  }
  function transform(markup) {
    const template = document.createElement('template');
    template.innerHTML = markup;
    const root = template.content;
    const heading = root.querySelector('.head h1');
    if (heading) heading.textContent = '指數型 ETF 投資分析';
    const subtitle = root.querySelector('.head .subtitle');
    if (subtitle) subtitle.textContent = '比較 ETF 成分股實際持股與權重、歷史價格及投資收益；法人交易摘要僅供補充參考，詳細籌碼請使用原三大法人頁面。';
    for (const id of ['indexActor','indexPeriod']) {
      const select = root.querySelector('#' + id);
      if (select) {
        const label = select.previousElementSibling;
        if (label?.tagName === 'LABEL') label.remove();
        select.remove();
      }
    }
    // Keep holdings comparisons, remove only duplicated institutional columns.
    for (const section of root.querySelectorAll('section.panel')) {
      const title = section.querySelector('.panel-title');
      if (!title?.textContent?.includes('持股變化與')) continue;
      title.textContent = 'ETF 成分股持股變化';
      const sub = section.querySelector('.panel-sub');
      if (sub) sub.textContent = sub.textContent.split('；法人')[0];
      const table = section.querySelector('table');
      if (table) {
        for (const tr of table.querySelectorAll('tr')) {
          const cells = tr.querySelectorAll('th,td');
          if (cells.length === 7) cells[6].remove();
        }
      }
    }
    root.querySelectorAll('.note-box').forEach(box => {
      if (box.textContent?.includes('法人買賣超')) box.textContent = 'ETF 持股股數變化不一定代表經理人交易；僅接受經來源驗證的實際持股快照，PCF 申購贖回籃子不能冒充完整持股。';
    });
    const wrapper = document.createElement('div');
    wrapper.appendChild(root.cloneNode(true));
    const section = wrapper.querySelector('section.panel');
    if (section) section.insertAdjacentHTML('afterend', summaryHtml());
    else wrapper.insertAdjacentHTML('beforeend', summaryHtml());
    return wrapper.innerHTML;
  }
  function attach() {
    const module = window.TradeCompassIndexETF;
    if (!module || typeof module.html !== 'function') return false;
    if (module.html.__tcIndexFocus) return true;
    const oldHtml = module.html;
    const next = function () { return transform(oldHtml.apply(module, arguments)); };
    next.__tcIndexFocus = true;
    module.html = next;
    const nav = document.querySelector('[data-page="indexETF"]');
    if (nav) {
      for (const node of nav.childNodes) if (node.nodeType === 3 && node.textContent.trim()) node.textContent = ' 指數型 ETF 投資分析';
    }
    document.addEventListener('click', e => {
      if (e.target?.closest?.('#tcOpenInstitutional')) document.querySelector('[data-page="institutions"]')?.click();
    });
    window.TradeCompassBridge?.render?.();
    loadAvailability();
    return true;
  }
  if (!attach()) {
    let attempts = 0;
    const id = setInterval(() => { if (attach() || ++attempts >= 40) clearInterval(id); }, 250);
  }
})();
