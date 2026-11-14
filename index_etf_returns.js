/* Trade Compass v1.6.3 | ETF split, dividends, reinvestment, multi-lot simulation. */
(function(){'use strict';
const ETF=['0050','006208','009816'];
const KEY='trade-compass-index-etf-investments-v161'; // preserve existing v1.6.1 input
const SPLITS={'0050':[{'date':'2025-06-18','ratio':4}]};
let store={};try{store=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
const pricesCache={},dividendsCache={},errors={},pending={};let activeFund='0050';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sgn=(v,d=0)=>Number.isFinite(v)?(v>0?'+':'')+num(v,d):'—';
const dateValid=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){console.warn('Cannot save ETF simulator',e);}};
const refresh=()=>{if(window.TradeCompassBridge?.isPage?.('indexETF'))window.TradeCompassBridge.render();};
const lots=fund=>Array.isArray(store[fund])?store[fund]:[];
function updateLots(fund,x){store[fund]=x;persist();refresh();}
function parsePrices(payload,code){if(payload?.etf!==code||!Array.isArray(payload.rows))throw Error('歷史價格檔案格式錯誤');const m=new Map();for(const r of payload.rows){const [d,c]=Array.isArray(r)?r:[r.date,r.close];const price=Number(c);if(dateValid(d)&&Number.isFinite(price)&&price>0)m.set(d,{date:d,close:price});}return [...m.values()].sort((a,b)=>a.date.localeCompare(b.date));}
function parseDividends(payload,code){if(payload?.etf!==code||!Array.isArray(payload.events))throw Error('配息檔案格式錯誤');const seen=new Set(),out=[];for(const e of payload.events){if(!dateValid(e.exDate)||!dateValid(e.paymentDate)||e.paymentDate<e.exDate||!(Number(e.amount)>0)||seen.has(e.exDate))continue;seen.add(e.exDate);out.push({exDate:e.exDate,paymentDate:e.paymentDate,amount:Number(e.amount)});}return out.sort((a,b)=>a.exDate.localeCompare(b.exDate));}
async function load(code){if(!ETF.includes(code)||pending[code])return;pending[code]=true;try{
 if(!pricesCache[code]){const r=await fetch('data/index-etf/prices/'+code+'.json?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('股價 HTTP '+r.status);pricesCache[code]=parsePrices(await r.json(),code);}
 try{const r=await fetch('data/index-etf/dividends/'+code+'.json?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const raw=await r.json();dividendsCache[code]={events:parseDividends(raw,code),coverageStart:raw.coverageStart||null,asOf:raw.asOf||null};delete errors[code+'_div'];}
 catch(e){errors[code+'_div']='尚無完整官方配息檔案（'+e.message+'），含息績效暫停顯示';}
 delete errors[code+'_price'];}catch(e){errors[code+'_price']='收盤價載入失敗：'+e.message;}finally{delete pending[code];refresh();}}
function nextDateAfter(date,prices){return prices.find(p=>p.date>date)?.date||null;}
// Cash dividends are receivable at ex-date (for holders before ex-date) and
// payable at paymentDate. Reinvestment is simulated at the first trading CLOSE
// strictly later than paymentDate; it does NOT count as new external capital.
function compute(prices,investments,{fund='0050',feePct=0,mode='price',dividends=[]}={}){
 if(!prices?.length)return null;
 const bars=prices.filter(x=>dateValid(x.date)&&Number(x.close)>0).sort((a,b)=>a.date.localeCompare(b.date));if(!bars.length)return null;
 const original=[...investments].filter(x=>dateValid(x.date)&&Number(x.amount)>0).sort((a,b)=>a.date.localeCompare(b.date));
 const ignored=original.filter(x=>x.date<bars[0].date),scheduled=original.filter(x=>x.date>=bars[0].date);
 const splits=SPLITS[fund]||[],divs=mode==='price'?[]:[...dividends].sort((a,b)=>a.exDate.localeCompare(b.exDate));
 let shares=0,externalPaid=0,bookCost=0,unused=0,dividendGross=0,dividendCash=0,receivable=0,reinvestPaid=0,reinvestFees=0,dividendsPaid=0;
 let orderIndex=0,splitIndex=0,exIndex=0,lastDate='';const payments=[],events=[],divEvents=[],series=[];
 let best=null,worst=null, bestRate=null,worstRate=null;
 const fee=Number(feePct)/100;if(!Number.isFinite(fee)||fee<0||fee>0.05)return null;
 for(const b of bars){const date=b.date,price=Number(b.close);
  // Corporate actions precede any purchases simulated at today's closing price.
  while(splitIndex<splits.length&&splits[splitIndex].date<=date){const e=splits[splitIndex++];if(!lastDate||lastDate<e.date){const before=shares;shares*=e.ratio;if(before>0)events.push({kind:'split',date:e.date,shares:shares-before,ratio:e.ratio,price,paid:0});}}
  while(exIndex<divs.length&&divs[exIndex].exDate<=date){const d=divs[exIndex++];if(!lastDate||lastDate<d.exDate){const amount=shares*d.amount;dividendGross+=amount;receivable+=amount;payments.push({...d,gross:amount,paid:false});divEvents.push({kind:'ex',date:d.exDate,amount,shares});}}
  for(const p of payments){if(!p.paid&&p.paymentDate<=date){p.paid=true;receivable-=p.gross;dividendCash+=p.gross;dividendsPaid+=p.gross;divEvents.push({kind:'payment',date:p.paymentDate,amount:p.gross});p.availableReinvestDate=nextDateAfter(p.paymentDate,bars);}}
  while(orderIndex<scheduled.length&&scheduled[orderIndex].date<=date){const v=scheduled[orderIndex++],requested=Number(v.amount),qty=Math.floor(requested/(price*(1+fee))+1e-9);const paid=qty*price*(1+fee);externalPaid+=paid;bookCost+=paid;unused+=requested-paid;shares+=qty;events.push({kind:'purchase',requestedDate:v.date,date,requested,shares:qty,price,paid,fee:qty*price*fee});}
  if(mode==='reinvest'&&dividendCash>0&&payments.some(p=>p.availableReinvestDate===date)){
   const qty=Math.floor(dividendCash/(price*(1+fee))+1e-9);if(qty>0){const paid=qty*price*(1+fee);shares+=qty;bookCost+=paid;reinvestPaid+=paid;reinvestFees+=paid-qty*price;dividendCash-=paid;events.push({kind:'reinvest',date,requested:paid,shares:qty,price,paid,fee:paid-qty*price});}
  }
  lastDate=date;
  if(events.length){const value=shares*price;const pricePnl=value-bookCost;const totalPnl=mode==='price'?value-externalPaid:value+dividendCash+receivable-externalPaid;
   const totalAssets=mode==='price'?value:value+dividendCash+receivable;const pct=externalPaid?100*totalPnl/externalPaid:0;
   const snap={date,close:price,shares,externalPaid,bookCost,value,pricePnl,totalPnl,pnl:totalPnl,pct,cash:dividendCash,receivable,totalAssets,dividendGross};series.push(snap);
   if(!best||snap.pnl>best.pnl)best=snap;if(!worst||snap.pnl<worst.pnl)worst=snap;
   if(!bestRate||snap.pct>bestRate.pct)bestRate=snap;if(!worstRate||snap.pct<worstRate.pct)worstRate=snap;
  }
 }
 const latest=series.at(-1)||null;return {events,divEvents,series,latest,best,worst,bestRate,worstRate,
  ignored,notYet:scheduled.slice(orderIndex),unused,externalPaid,bookCost,dividendGross,dividendCash,receivable,reinvestPaid,reinvestFees,dividendsPaid,
  xirr:latest?xirr(events.filter(e=>e.kind==='purchase').map(e=>({date:e.date,amount:-e.paid})).concat([{date:latest.date,amount:latest.totalAssets}])):null};
}
function xirr(cashflows){const items=cashflows.filter(e=>dateValid(e.date)&&Number.isFinite(e.amount)&&e.amount!==0);if(!items.some(e=>e.amount<0)||!items.some(e=>e.amount>0))return null;
 const start=Date.parse(items[0].date+'T00:00:00Z'),flows=items.map(e=>({amount:e.amount,years:(Date.parse(e.date+'T00:00:00Z')-start)/86400000/365.25}));
 const fn=r=>flows.reduce((sum,e)=>sum+e.amount*Math.exp(-Math.log1p(r)*e.years),0);
 // Annualized money-weighted return. No meaningful annualization for same-day positions.
 if(flows.every(e=>Math.abs(e.years)<1e-9))return null;
 let lo=-0.999999,hi=1;const fLo=fn(lo);let fHi=fn(hi);for(let i=0;i<32&&fHi>0;i++){hi=hi*2+1;fHi=fn(hi);}
 if(!Number.isFinite(fLo)||!Number.isFinite(fHi)||fLo*fHi>0)return null;
 for(let i=0;i<120;i++){const mid=(lo+hi)/2, f=fn(mid);if(!Number.isFinite(f))return null;if(f*fLo>0)lo=mid;else hi=mid;}
 return ((lo+hi)/2)*100;
}
function poly(values,left,top,width,height){const finite=values.filter(Number.isFinite);if(finite.length<2)return '';let lo=Math.min(...finite),hi=Math.max(...finite);if(hi===lo){hi+=1;lo-=1;}return values.map((v,i)=>Number.isFinite(v)?`${(left+i/Math.max(1,values.length-1)*width).toFixed(1)},${(top+height-(v-lo)/(hi-lo)*height).toFixed(1)}`:'').join(' ');}
function chart(series){if(series.length<2)return '<p class="fine">至少需要兩個交易日才可繪圖。</p>';const labels=[0,Math.floor((series.length-1)/2),series.length-1];return `<div style="overflow-x:auto"><svg viewBox="0 0 820 258" role="img" aria-label="ETF 收盤價與投資損益走勢" style="width:100%;min-width:500px"><text x="12" y="18" font-size="12" fill="currentColor">ETF 收盤價（原始價格）</text><polyline points="${poly(series.map(x=>x.close),58,26,730,86)}" fill="none" stroke="#0f9f91" stroke-width="2.5"/><text x="12" y="142" font-size="12" fill="currentColor">組合損益（元）</text><polyline points="${poly(series.map(x=>x.pnl),58,152,730,68)}" fill="none" stroke="#d97706" stroke-width="2.5"/>${labels.map(i=>`<text x="${58+730*i/Math.max(1,series.length-1)}" y="245" text-anchor="middle" font-size="11" fill="currentColor">${series[i].date.slice(2)}</text>`).join('')}</svg></div>`;}
const metric=(label,val)=>`<div class="panel metric" style="padding:14px"><div class="metric-label">${esc(label)}</div><div class="metric-value" style="font-size:20px">${esc(val)}</div></div>`;
function html(fund){if(!ETF.includes(fund))fund='0050';activeFund=fund;if(!pending[fund]&&(!pricesCache[fund]||!dividendsCache[fund])&&!errors[fund+'_div'])Promise.resolve().then(()=>load(fund));
 const prices=pricesCache[fund]||[],dfile=dividendsCache[fund],ls=lots(fund),fee=Number(store[fund+'_fee']||0);
 let mode=store[fund+'_mode']||'price';if(!['price','cash','reinvest'].includes(mode))mode='price';
 const blocked=mode!=='price'&&!dfile;const calc=prices.length&&!blocked?compute(prices,ls,{fund,feePct:fee,mode,dividends:dfile?.events||[]}):null;const cur=calc?.latest;
 let h=`<section class="panel" style="margin-top:18px;padding:20px 23px" id="indexETFReturns"><h2 class="panel-title">指數型 ETF 股價與投入報酬試算（含配息、分割）</h2><p class="subtitle">${esc(fund)}｜可多次加碼；買入日期以當日或其後第一個可得交易日<strong>收盤價</strong>估算。所有試算保存在本機。</p>
 <div class="filter-row" style="margin:12px 0"><label>報酬計算</label><select id="idxReturnMode" class="field"><option value="price" ${mode==='price'?'selected':''}>純價格報酬</option><option value="cash" ${mode==='cash'?'selected':''}>含息總報酬（股息留現金）</option><option value="reinvest" ${mode==='reinvest'?'selected':''}>含息總報酬（股息再投入）</option></select><label>投入／加碼日期</label><input id="idxReturnDate" type="date" class="field"/><label>加碼預算（元）</label><input id="idxReturnAmount" type="number" min="1" step="1" class="field" placeholder="例：10000"/><button id="idxReturnAdd" class="btn primary">新增投入／加碼</button><label>買入手續費（%）</label><input id="idxReturnFee" type="number" min="0" max="5" step="0.0001" class="field" style="width:106px" value="${fee}"/></div>
 <p class="fine">價格資料：${prices.length?`${prices[0].date}～${prices.at(-1).date}（${prices.length} 日）`:'尚無'}；配息資料：${dfile?`${dfile.events.length} 筆，截至 ${esc(dfile.asOf||'未標示')}`:'尚無'}。來源：證交所 STOCK_DAY、ETF 收益分配歷史。</p>`;
 if(errors[fund+'_price'])h+=`<p class="alert">${esc(errors[fund+'_price'])}</p>`;
 if(errors[fund+'_div'])h+=`<p class="alert">${esc(errors[fund+'_div'])}</p>`;
 if(blocked)h+='<p class="alert">配息歷史缺漏：已停用含息績效，不使用 0 元配息假裝完整。可先切回「純價格報酬」。</p>';
 if(calc&&cur){h+=`<div class="grid stats" style="margin-top:12px">${metric('額外投入成本',num(cur.externalPaid,2))}${metric('分割／再投入後股數',num(cur.shares,4))}${metric('平均帳面持股成本',cur.shares?num(cur.bookCost/cur.shares,4):'—')}${metric('最近收盤價',num(cur.close,2))}${metric('目前持股市值',num(cur.value))}${metric('價格損益',num(cur.pricePnl))}${metric('累積應得配息',mode==='price'?'未計入':num(calc.dividendGross,2))}${metric('現金＋待發配息',mode==='price'?'未計入':num(calc.dividendCash+calc.receivable,2))}${metric('含息總損益',mode==='price'?'未計入':sgn(cur.totalPnl))}${metric('目前報酬率',sgn(cur.pct,2)+'%')}${metric('期間最高損益',sgn(calc.best?.pnl))}${metric('期間最低損益',sgn(calc.worst?.pnl))}${metric('最高報酬率',sgn(calc.bestRate?.pct,2)+'%')}${metric('最低報酬率',sgn(calc.worstRate?.pct,2)+'%')}${metric('年化資金加權報酬 XIRR',calc.xirr===null?'資料不足':sgn(calc.xirr,2)+'%')}</div>`;
 h+=`<p class="fine">最高損益 ${calc.best?.date||'—'}；最低損益 ${calc.worst?.date||'—'}。尚未投入的預算餘額：${num(calc.unused,2)} 元，未計入投入成本。股利再投入金額：${num(calc.reinvestPaid,2)} 元（不是新增本金）。</p>`;
 h+=chart(calc.series);
 h+=`<div class="table-wrap"><table class="data-table"><thead><tr><th>事件類型</th><th>預定日期</th><th>模擬日期</th><th class="num">每股價格</th><th class="num">股數增加</th><th class="num">成本／再投入（元）</th></tr></thead><tbody>${calc.events.map(e=>`<tr><td>${e.kind==='purchase'?'投入／加碼':e.kind==='split'?'分割增加股數':'股息再投入'}</td><td>${esc(e.requestedDate||e.date)}</td><td>${esc(e.date)}</td><td class="num">${num(e.price,2)}</td><td class="num">${num(e.shares,4)}</td><td class="num">${num(e.paid,2)}</td></tr>`).join('')}</tbody></table></div>`;
 if(mode!=='price'&&calc.divEvents.length)h+=`<details><summary>查看期間配息事件（${calc.divEvents.length} 筆）</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>事件</th><th>日期</th><th class="num">應得／入帳金額</th></tr></thead><tbody>${calc.divEvents.map(e=>`<tr><td>${e.kind==='ex'?'除息應得':'配息入帳'}</td><td>${esc(e.date)}</td><td class="num">${num(e.amount,2)}</td></tr>`).join('')}</tbody></table></div></details>`;
 if(calc.ignored.length||calc.notYet.length)h+='<p class="alert">部分投入日期不在已保存股價範圍內，沒有納入計算。請先補齊歷史行情。</p>';
 }else if(!blocked)h+=`<p class="fine">輸入一筆日期和金額，即可比較歷史成本與收益。${!prices.length?'目前缺少行情資料。':''}</p>`;
 if(ls.length)h+=`<div class="filter-row"><strong>多筆投入清單</strong><button id="idxReturnClear" class="btn danger">清除本 ETF 試算</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>日期</th><th class="num">預計投入金額</th><th>操作</th></tr></thead><tbody>${ls.map((x,i)=>`<tr><td>${esc(x.date)}</td><td class="num">${num(Number(x.amount))}</td><td><button class="btn" data-idx-return-delete="${i}">移除</button></td></tr>`).join('')}</tbody></table></div>`;
 h+=`<div class="note-box mt16"><strong>計算說明：</strong>0050 於 2025-06-18 進行 1 拆 4；分割增加股數並相應降低每股成本，<strong>不增加投入本金</strong>。股息依除息日前持股認列應收，發放後留存現金或在發放日後第一個有價交易日收盤價模擬再投入；未滿一股的餘額保留現金。配息再投入不屬於額外加碼。XIRR 以真正投入資金及期末資產計算。股價／配息源自公開資料，可能有漏日；2005 年前配息歷史不保證完整，長期含息回測務必核對官方紀錄。未計賣出交易稅、滑價、股息稅負及其他費用。非交易建議。</div></section>`;
 return h;}
document.addEventListener('click',e=>{if(!window.TradeCompassBridge?.isPage?.('indexETF'))return;const b=e.target.closest?.('button');if(!b)return;
 if(b.id==='idxReturnAdd'){const date=document.getElementById('idxReturnDate')?.value,amount=Number(document.getElementById('idxReturnAmount')?.value);if(!dateValid(date)||!(amount>0)){alert('請輸入有效日期與投入金額');return;}updateLots(activeFund,[...lots(activeFund),{date,amount}]);}
 if(b.id==='idxReturnClear'){if(confirm('確定清除這檔 ETF 的所有投入試算？'))updateLots(activeFund,[]);}
 if(b.dataset.idxReturnDelete!==undefined){const i=Number(b.dataset.idxReturnDelete);if(Number.isInteger(i))updateLots(activeFund,lots(activeFund).filter((_,j)=>i!==j));}
});
document.addEventListener('change',e=>{if(e.target?.id==='idxReturnFee'){const x=Number(e.target.value);if(Number.isFinite(x)&&x>=0&&x<=5){store[activeFund+'_fee']=x;persist();refresh();}}
 if(e.target?.id==='idxReturnMode'){store[activeFund+'_mode']=e.target.value;persist();refresh();}});
window.TradeCompassETFReturns={html,load,_test:{compute,xirr,parsePrices,parseDividends}};
})();
