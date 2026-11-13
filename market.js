/* Trade Compass v1.4. Public official after-close OHLCV + optional verified daytrade and institution report. */
(function(){'use strict';
const state={status:'idle',market:null,inst:null,error:'',code:'2330',term:'',scope:'ALL',show:'search'};
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=(x,d=0)=>x==null?'—':Number(x).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
const note=(date)=>date?esc(date):'尚無資料';
const safeNum=x=>x==null?'—':(Number(x)>0?'+':'')+fmt(x);
const S={twse:'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',tpex:'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes'};
function refresh(){if(window.TradeCompassBridge?.isPage?.('stockSearch')||window.TradeCompassBridge?.isPage?.('activeETF'))window.TradeCompassBridge.render();}
async function getJson(file){const r=await fetch(file+'?cache='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(`${file}: HTTP ${r.status}`);return r.json();}
function validate(m){if(!m||m.schema!==1||!Array.isArray(m.items))throw Error('盤後行情資料結構不相容');for(const x of m.items){if(!x.code||!['TWSE','TPEX'].includes(x.market)||typeof x.close!=='number'||!x.date)throw Error('盤後行情資料格式錯誤');}}
async function load(force=false){if(!force&&state.status!=='idle')return;
 state.status='loading';state.error='';refresh();
 try{const [m,i]=await Promise.allSettled([getJson('data/market/latest.json'),getJson('data/institutional/latest.json')]);
  if(m.status==='rejected')throw m.reason;validate(m.value);state.market=m.value;
  if(i.status==='fulfilled'&&i.value?.schema===1)state.inst=i.value;
  state.status='ready';}
 catch(e){state.status='error';state.error=String(e.message||e);}
 refresh();}
function listings(){return state.market?.items||[];}
function find(code){const exact=listings().filter(x=>x.code===String(code||'').trim().toUpperCase());return exact[0]||null;}
function instItem(row){if(!row||!state.inst?.marketData)return null;
 const market=state.inst.marketData[row.market];if(!market)return null;
 const found=market.entries?.find(x=>x[0]===row.code);if(!found)return null;
 return {date:market.date,foreign:found[2],trust:found[3],dealer:found[4],total:found[7]};}
function quoteOverview(q){const it=instItem(q),rate=q?.volumeShares&&q.daytradeShares!=null?q.daytradeShares/q.volumeShares*100:null;
 return `<div class="tc-statgrid">${[['開盤價',fmt(q.open,2)],['最高價',fmt(q.high,2)],['最低價',fmt(q.low,2)],['收盤價',fmt(q.close,2)]].map(([label,value])=>`<div class="panel tc-stat"><small>${label}</small><b>${value}</b></div>`).join('')}</div>
 <section class="panel tc-pad"><div class="tc-section-head"><h2 class="panel-title">每日行情與當沖</h2><span class="tc-badge">${q.market==='TWSE'?'上市':'上櫃'}｜${note(q.date)}（盤後）</span></div>
 <div class="table-wrap"><table class="data-table"><thead><tr><th>成交股數</th><th>成交張數（換算）</th><th>成交金額</th><th>當沖成交股數</th><th>當沖量占比</th></tr></thead><tbody><tr><td>${fmt(q.volumeShares)} 股</td><td>${fmt(q.volumeShares/1000,2)} 張</td><td>${fmt(q.tradeValue)} 元</td><td>${fmt(q.daytradeShares)} ${q.daytradeShares==null?'':'股'}</td><td>${rate==null?'—':fmt(rate,2)+'%'}</td></tr></tbody></table></div>
 <p class="tc-note">當沖成交股數為官方報表口徑，與一般成交量的占比僅供參考。如果官方資料欄位無法驗證，顯示「—」，不會使用推算值冒充官方紀錄。</p></section>
 <section class="panel tc-pad"><h2 class="panel-title">三大法人買賣超</h2><p class="panel-sub">法人資料日期：${note(it?.date)}；單位為股。${it&&it.date!==q.date?' ⚠ 法人與行情的日期不同，不可視為同日訊號。':''}</p>
 <div class="table-wrap"><table class="data-table"><thead><tr><th>外資</th><th>投信</th><th>自營商（含避險）</th><th>法人合計</th></tr></thead><tbody><tr>${[it?.foreign,it?.trust,it?.dealer,it?.total].map(x=>`<td class="${x>0?'positive':x<0?'negative':''}">${safeNum(x)}</td>`).join('')}</tr></tbody></table></div><p class="tc-note">詳細 5／10／20／60 日趨勢可至「三大法人籌碼」查詢。與持股參考價、未實現損益不同步更新。</p></section>`;
}
function html(){if(state.status==='idle')queueMicrotask(()=>load());
 const q=find(state.code);let content=`<div class="head"><div><div class="eyebrow">OFFICIAL AFTER-HOURS MARKET</div><h1>股票行情與籌碼查詢</h1><p class="subtitle">上市／上櫃・開高低收・成交量・當沖・三大法人買賣超（非即時報價）</p></div><div class="actions"><button class="btn" data-market-refresh>↻ 讀取已發布資料</button></div></div>`;
 content+=`<div class="notice-banner"><b>行情不等於即時報價。</b> 本頁從 GitHub Pages 公開快照讀取官方盤後資料，可能延遲。上市／上櫃各自保留資料日期；股價不會自動寫入你的個人持股成本或停損線。</div>`;
 content+=`<section class="panel tc-pad"><div class="tc-searchbar"><label for="marketCode">股票代號</label><input class="field" id="marketCode" placeholder="例如 2330、0050、00981A" value="${esc(state.code)}"><button class="btn primary" data-market-find>查詢股票</button><button class="btn" data-market-holdings>我的持股</button></div><div class="tc-flex" style="margin-top:14px">${Object.entries(state.market?.markets||{}).map(([m,x])=>`<span class="tc-badge">${m==='TWSE'?'上市':'上櫃'}：${note(x.date)}｜${fmt(x.count)} 檔</span>`).join('')}<span class="fine">更新：${state.market?.generatedAt?new Date(state.market.generatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'尚未更新'}</span></div></section>`;
 if(state.status==='loading')return content+`<section class="panel tc-pad">讀取公開資料中…</section>`;
 if(state.status==='error')return content+`<section class="panel tc-pad tc-empty">無法讀取行情：${esc(state.error)}。請檢查 Pages 是否完整部署 data/market/latest.json。</section>`;
 if(!listings().length)return content+`<section class="panel tc-pad tc-empty"><b>官方行情尚未初始化。</b> 請在 GitHub Actions 執行「更新三大法人並發布網站」工作流程。本站不會塞入虛構股價。</section>`;
 if(state.market.warnings?.length)content+=`<div class="tc-empty" style="margin-bottom:15px">⚠ ${state.market.warnings.slice(0,3).map(esc).join('；')}</div>`;
 if(!q){const k=state.code.toLowerCase();const options=listings().filter(x=>x.code.toLowerCase().includes(k)||x.name.toLowerCase().includes(k)).slice(0,15);
   content+=`<section class="panel tc-pad"><b>找不到完全符合 ${esc(state.code)} 的證券</b><p class="tc-note">試試下列搜尋結果，或確認該證券當日有成交及已收錄於官方盤後資料。</p>${options.map(x=>`<button class="btn sm" data-market-code="${esc(x.code)}">${esc(x.code)} ${esc(x.name)}</button>`).join(' ')}</section>`;}
 else{content+=`<section class="panel tc-pad"><div class="tc-section-head"><h2 class="panel-title">${esc(q.name)} <span class="chip">${esc(q.code)}</span></h2><span class="tc-badge">${esc(q.date)} 收盤資料</span></div><div class="tc-flex"><span class="fine">交易所：${q.market==='TWSE'?'臺灣證券交易所':'證券櫃買中心'}</span><button class="btn sm" data-market-to-inst="${esc(q.code)}">看法人歷史趨勢 →</button></div></section>`+quoteOverview(q);}
 content+=`<section class="panel tc-pad tc-sources">資料來源：<a href="${S.twse}" target="_blank" rel="noopener noreferrer">TWSE 上市股票盤後資料</a>／<a href="${S.tpex}" target="_blank" rel="noopener noreferrer">TPEx 上櫃股票盤後資料</a>；三大法人由原有籌碼模組提供；當沖缺值不另行推估。用於查詢，不提供委託下單。</section>`;
 return content;
}
document.addEventListener('click',e=>{const p=e.target.closest('[data-market-refresh],[data-market-find],[data-market-code],[data-market-to-inst],[data-market-holdings]');if(!p)return;
 if(p.hasAttribute('data-market-refresh')){state.status='idle';load(true);}
 else if(p.hasAttribute('data-market-find')){state.code=document.querySelector('#marketCode')?.value.trim().toUpperCase()||'2330';refresh();}
 else if(p.dataset.marketCode){state.code=p.dataset.marketCode;refresh();}
 else if(p.dataset.marketToInst){window.TradeCompassBridge?.navigate?.('institutions');window.TradeCompassInstitutional?.selectCode(p.dataset.marketToInst);window.TradeCompassBridge?.render?.();}
 else if(p.hasAttribute('data-market-holdings')){const xs=window.TradeCompassBridge?.getHoldings?.()||[];if(!xs.length)return alert('尚無持股紀錄');state.code=xs[0].symbol;refresh();}
});
document.addEventListener('keydown',e=>{if(e.target.id==='marketCode'&&e.key==='Enter'){e.preventDefault();state.code=e.target.value.trim().toUpperCase();refresh();}});
window.TradeCompassMarket={html,load,find,instItem,quoteOverview,get status(){return state.status},get market(){return state.market},select(code){state.code=code;refresh();}};
})();
