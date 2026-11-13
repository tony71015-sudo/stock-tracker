/* Trade Compass v1.3: public TWSE/TPEx daily institutional data, with no private-data upload. */
(function () {
  'use strict';
  const BASE = 'data/institutional/';
  const PERIODS = [1, 5, 10, 20, 60];
  const RANGES = [5, 10, 20, 60];
  const state = { status:'idle', error:'', payload:null, market:'ALL', period:1, actor: 'total', side:'buy', view:'ranking', search:'', select:'', series:{}, seriesLoading:'', seriesError:'', queryPage:0, flowStatus:'idle', flowError:'', flowData:null, flowDate:'' };
  const escape = text => String(text ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = x => x==null ? '—' : Number(x).toLocaleString('zh-TW', {maximumFractionDigits:0});
  const signed = x => x==null ? '—' : (Number(x)>0?'+':'') + fmt(x);
  const signClass = x => x>0?'positive':x<0?'negative':'';
  const safeNumber = x => typeof x === 'number' && Number.isFinite(x) && Number.isInteger(x);
  const key = (market, code) => market+':'+code;
  function windowValue(row, p=state.period) { return p===1?[row[2],row[3],row[4],row[7],1]:row[8 + RANGES.indexOf(p)]; }
  const fieldIndex = () => ({foreign:0, trust:1, dealer:2, total:3})[state.actor] ?? 3;
  function forMarket() {
    if (!state.payload) return [];
    const marketData = state.payload.marketData || {};
    const result = [];
    for (const market of ['TWSE', 'TPEX']) {
      if(state.market !== 'ALL' && state.market !== market) continue;
      const box = marketData[market] || {};
      for (const record of box.entries || []) {
        result.push({market, date:box.date, code:String(record[0]), name:String(record[1]), row: record});
      }
    }
    return result;
  }
  function rowsForRanking() {
    const idx=fieldIndex();
    const entries = forMarket().filter(it => Array.isArray(windowValue(it.row)));
    entries.sort((a,b)=>state.side==='buy' ? windowValue(b.row)[idx]-windowValue(a.row)[idx] : windowValue(a.row)[idx]-windowValue(b.row)[idx]);
    return entries;
  }
  function oldEnoughData() {
    const now = new Date(); const currentDate = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
    const dates=['TWSE','TPEX'].map(m=>state.payload?.marketData?.[m]?.date).filter(Boolean);
    if (!dates.length) return false;
    const latest=dates.sort().at(-1);
    const days = (Date.parse(currentDate+'T00:00:00Z')-Date.parse(latest+'T00:00:00Z'))/864e5;
    return days > 5;
  }
  async function fetchJson(path) {
    const response = await fetch(BASE+path+'?v='+Date.now(),{cache:'no-store'});
    if(!response.ok) throw new Error(`HTTP ${response.status}：${path}`);
    return await response.json();
  }
  function validate(data) {
    if (!data || data.schema !== 1 || data.units !== 'shares' || !data.marketData) throw Error('法人資料格式不相容');
    for (const m of ['TWSE','TPEX']) {
      const b = data.marketData[m];
      if (!b || !Array.isArray(b.entries)) throw Error(m+' 欄位不完整');
      for (const r of b.entries) {
        if(!Array.isArray(r)||r.length<12||typeof r[0]!=='string'||!r.slice(2,8).every(safeNumber)) throw Error(m+' 個股資料格式錯誤');
        if (r[2]+r[3]+r[4]!==r[7] || r[5]+r[6]!==r[4]) throw Error(m+' 三大法人合計驗證失敗');
        for (let i=8;i<12;i++) if(r[i]!==null && (!Array.isArray(r[i]) || r[i].length!==5 || !r[i].slice(0,5).every(safeNumber))) throw Error('累積資料格式錯誤');
      }
    }
  }
  function validateFlow(data) {
    if(!data || data.schema!==1 || data.market!=='TWSE' || data.unit!=='TWD' || !Array.isArray(data.records)) throw Error('大盤法人金額資料格式不相容');
    for(const row of data.records){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date||'')))throw Error('大盤法人日期格式錯誤');
      const a=row.actors||{};
      for(const name of ['foreign','trust','dealer','dealerOwn','dealerHedge','total']){
        const t=a[name];if(!t || !['buy','sell','net'].every(k=>Number.isSafeInteger(t[k])) || t.buy<0 || t.sell<0 || t.net!==t.buy-t.sell) throw Error('大盤法人金額檢查失敗');
      }
      for(const kind of ['buy','sell','net']){
        if(a.dealer[kind]!==a.dealerOwn[kind]+a.dealerHedge[kind] || a.total[kind]!==a.foreign[kind]+a.trust[kind]+a.dealer[kind]) throw Error('大盤法人分類加總不一致');
      }
    }
  }
  async function loadFlow(force=false){
    if(!force && state.flowStatus!=='idle')return;
    state.flowStatus='loading';state.flowError='';
    try{const data=await fetchJson('market-flow.json');validateFlow(data);state.flowData=data;state.flowStatus='ready';}
    catch(err){state.flowStatus='error';state.flowError=String(err.message||err);}
    redraw();
  }
  const formatBillion = value => value==null?'—':(value/1e8).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
  const signedBillion = v => v==null?'—':(v>0?'+':'')+formatBillion(v);
  function marketFlows(){
    if(state.flowStatus==='idle')loadFlow();
    let html=`<section class="panel inst-flow-section"><div class="panel-head"><div><h2 class="panel-title">上市大盤・三大法人每日買賣超</h2><p class="panel-sub">證交所 BFI82U 官方彙總・單位：億元（新臺幣）・不是個股買賣超股數</p></div>`;
    if(state.flowStatus!=='ready'){
      html+=`</div><div class="inst-flow-message">${state.flowStatus==='error'?'尚無法讀取大盤法人資料：'+escape(state.flowError)+'。請確認 Actions 已發布 market-flow.json。':'正在讀取官方大盤法人買賣金額…'}</div></section>`;
      return html;
    }
    const rows=[...(state.flowData.records||[])].sort((a,b)=>b.date.localeCompare(a.date));
    if(!rows.length)return html+`</div><div class="inst-flow-message">尚未建立大盤法人金額資料。請在 GitHub Actions 重新執行 bootstrap，完成後重新讀取。</div></section>`;
    const selected=rows.find(r=>r.date===state.flowDate)||rows[0];
    const a=selected.actors;
    html+=`<div class="inst-inline"><label for="instFlowDate" class="small muted">查看日期</label><select id="instFlowDate" class="field" aria-label="大盤法人交易日期">${rows.map(r=>`<option value="${escape(r.date)}" ${selected.date===r.date?'selected':''}>${escape(r.date.replace(/-/g,'/'))}</option>`).join('')}</select></div></div>`;
    html+=`<div class="inst-flow-cards">${[['foreign','外資及陸資'],['trust','投信'],['dealer','自營商'],['total','三大法人合計']].map(([k,label])=>`<div class="inst-flow-card"><div class="k">${label}</div><div class="v ${signClass(a[k].net)}">${signedBillion(a[k].net)} <span>億元</span></div><div class="h">${a[k].net>=0?'淨買超':'淨賣超'}</div></div>`).join('')}</div>`;
    html+=`<div class="table-wrap"><table class="data-table inst-flow-table"><thead><tr><th>法人分類</th><th class="num">買進（億元）</th><th class="num">賣出（億元）</th><th class="num">買賣超（億元）</th></tr></thead><tbody>${[['foreign','外資及陸資'],['trust','投信'],['dealerOwn','自營商（自行買賣）'],['dealerHedge','自營商（避險）'],['dealer','自營商合計'],['total','三大法人總計']].map(([k,label])=>`<tr><td><b>${label}</b></td><td class="num">${formatBillion(a[k].buy)}</td><td class="num">${formatBillion(a[k].sell)}</td><td class="num strong ${signClass(a[k].net)}">${signedBillion(a[k].net)}</td></tr>`).join('')}</tbody></table></div>`;
    html+=`<p class="inst-note" style="padding:0 22px 18px">資料日期：${escape(selected.date)}；最近可選 ${rows.length} 個已驗證交易日。此資料為上市集中市場之交易金額，<b>不包含上櫃市場</b>，且與下方個股法人買賣超（股）口徑不同。外資自營商不重複加總。<a href="https://www.twse.com.tw/zh/trading/foreign/bfi82u.html" target="_blank" rel="noopener noreferrer">證交所原始資料</a>。</p>`;
    if(state.flowData.lastRunErrors?.length) html+=`<div class="inst-flow-message">最近更新有 ${state.flowData.lastRunErrors.length} 個日期抓取失敗；已取得的交易日仍可查詢，缺漏日期不會補成零。</div>`;
    return html+'</section>';
  }
  async function loadLatest(force=false) {
    if (!force && (state.status==='loading' || state.status==='ready')) return;
    state.status='loading'; state.error='';
    try {
      const data = await fetchJson('latest.json');
      validate(data);
      state.payload = data; state.status='ready';
    } catch(err) {state.status='error';state.error=String(err.message||err);}
    redraw();
  }
  async function loadSeries(market) {
    if (state.series[market] || state.seriesLoading===market) return;
    state.seriesLoading=market; state.seriesError='';
    redraw();
    try {
      const payload=await fetchJson('history-'+market.toLowerCase()+'.json');
      if (!payload || payload.market!==market || !Array.isArray(payload.dates) || typeof payload.series!=='object') throw Error('歷史資料格式不相容');
      state.series[market]=payload;
    } catch(err) {state.seriesError=String(err.message||err);}
    state.seriesLoading='';redraw();
  }
  function redraw(){if(window.TradeCompassBridge?.isActive?.())window.TradeCompassBridge.render();}
  const unit = x=>`<span class="${signClass(x)}">${signed(x)} <span class="muted">股</span></span>`;
  const mini = x=>`<span class="${signClass(x)}">${signed(x)}</span>`;
  function header(){
    let title=`<div class="head"><div><div class="eyebrow">OFFICIAL INSTITUTIONAL FLOWS</div><h1>三大法人籌碼查詢</h1><p class="subtitle">上市／上櫃官方日報・外資、投信、自營商・5／10／20／60 交易日累積買賣超</p></div><div class="actions"><button class="btn" data-inst-refresh>↻ 重新讀取已發布資料</button></div></div>`;
    if (state.status!=='ready')return title;
    const d=state.payload.marketData;
    const a=d.TWSE||{},b=d.TPEX||{};
    title+=`<div class="inst-grid">
      <section class="panel inst-card"><div class="k">上市資料日期</div><div class="v">${escape(a.date||'尚無資料')}</div><div class="h">${fmt(a.entries?.length||0)} 檔・${fmt(a.sessions||0)} 個交易日</div></section>
      <section class="panel inst-card"><div class="k">上櫃資料日期</div><div class="v">${escape(b.date||'尚無資料')}</div><div class="h">${fmt(b.entries?.length||0)} 檔・${fmt(b.sessions||0)} 個交易日</div></section>
      <section class="panel inst-card"><div class="k">可用歷史視窗</div><div class="v">${Math.min(60, Math.min(a.sessions||0,b.sessions||0))} <span class="small">交易日</span></div><div class="h">滿 60 日才能顯示完整 60 日累計</div></section>
      <section class="panel inst-card"><div class="k">資料發布時間</div><div class="v" style="font-size:14px">${state.payload.generatedAt?escape(new Date(state.payload.generatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})):'尚未更新'}</div><div class="h">GitHub Actions 更新完成時間（臺灣）</div></section>
    </div>`;
    const empty = !a.entries?.length && !b.entries?.length;
    if(empty)title+=`<div class="inst-banner inst-alert"><b>尚未建立官方行情快照。</b> 請先在 GitHub 專案的 Actions →「更新三大法人官方資料」→ Run workflow，選 bootstrap。完成並發布後重新讀取此頁。</div>`;
    if(oldEnoughData())title+=`<div class="inst-banner inst-alert"><b>資料可能已過期。</b> 目前最新法人資料距今超過 5 個日曆日；請先檢查 GitHub Actions 是否正常執行。假日、休市日與官方延後公布也會影響日期。</div>`;
    const failures=state.payload.lastRunErrors||[];
    if(failures.length)title+=`<div class="inst-banner inst-alert"><b>最近抓取有 ${failures.length} 項失敗：</b>部分日期可能缺漏，請檢查 GitHub Actions 執行紀錄並重新執行 bootstrap。未驗證資料不會顯示成已確認行情。</div>`;
    if(a.date && b.date && a.date!==b.date)title+=`<div class="inst-banner inst-alert">上市與上櫃目前資料日期不同，跨市場合併排行榜包含不同日期，請注意各檔的「資料日」。</div>`;
    title+=`<div class="inst-banner"><b>單位為股（不是張）。</b> 外資採不含外資自營商口徑；自營商＝自行買賣＋避險；三大法人合計＝外資＋投信＋自營商。這是交易流量，不是累積持股比例，也不代表 ETF 經理人調整成分股。</div>`;
    return title;
  }
  function filters(){
    const opts = (items,selected) => items.map(([value,label])=>`<option value="${escape(value)}" ${String(selected)===String(value)?'selected':''}>${escape(label)}</option>`).join('');
    return `<div class="inst-tablist">${[['ranking','買賣超排行榜'],['search','個股查詢'],['holdings','我的持股法人追蹤']].map(([v,label])=>`<button class="inst-tab ${state.view===v?'active':''}" data-inst-view="${v}">${label}</button>`).join('')}</div>
      <div class="panel toolbar inst-filters">
       <div class="control"><label for="instMarket">市場</label><select class="field" id="instMarket">${opts([['ALL','上市＋上櫃'],['TWSE','上市'],['TPEX','上櫃']],state.market)}</select></div>
       <div class="control"><label for="instPeriod">累積日數</label><select class="field" id="instPeriod">${opts(PERIODS.map(n=>[n,n===1?'當日買賣超':`${n} 交易日`]),state.period)}</select></div>
       <div class="control"><label for="instActor">法人別</label><select class="field" id="instActor">${opts([['total','三大法人合計'],['foreign','外資'],['trust','投信'],['dealer','自營商']],state.actor)}</select></div>
       <div class="control"><label for="instSide">排行方向</label><select class="field" id="instSide">${opts([['buy','買超最多'],['sell','賣超最多']],state.side)}</select></div>
      </div>`;
  }
  function showTable(data, showPeriods=false){
    if(!data.length)return `<div class="no-data"><strong>沒有符合條件的資料</strong><p>可能是資料尚未初始化、日期不足，或目前市場沒有符合標的。</p></div>`;
    let html=`<div class="table-wrap"><table class="data-table inst-table"><thead><tr><th>市場／資料日</th><th>股票</th><th class="num">外資</th><th class="num">投信</th><th class="num">自營商</th><th class="num">${state.period} 日合計</th>${showPeriods?'<th>涵蓋交易日</th>':''}<th>詳情</th></tr></thead><tbody>`;
    for(const x of data){
      const w=windowValue(x.row), idx=fieldIndex();
      html+=`<tr><td><b>${x.market==='TWSE'?'上市':'上櫃'}</b><div class="stock-code">${escape(x.date||'—')}</div></td>
      <td><div class="stock-name">${escape(x.name)}</div><div class="stock-code">${escape(x.code)}</div></td>
      <td class="num vnum ${signClass(w?.[0])}">${mini(w?.[0])}</td><td class="num vnum ${signClass(w?.[1])}">${mini(w?.[1])}</td><td class="num vnum ${signClass(w?.[2])}">${mini(w?.[2])}</td><td class="num vnum ${signClass(w?.[3])}">${mini(w?.[3])}</td>
      ${showPeriods?`<td><span class="tag ${w?.[4]===state.period?'mint':'gold'}">${w?.[4]??0}/${state.period} 日</span></td>`:''}<td><button class="btn sm" data-inst-detail="${escape(key(x.market,x.code))}">查詢 →</button></td></tr>`;
    }
    return html+`</tbody></table></div>`;
  }
  function ranking(){
    const a=rowsForRanking().slice(0,30);
    const c=state.payload.marketData;
    return `<section class="panel inst-sect"><div class="panel-head"><div><h2 class="panel-title">${state.side==='buy'?'買超':'賣超'}前 30 名</h2><p class="panel-sub">按指定法人之 ${state.period} 交易日累積買賣超排序；下表各法人欄為同一時段累積股數。</p></div></div>${showTable(a,true)}</section>`;
  }
  function searchPage(){
    const terms=state.search.trim().toLowerCase();
    const all=forMarket();
    const matching=terms ? all.filter(it=>it.code.toLowerCase().includes(terms)||it.name.toLowerCase().includes(terms)) : [];
    return `<section class="panel inst-sect"><div class="toolbar"><input id="instSearch" class="field inst-search" placeholder="輸入股票代號或名稱，例如 2330、0050、台積電" value="${escape(state.search)}" /><button class="btn primary" data-inst-search>查詢</button><span class="small muted">${terms?`找到 ${matching.length} 檔，最多顯示前 50 檔`:'輸入股票代號或名稱查詢'}</span></div>${terms?showTable(matching.slice(0,50),true):`<div class="no-data"><strong>搜尋上市與上櫃個股</strong><p>可以輸入完整代號、部分代號或股票名稱。僅查詢官方資料已收錄的證券。</p></div>`}</section>`;
  }
  function holdingPage(){
    const holdings=window.TradeCompassBridge?.getHoldings?.()||[];
    if(!holdings.length)return `<section class="panel inst-sect"><div class="no-data"><strong>目前沒有持股紀錄</strong><p>請先到「交易紀錄」新增股票買進資料。這裡只在瀏覽器本機對照股票代號，不會上傳你的股數與成本。</p></div></section>`;
    let rows='';
    const found=forMarket();
    for(const p of holdings){
      const matching=found.filter(it=>it.code===String(p.symbol));
      const records=matching.length?matching:[null];
      for(const stock of records){
        const w=stock?windowValue(stock.row):null;
        rows+=`<tr><td><div class="stock-name">${escape(p.symbol)}</div><div class="stock-code">${escape(p.name||'')}</div></td>
        <td class="num">${fmt(p.shares)}</td><td class="num">${fmt(p.cost)}</td><td class="num ${signClass(p.pnl)}">${p.pnl==null?'—':signed(Math.round(p.pnl))}</td>
        <td>${stock?(stock.market==='TWSE'?'上市':'上櫃'):'未查得'}</td><td class="num ${signClass(w?.[3])}">${mini(w?.[3])}</td>
        <td>${w?`<span class="tag ${w[4]===state.period?'mint':'gold'}">${w[4]}/${state.period} 日</span>`:'—'}</td>
        <td>${stock?`<button class="btn sm" data-inst-detail="${escape(key(stock.market,stock.code))}">法人分析 →</button>`:'<span class="small muted">無相符官方資料</span>'}</td></tr>`;
      }
    }
    return `<section class="panel inst-sect"><div class="panel-head"><div><h2 class="panel-title">我的持股 × 三大法人</h2><p class="panel-sub">持股／成本為本機資料；法人買賣超為公開市場資料。沒有法人資料不代表該檔買賣超為零。</p></div></div><div class="table-wrap"><table class="data-table inst-table"><thead><tr><th>我的股票</th><th class="num">持有股數</th><th class="num">總成本</th><th class="num">未實現損益</th><th>市場</th><th class="num">${state.period}日法人合計（股）</th><th>有效日數</th><th>明細</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  function seriesGraph(market, stockCode){
    const h=state.series[market];
    if(!h) return `<div class="inst-loading">${state.seriesLoading===market?'正在讀取歷史趨勢資料…':'無法載入歷史資料，請檢查 GitHub Actions 是否已發布。'} ${state.seriesError?escape(state.seriesError):''}</div>`;
    const values=(h.series?.[stockCode]||[]).filter(r=>r.length>=4 && r.every(safeNumber)).slice(-60);
    if(!values.length)return `<div class="no-data">此標的沒有歷史法人紀錄。</div>`;
    let acc=[0,0,0];
    const points=values.map(v=>{
      for(let j=0;j<3;j++)acc[j]+=v[j+1];
      return [...acc];
    });
    const all=points.flat();const low=Math.min(0,...all),high=Math.max(0,...all),range=Math.max(1,high-low);
    const width=800,ht=210,pad=30;
    const y=v=>(pad+(high-v)/range*(ht-2*pad)).toFixed(2);
    const x=i=>(pad+i/Math.max(1,points.length-1)*(width-2*pad)).toFixed(2);
    const colors=['#0c9b91','#3778e7','#e6a848'];
    const paths=[0,1,2].map(j=>`<polyline fill="none" stroke="${colors[j]}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" points="${points.map((p,i)=>x(i)+','+y(p[j])).join(' ')}" />`).join('');
    return `<svg class="inst-graph" viewBox="0 0 ${width} ${ht}" preserveAspectRatio="none" role="img" aria-label="區間累積外資、投信、自營商買賣超股數走勢">
      <line x1="${pad}" y1="${y(0)}" x2="${width-pad}" y2="${y(0)}" stroke="#c7d5e0" stroke-dasharray="5 4"/>
      <text x="6" y="${pad+3}" font-size="12" fill="#72889b">${escape(fmt(high))}</text><text x="6" y="${ht-pad}" font-size="12" fill="#72889b">${escape(fmt(low))}</text>${paths}
      <text x="${pad}" y="${ht-7}" font-size="12" fill="#72889b">${escape(h.dates?.[values[0][0]]||'')}</text><text x="${width-pad-85}" y="${ht-7}" font-size="12" fill="#72889b">${escape(h.dates?.[values.at(-1)[0]]||'')}</text></svg>
      <div class="inst-legend"><span><i style="background:${colors[0]}"></i>外資</span><span><i style="background:${colors[1]}"></i>投信</span><span><i style="background:${colors[2]}"></i>自營商</span></div>
      <p class="inst-note">折線圖是本次展示區間內的逐日淨買賣超累積值，起點設定為零，不是法人實際持股餘額；圖表僅使用網站已保存的官方交易日資料。</p>`;
  }
  function detail(){
    if(!state.select)return '';
    const [market,code]=state.select.split(':');
    if (!['TWSE','TPEX'].includes(market))return '';
    const x=(state.payload.marketData[market].entries||[]).find(r=>r[0]===code);
    if(!x)return `<div class="inst-banner inst-alert">目前官方最新日報沒有 ${escape(code)} 的交易資料。</div>`;
    let s=`<section class="panel inst-detail inst-sect"><div class="inst-inline" style="justify-content:space-between"><div><h2>${escape(x[1])} <span class="inst-code">${escape(code)}</span> <span class="inst-code">${market==='TWSE'?'上市':'上櫃'}</span></h2><p>資料日：${escape(state.payload.marketData[market].date||'—')}・數值單位：股・每日公開交易紀錄</p></div><button class="btn sm" data-inst-close>關閉明細 ×</button></div><div class="inst-window-summary">`;
    for (let i=0;i<RANGES.length;i++){
      const w=x[8+i];
      s+=`<div><small>${RANGES[i]} 日累積三大法人</small><b class="${signClass(w?.[3])}">${w?signed(w[3]):'資料不足'}</b><div class="fine">${w?`${w[4]}/${RANGES[i]} 日有個股紀錄`:'有效交易日不足'}</div></div>`;
    }
    s+=`</div><div class="vline"></div><h2>最多近 60 筆交易日累積買賣超走勢</h2>${seriesGraph(market,code)}</section>`;
    return s;
  }
  function html(){
    if(state.status==='idle') loadLatest();
    if(state.flowStatus==='idle')loadFlow();
    let out=header();
    if(state.status==='loading') return out+`<section class="panel inst-loading">正在讀取已公開的三大法人快照…</section>`;
    if(state.status==='error') return out+`<div class="inst-banner inst-error">讀取官方資料快照失敗：${escape(state.error)}。請確認最新 JSON 已透過 GitHub Pages 發布；也可點「重新讀取」。</div>`;
    if(state.status!=='ready')return out;
    out+=marketFlows();
    out+=filters();
    if(state.view==='ranking')out+=ranking();
    if(state.view==='search')out+=searchPage();
    if(state.view==='holdings')out+=holdingPage();
    out+=detail();
    out+=`<section class="panel inst-sect" style="padding:20px 23px"><h2 class="panel-title">資料口徑與更新說明</h2><p class="inst-note">① 排行的預設單位為股，不能直接等同張數；部分 ETF 的交易單位並非一般 1,000 股。② 5/10/20/60 日是抓取到的有效官方市場交易日，資料缺漏會影響統計；只列出最近已確認資料。③ 股票分割、ETF 初上市、特殊市場制度、休市等可能影響可比較性。④ 法人買賣超不是報價，網站不會因此更動你的買進成本、移動停損或參考價格。⑤ 若資料顯示不足，請使用 GitHub Actions 的 bootstrap 補齊。</p>
      <div class="inst-sources"><a target="_blank" rel="noopener noreferrer" href="https://www.twse.com.tw/zh/trading/foreign/t86.html">官方來源：證交所 T86</a><a target="_blank" rel="noopener noreferrer" href="https://www.tpex.org.tw/zh-tw/mainboard/trading/major-institutional/detail/day.html">官方來源：櫃買中心</a><a target="_blank" rel="noopener noreferrer" href="https://github.com/tony71015-sudo/stock-tracker/actions">檢查 GitHub Actions 更新狀態</a></div></section>`;
    return out;
  }
  function selectCode(symbol){
    state.view='holdings'; state.search=String(symbol||'').trim().toUpperCase();
    if(state.payload){
      const match=['TWSE','TPEX'].flatMap(m=>(state.payload.marketData[m]?.entries||[]).filter(x=>x[0]===state.search).map(x=>key(m,x[0])));
      if(match.length===1) select(match[0]);
    }
  }
  function select(ref){
    const match=/^(TWSE|TPEX):([A-Z0-9]{4,8})$/.exec(ref);
    if(!match)return;
    state.select=ref; state.view=state.view==='ranking'?'ranking':state.view;
    loadSeries(match[1]);
    redraw();
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-inst-refresh],[data-inst-view],[data-inst-search],[data-inst-detail],[data-inst-close]');
    if(!b)return;
    if(b.hasAttribute('data-inst-refresh')) {state.series={}; loadLatest(true);loadFlow(true);}
    if(b.dataset.instView) {state.view=b.dataset.instView; state.select=''; redraw();}
    if(b.hasAttribute('data-inst-search')) {state.search=document.getElementById('instSearch')?.value.trim()||''; state.view='search'; state.select='';redraw();}
    if(b.dataset.instDetail) select(b.dataset.instDetail);
    if(b.hasAttribute('data-inst-close')) {state.select='';redraw();}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Enter' && event.target?.id==='instSearch') {event.preventDefault(); state.search=event.target.value.trim();state.select='';redraw();}
  });
  document.addEventListener('change',event=>{
    const v=event.target?.value;
    if(event.target?.id==='instFlowDate'){state.flowDate=v;redraw();return;}
    if(event.target?.id==='instMarket')state.market=v;
    else if(event.target?.id==='instPeriod')state.period=Number(v);
    else if(event.target?.id==='instActor')state.actor=v;
    else if(event.target?.id==='instSide')state.side=v;
    else return;
    state.select=''; redraw();
  });
  window.TradeCompassInstitutional = {html,selectCode,loadLatest,_test:{validate, windowValue, forMarket, rowsForRanking, state}};
})();
