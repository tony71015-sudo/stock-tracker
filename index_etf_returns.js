/* Trade Compass - index ETF market price and DCA simulator; no trading advice. */
(function(){'use strict';
const ETF=['0050','006208','009816'];
const KEY='trade-compass-index-etf-investments-v161';
let store={};try{store=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
const cache={},loadErrors={},inFlight={};let activeFund='0050';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sgn=(v,d=0)=>Number.isFinite(v)?(v>0?'+':'')+num(v,d):'—';
const money=v=>sgn(v,0);
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(store));}catch{}};
const refresh=()=>{if(window.TradeCompassBridge?.isPage?.('indexETF'))window.TradeCompassBridge.render();};
function rows(fund){return Array.isArray(store[fund])?store[fund]:[];}
function setRows(fund,items){store[fund]=items;save();refresh();}
function splitFactor(fund,date){return fund==='0050'&&date<'2025-06-18'?4:1;}
function validatePrices(p,fund){if(p?.etf!==fund||!Array.isArray(p.rows))throw Error('價格資料格式錯誤');const m=new Map();for(const r of p.rows){let date,close;if(Array.isArray(r)){[date,close]=r;}else{date=r.date;close=r.close;}if(validDate(date)&&Number.isFinite(Number(close))&&Number(close)>0)m.set(date,{date,close:Number(close)});}return [...m.values()].sort((a,b)=>a.date.localeCompare(b.date));}
async function load(fund){if(!ETF.includes(fund)||cache[fund]||inFlight[fund])return;inFlight[fund]=true;try{const r=await fetch('data/index-etf/prices/'+fund+'.json?cache='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const p=await r.json();cache[fund]=validatePrices(p,fund);delete loadErrors[fund];}catch(e){loadErrors[fund]='尚未取得官方歷史收盤價：'+e.message;}finally{inFlight[fund]=false;}refresh();}
function compute(prices,investments,feePct=0){if(!prices?.length)return null;
 const ordered=[...investments].filter(x=>validDate(x.date)&&Number(x.amount)>0&&x.date>=prices[0].date).sort((a,b)=>a.date.localeCompare(b.date));
 const events=[];let invested=0,shares=0,unspent=0,lastDate='',active=false,firstExecution='';let worst=null,best=null;const series=[];let applied=0;const fee=Number(feePct)/100;
 for(const bar of prices){if(!bar||!validDate(bar.date)||!(bar.close>0))continue;
  if(lastDate&&lastDate<'2025-06-18'&&bar.date>='2025-06-18')shares*=4;
  lastDate=bar.date;
  while(applied<ordered.length&&ordered[applied].date<=bar.date){const o=ordered[applied++],requested=Number(o.amount);
   const bought=Math.floor(requested/(bar.close*(1+fee)));const gross=bought*bar.close;const commission=gross*fee;const paid=gross+commission;
   shares+=bought;invested+=paid;unspent+=requested-paid;events.push({requestedDate:o.date,date:bar.date,requested,paid,bought,price:bar.close,fee:commission});if(!firstExecution)firstExecution=bar.date;
  }
  if(events.length){const value=shares*bar.close;const pnl=value-invested;const pct=invested>0?100*pnl/invested:0;
   const snap={date:bar.date,close:bar.close,shares,invested,value,pnl,pct};series.push(snap);if(!best||pnl>best.pnl)best=snap;if(!worst||pnl<worst.pnl)worst=snap;
  }
 }
 const latest=series.at(-1)||null;return {events,series,latest,best,worst,unspent,notYet:ordered.slice(applied),firstExecution,lastPriceDate:prices.at(-1).date};
}
function polyline(values,minX,maxX,left,top,width,height){const v=values.filter(Number.isFinite);if(!v.length)return'';const lo=Math.min(...v),hi=Math.max(...v),span=(hi-lo)||1;return values.map((n,i)=>Number.isFinite(n)?`${(left+(i/Math.max(1,values.length-1))*width).toFixed(1)},${(top+height-(n-lo)/span*height).toFixed(1)}`:'').join(' ');}
function chart(series){if(series.length<2)return '<p class="fine">至少需要兩個交易日的價格才能畫出趨勢。</p>';
 const w=820,h=258;const xs=[0,Math.floor((series.length-1)/2),series.length-1];const price=series.map(x=>x.close),pnl=series.map(x=>x.pnl);
 const line1=polyline(price,0,0,58,26,730,84),line2=polyline(pnl,0,0,58,150,730,70);
 return `<div style="overflow-x:auto"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="歷史 ETF 收盤價與投資未實現損益" style="width:100%;min-width:500px;background:var(--surface,transparent)"><text x="12" y="18" fill="currentColor" font-size="12">收盤價（元）</text><polyline fill="none" stroke="#0f9f91" stroke-width="2.3" points="${line1}"/><text x="12" y="143" fill="currentColor" font-size="12">損益（元）</text><polyline fill="none" stroke="#d97706" stroke-width="2.3" points="${line2}"/><line x1="58" y1="222" x2="790" y2="222" stroke="currentColor" opacity=".3"/>${xs.map(i=>`<text x="${58+730*i/Math.max(1,series.length-1)}" y="244" text-anchor="middle" font-size="11" fill="currentColor">${series[i].date.slice(2)}</text>`).join('')}</svg></div>`;
}
function metric(label,val){return `<div class="panel metric" style="padding:14px"><div class="metric-label">${esc(label)}</div><div class="metric-value" style="font-size:21px">${esc(val)}</div></div>`;}
function html(fund){if(!ETF.includes(fund))fund='0050';activeFund=fund;if(!cache[fund]&&!loadErrors[fund])Promise.resolve().then(()=>load(fund));
 const prices=cache[fund]||[],entries=rows(fund),fees=Number(store[fund+'_fee']||0);const result=compute(prices,entries,fees);const cur=result?.latest;
 let h=`<section class="panel" style="margin-top:18px;padding:20px 23px" id="indexETFReturns"><h2 class="panel-title">指數型 ETF 歷史股價與投入報酬試算</h2><p class="subtitle">${fund}｜可輸入多筆投入日期與金額，依該日或下一交易日<strong>收盤價</strong>模擬買入；這是回測估算，不是實際成交保證。</p>
 <div class="filter-row" style="margin:14px 0"><label>投入日期</label><input id="idxReturnDate" type="date" class="field"/><label>投入金額（元）</label><input id="idxReturnAmount" type="number" min="1" step="1" class="field" placeholder="例：10000"/><button id="idxReturnAdd" class="btn primary">新增投入</button><label>買入手續費（%）</label><input id="idxReturnFee" class="field" type="number" min="0" max="5" step="0.0001" style="width:110px" value="${fees}"/></div>
 <p class="fine">歷史價格：${prices.length?`${prices[0].date} ～ ${prices.at(-1).date}（${prices.length} 日）`:'尚未取得'}；價格來源：臺灣證券交易所 STOCK_DAY。輸入與結果儲存在本機瀏覽器。</p>`;
 if(loadErrors[fund])h+=`<p class="alert">${esc(loadErrors[fund])}。請先執行價格資料更新工作流程。</p>`;
 if(result&&entries.length){h+=`<div class="grid stats" style="margin-top:15px">${metric('累積買入成本',num(cur?.invested||0))}${metric('目前持有股數',num(cur?.shares||0))}${metric('平均持有成本',cur?.shares?num(cur.invested/cur.shares,3):'—')}${metric('最近收盤價',cur?num(cur.close,2):'—')}${metric('目前市值',num(cur?.value||0))}${metric('目前未實現損益',money(cur?.pnl??NaN))}${metric('報酬率',cur?sgn(cur.pct,2)+'%':'—')}${metric('持有期間最大未實現獲利',money(result.best?.pnl??NaN))}${metric('持有期間最大未實現虧損',money(result.worst?.pnl??NaN))}</div>`;
 h+=`<div class="note-box mt16">持有期間最高未實現獲利：${result.best?.date||'—'}；最低未實現損益：${result.worst?.date||'—'}。每次加碼會改變累積成本，最高／最低損益為按每日收盤價計算的<strong>絕對金額</strong>；如想比較投資效率，請同時參考報酬率。尚未投入的餘額約 ${num(result.unspent)} 元（不計入成本或損益）。</div>`;
 h+=chart(result.series);
 h+=`<div class="table-wrap"><table class="data-table"><thead><tr><th>設定投入日期</th><th>模擬成交日</th><th class="num">預算</th><th class="num">收盤價</th><th class="num">買入股數</th><th class="num">含手續費成本</th></tr></thead><tbody>${result.events.map(e=>`<tr><td>${e.requestedDate}</td><td>${e.date}</td><td class="num">${num(e.requested)}</td><td class="num">${num(e.price,2)}</td><td class="num">${num(e.bought)}</td><td class="num">${num(e.paid,2)}</td></tr>`).join('')}</tbody></table></div>`;
 if(result.notYet.length||entries.some(x=>x.date<prices[0].date))h+=`<p class="alert">有投入日期超出現有行情範圍，未納入試算；請先回補正確歷史行情。</p>`;
 }else {h+=`<p class="fine">新增一筆投入後，會顯示收盤價走勢及累積損益。${!prices.length?'目前缺少價格資料。':''}</p>`;if(prices.length>1)h+=chart(prices.map(x=>({...x,pnl:0})));}
 if(entries.length){h+=`<div class="filter-row" style="margin-top:12px"><strong>已設定投入</strong><button id="idxReturnClear" class="btn danger">清除本檔試算</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>日期</th><th class="num">投入金額</th><th>操作</th></tr></thead><tbody>${entries.map((x,i)=>`<tr><td>${esc(x.date)}</td><td class="num">${num(Number(x.amount))}</td><td><button type="button" class="btn" data-idx-return-delete="${i}">移除</button></td></tr>`).join('')}</tbody></table></div>`;}
 h+=`<div class="note-box mt16"><strong>計算限制：</strong>預設不含手續費（可調整），不含配息、配息再投入、賣出交易稅、滑價及其他費用，故顯示的是<strong>價格報酬</strong>。0050 在 2025-06-18 以 1：4 分割，試算已調整分割前買入股數。若日期是非交易日，以其後第一個可得收盤價估算。遇到未來新分割應先更新分割事件。資料僅供研究，投資前應核對官方公告。</div></section>`;
 return h;
}
document.addEventListener('click',e=>{if(!window.TradeCompassBridge?.isPage?.('indexETF'))return;const t=e.target.closest?.('button');if(!t)return;
 if(t.id==='idxReturnAdd'){const date=document.getElementById('idxReturnDate')?.value,amount=Number(document.getElementById('idxReturnAmount')?.value);if(!validDate(date)||!(amount>0)){alert('請輸入有效日期與正數投入金額');return;}setRows(activeFund,[...rows(activeFund),{date,amount}]);}
 if(t.id==='idxReturnClear'){if(confirm('確定清除本 ETF 的投入試算？'))setRows(activeFund,[]);}
 if(t.dataset.idxReturnDelete!==undefined){const n=Number(t.dataset.idxReturnDelete);if(Number.isInteger(n))setRows(activeFund,rows(activeFund).filter((_,i)=>i!==n));}
});
document.addEventListener('change',e=>{if(e.target?.id==='idxReturnFee'){const v=Number(e.target.value);if(Number.isFinite(v)&&v>=0&&v<=5){store[activeFund+'_fee']=v;save();refresh();}}});
window.TradeCompassETFReturns={html,load,_test:{compute,validatePrices,splitFactor}};
})();
