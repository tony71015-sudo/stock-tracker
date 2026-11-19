/* Historical drawdown hold-through simulator for Taiwan index ETFs. */
(function(){
'use strict';
const FUNDS=['0050','006208'];
const splitEvents={ '0050':[{date:'2025-06-18',ratio:4}] };
const cache={prices:{},dividends:{},index:null};
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>Number(x||0).toLocaleString('zh-TW',{maximumFractionDigits:0});
const pct=x=>(x>=0?'+':'')+(x*100).toFixed(1)+'%';
function dateOK(x){return /^\d{4}-\d{2}-\d{2}$/.test(String(x||''));}
async function loadFund(code){
 if(!cache.prices[code]){
  const r=await fetch('data/index-etf/prices/'+code+'.json?ts='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error(code+' 歷史價格載入失敗（HTTP '+r.status+'）');
  const d=await r.json();
  if(d.etf!==code||!Array.isArray(d.rows))throw Error(code+' 價格資料格式錯誤');
  cache.prices[code]=d.rows.map(x=>Array.isArray(x)?{date:x[0],close:Number(x[1])}:{date:x.date,close:Number(x.close)}).filter(x=>dateOK(x.date)&&x.close>0).sort((a,b)=>a.date.localeCompare(b.date));
 }
 if(!cache.dividends[code]){
  const r=await fetch('data/index-etf/dividends/'+code+'.json?ts='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error(code+' 配息資料載入失敗（HTTP '+r.status+'）');
  const d=await r.json();
  if(d.etf!==code||!Array.isArray(d.events))throw Error(code+' 配息資料格式錯誤');
  cache.dividends[code]=d;
 }
}
async function loadIndex(){
 if(cache.index)return;
 const r=await fetch('data/history/taiex.json?ts='+Date.now(),{cache:'no-store'});
 if(!r.ok)throw Error('加權指數歷史資料載入失敗（HTTP '+r.status+'）');
 const d=await r.json();
 if(d.index!=='TAIEX'||!Array.isArray(d.rows))throw Error('加權指數資料格式錯誤');
 const rows=d.rows.map(x=>Array.isArray(x)?{date:x[0],close:Number(x[1])}:{date:x.date,close:Number(x.close)}).filter(x=>dateOK(x.date)&&x.close>0).sort((a,b)=>a.date.localeCompare(b.date));
 if(rows.length<2||rows[0].date>'1999-01-31')throw Error('加權指數歷史資料尚未涵蓋 1999 年；請稍後重試更新。');
 cache.index={...d,rows};
}
function largestDrawdown(rows){
 let peak=rows[0],best={drawdown:0,peak:rows[0],trough:rows[0]};
 for(const row of rows){
  if(row.close>peak.close)peak=row;
  else{const drawdown=1-row.close/peak.close;if(drawdown>best.drawdown)best={drawdown,peak,trough:row};}
 }
 best.recovery=rows.find(x=>x.date>best.trough.date&&x.close>=best.peak.close)?.date||null;
 return best;
}

function splitAdjustedRows(code){const splits=splitEvents[code]||[];return cache.prices[code].map(r=>({date:r.date,close:r.close/splits.filter(e=>e.date>r.date).reduce((n,e)=>n*e.ratio,1)}));}
function findEpisodes(rows,threshold){
 const out=[];if(rows.length<2)return out;
 let peak=rows[0],trough=rows[0],active=false,worst=0;
 for(let i=1;i<rows.length;i++){
  const p=rows[i];
  if(!active){
   if(p.close>peak.close)peak=p;
   const dd=1-p.close/peak.close;
   if(dd>=threshold){active=true;trough=p;worst=dd;}
  }else{
   const dd=1-p.close/peak.close;
   if(p.close<trough.close)trough=p;
   worst=Math.max(worst,dd);
   if(p.close>=peak.close){
    out.push({peak,trough,recovery:p.date,drawdown:worst,open:false});
    peak=p;trough=p;active=false;worst=0;
   }
  }
 }
 if(active)out.push({peak,trough,recovery:null,drawdown:worst,open:true});
 return out;
}
function simulate(code,start,amount,mode){
 const available=cache.prices[code];if(!available.length||start<available[0].date||start>available.at(-1).date)return null;const bars=available.filter(x=>x.date>=start);if(!bars.length)return null;
 const buy=bars[0],qty=Math.floor(amount/buy.close),leftover=amount-qty*buy.close;
 let shares=qty,cash=leftover,dividendCash=0,receivable=0,divGross=0,splitIndex=0,divIndex=0;
 const divs=mode==='price'?[]:cache.dividends[code].events.slice().sort((a,b)=>a.exDate.localeCompare(b.exDate));
 const splits=splitEvents[code]||[],payments=[],series=[];
 for(const b of bars){
  while(splitIndex<splits.length&&splits[splitIndex].date<=b.date){const e=splits[splitIndex++];if(e.date>=start)shares*=e.ratio;}
  while(divIndex<divs.length&&divs[divIndex].exDate<=b.date){
   const d=divs[divIndex++];
   if(d.exDate>start){const value=shares*Number(d.amount);receivable+=value;divGross+=value;payments.push({...d,value,paid:false});}
  }
  for(const p of payments){if(!p.paid&&p.paymentDate<=b.date){p.paid=true;receivable-=p.value;dividendCash+=p.value;p.reinvestDate=cache.prices[code].find(x=>x.date>p.paymentDate)?.date||null;}}
  if(mode==='reinvest'){
   const available=payments.some(p=>p.paid&&p.reinvestDate===b.date);
   if(available&&dividendCash>=b.close){const bought=Math.floor(dividendCash/b.close);shares+=bought;dividendCash-=bought*b.close;}
  }
  series.push({date:b.date,close:b.close,shares,cash:cash+dividendCash,receivable,assets:shares*b.close+cash+dividendCash+receivable});
 }
 const last=bars[bars.length-1],assets=series.at(-1)?.assets||0;
 return {code,start:buy.date,end:last.date,buyPrice:buy.close,lastPrice:last.close,shares,cash,receivable,divGross,assets,profit:assets-amount,return:assets/amount-1,series};
}
function entryRisk(calc,amount){
 if(!calc?.series?.length)return null;
 let high=calc.series[0],worst=null,min=calc.series[0];
 for(const row of calc.series){if(row.assets<min.assets)min=row;if(row.assets>high.assets)high=row;else{const dd=1-row.assets/high.assets;if(!worst||dd>worst.drawdown)worst={drawdown:dd,peak:high,trough:row};}}
 return {worst,minimum:min,belowCost:Math.min(0,min.assets/amount-1),breakEven:calc.series.find(x=>x.assets>=amount)?.date||null};
}
function html(){
 return '<section class="panel" style="margin-top:18px;padding:22px 24px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap"><div><div class="eyebrow">LONG-TERM INVESTING HISTORY</div><h2 class="panel-title">歷史股災回顧區</h2><p class="subtitle">回看台股大幅回檔的時間與跌幅，並比較不同入場日期之後實際遇到的下跌。</p></div><button class="btn" id="historyCrashRefresh">讀取最新資料</button></div>'+
 "<section class=\"note-box mt16\"><h3>從 1999 年投入，現在值多少？</h3><p>假設資產依台股加權指數收盤點數同比例變動，可分割投入全部本金，不含股息與交易費用。這是指數模擬，早期年份沒有對應的 ETF 成交紀錄。</p><label>投入日 <input type=\"date\" id=\"pathStart\" value=\"1999-01-05\" min=\"1999-01-05\"></label> <label>本金（元） <input type=\"number\" id=\"pathCapital\" value=\"100000\" min=\"1\"></label> <button class=\"btn primary\" id=\"pathRun\">查看持有走勢</button><div id=\"pathResult\" aria-live=\"polite\"></div></section>"+
 '<div class="note-box mt16"><strong>回檔事件：</strong>以證交所加權指數自 1999 年起的每日收盤價辨識非重疊回檔，列出高點日、低點日、最大跌幅、下跌期間及收復前高所需交易日。ETF 持有報酬則使用各 ETF 自身的歷史價格與配息資料；價格尚未涵蓋的年份不會外推。</div>'+
 '<div class="filter-row" style="margin:16px 0"><label>投入金額（新臺幣）</label><input id="historyCrashAmount" class="field" type="number" min="1000" step="1000" value="100000" style="width:170px"><label>想查看哪些回檔？</label><select id="historyCrashThreshold" class="field"><option value="0.15">15% 以上</option><option value="0.20">20% 以上</option><option value="0.25">25% 以上</option><option value="0.30">30% 以上</option><option value="max" selected>只看歷史上跌最深的一次</option></select><label>報酬計算</label><select id="historyCrashMode" class="field"><option value="reinvest" selected>含息總報酬（配息再投入）</option><option value="cash">含息總報酬（配息留現金）</option><option value="price">純價格報酬（不含配息）</option></select><button id="historyCrashRun" class="btn primary">回顧歷次股災</button></div>'+
 '<div id="historyCrashResult" aria-live="polite"><p class="fine">按「回顧歷次股災」後，網站會讀取已發布的歷史價格與配息資料。</p></div>'+
 '<details open style="margin-top:20px;padding:16px;border:1px solid #dce8eb;border-radius:14px;background:#f9fcfc"><summary style="cursor:pointer;font-size:16px;font-weight:850">不同日期進場｜比較之後遇到的股災</summary><p class="fine">輸入最多三個進場日期，系統會以同一投入金額比較 0050 與 006208 持有至最新資料日的結果，並列出進場後最大回檔、低於本金的最大幅度及期末獲利。非交易日會順延至下一個有價格的交易日。</p>'+
 '<div class="filter-row" style="margin:12px 0"><label>進場日 A</label><input id="historyEntryDateA" type="date" class="field"><label>進場日 B</label><input id="historyEntryDateB" type="date" class="field"><label>進場日 C</label><input id="historyEntryDateC" type="date" class="field"><button id="historyEntryRun" class="btn primary">比較進場日</button></div><div id="historyEntryResult" aria-live="polite"><p class="fine">可選股災前、下跌途中或低點附近的不同日期，觀察入場時點如何影響後續持有體驗。</p></div></details>'+
 '<div class="note-box mt16"><strong>美股比較：</strong>本版先呈現網站已有可核對資料的台灣 ETF。美股 ETF 的歷史含息資料與匯率尚未納入，因此不顯示未驗證的 SPY／QQQ 績效；加入前需確認歷史還原收盤價與匯率來源。</div>'+
 '<p class="fine" style="margin-top:14px">資料來源：證交所加權指數歷史資料、網站已發布的 ETF 每日收盤價與配息檔案。大盤指數不含配息；ETF 持有回報依可用資料計算，金額未計手續費與稅費。歷史表現不代表未來會以相同幅度或速度復原，也不構成投資建議。</p></section>';
}
async function run(){
 const target=$('historyCrashResult'),btn=$('historyCrashRun');if(!target)return;
 const amount=Number($('historyCrashAmount')?.value),thresholdChoice=$('historyCrashThreshold')?.value||'0.15',mode=$('historyCrashMode')?.value||'reinvest';
 if(!(amount>=1000)||!Number.isFinite(amount)){target.innerHTML='<p class="alert">投入金額至少為 1,000 元。</p>';return;}
 if(btn)btn.disabled=true;target.innerHTML='<p class="fine">正在載入 0050、006208 歷史價格與配息資料…</p>';
 try{
  await Promise.all([loadIndex(),...FUNDS.map(loadFund)]);
  const rows=cache.index.rows,historicalMax=largestDrawdown(rows),threshold=thresholdChoice==='max'?historicalMax.drawdown:Number(thresholdChoice),episodes=findEpisodes(rows,threshold);
  if(!episodes.length){target.innerHTML='<p class="fine">目前資料期間內沒有符合門檻的回檔。</p>';return;}
  let out='<div class="grid stats" style="margin:12px 0">'+[['1999以來最大回檔',pct(-historicalMax.drawdown)],['最大回檔期間',historicalMax.peak.date+' → '+historicalMax.trough.date],['是否收復前高',historicalMax.recovery||'尚未收復'],['回顧資料範圍',rows[0].date+'～'+rows.at(-1).date]].map(x=>'<div class="metric"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>').join('')+'</div><p class="fine">回檔區間以證交所加權指數收盤價計算；每列列出於回檔前高點投入 '+money(amount)+' 元、持有至各 ETF 最新資料日的模擬結果。'+(episodes.some(e=>e.open)?' 最新一段仍在回檔中，尚未確認低點或復原時間。':'')+'</p>';
  out+='<div class="table-wrap"><table class="data-table"><thead><tr><th>高點 → 低點日期</th><th class="num">最大回檔</th><th>下跌期間</th><th>收復前高</th><th>ETF</th><th class="num">期末資產</th><th class="num">獲利金額</th><th class="num">總報酬率</th></tr></thead><tbody>';
  for(const ep of episodes){
   const declineDays=rows.filter(x=>x.date>=ep.peak.date&&x.date<=ep.trough.date).length-1;
   const recoveryDays=ep.recovery?rows.filter(x=>x.date>ep.trough.date&&x.date<=ep.recovery).length:null;
   for(const code of FUNDS){
    const calc=simulate(code,ep.peak.date,amount,mode);if(!calc){out+='<tr><td>'+esc(ep.peak.date)+' → '+esc(ep.trough.date)+'</td><td class="num">'+pct(-ep.drawdown)+'</td><td>'+declineDays+' 個交易日</td><td>'+(ep.recovery?recoveryDays+' 個交易日｜'+esc(ep.recovery):'尚未收復')+'</td><td><strong>'+code+'</strong></td><td colspan="3">價格資料未涵蓋此進場日，不提供 ETF 報酬外推</td></tr>';continue;}
    out+='<tr><td>'+esc(ep.peak.date)+' → '+esc(ep.trough.date)+(ep.open?'（進行中）':'')+'</td><td class="num">'+pct(-ep.drawdown)+'</td><td>'+declineDays+' 個交易日</td><td>'+(ep.recovery?recoveryDays+' 個交易日｜'+esc(ep.recovery):'尚未收復')+'</td><td><strong>'+code+'</strong></td><td class="num">'+money(calc.assets)+' 元</td><td class="num" style="color:'+(calc.profit>=0?'#087e76':'#b44050')+'">'+(calc.profit>=0?'+':'')+money(calc.profit)+' 元</td><td class="num">'+pct(calc.return)+'</td></tr>';
   }
  }
  out+='</tbody></table></div><p class="fine">股數以整股計算；配息再投入按發放後首個交易日收盤價模擬，未用完現金保留。'+(mode==='price'?'本次為純價格報酬，不含配息。':'')+' 回檔日期及跌幅依加權指數每日收盤點位計算，並非官方命名股災分類。</p>';
  const first=rows[0]?.date,last=rows.at(-1)?.date;
  out+='<p class="fine">加權指數涵蓋：'+esc(first||'—')+' 至 '+esc(last||'—')+'；0050 價格：'+esc(cache.prices['0050'][0]?.date||'—')+'～'+esc(cache.prices['0050'].at(-1)?.date||'—')+'；006208 價格：'+esc(cache.prices['006208'][0]?.date||'—')+' 至 '+esc(cache.prices['006208'].at(-1)?.date||'—')+'。';
  if(mode!=='price')out+=' 配息檔涵蓋範圍：0050 '+esc(cache.dividends['0050'].coverageStart||'未標示')+' 起；006208 '+esc(cache.dividends['006208'].coverageStart||'未標示')+' 起。早於可核對配息範圍的總報酬可能不完整。';
  out+='</p>';target.innerHTML=out;
 }catch(e){target.innerHTML='<p class="alert">'+esc(e.message||String(e))+'</p>';}finally{if(btn)btn.disabled=false;}
}
async function runEntries(){
 const target=$('historyEntryResult'),btn=$('historyEntryRun');if(!target)return;
 const amount=Number($('historyCrashAmount')?.value),mode=$('historyCrashMode')?.value||'reinvest';
 const dates=['A','B','C'].map(k=>$('historyEntryDate'+k)?.value).filter(Boolean);
 if(!(amount>=1000)||!Number.isFinite(amount)){target.innerHTML='<p class="alert">投入金額至少為 1,000 元。</p>';return;}
 if(!dates.length||dates.some(d=>!dateOK(d))){target.innerHTML='<p class="alert">請至少輸入一個有效的進場日期。</p>';return;}
 if(btn)btn.disabled=true;target.innerHTML='<p class="fine">正在計算不同進場日期的後續回檔…</p>';
 try{
  await Promise.all(FUNDS.map(loadFund));
  let out='<div class="table-wrap"><table class="data-table"><thead><tr><th>輸入日期</th><th>實際模擬買入日</th><th>ETF</th><th class="num">進場後最大回檔</th><th>最大回檔區間</th><th class="num">低於本金最大幅度</th><th class="num">期末資產</th><th class="num">期末獲利</th><th class="num">總報酬率</th></tr></thead><tbody>';
  for(const start of dates)for(const code of FUNDS){
   const calc=simulate(code,start,amount,mode);if(!calc){out+='<tr><td>'+esc(start)+'</td><td colspan="8">無可用歷史行情</td></tr>';continue;}
   const risk=entryRisk(calc,amount),w=risk.worst;
   out+='<tr><td>'+esc(start)+'</td><td>'+esc(calc.start)+(calc.start!==start?'（順延）':'')+'</td><td><strong>'+code+'</strong></td><td class="num">'+(w?pct(-w.drawdown):'無回檔')+'</td><td>'+(w?esc(w.peak.date)+' → '+esc(w.trough.date):'—')+'</td><td class="num">'+pct(risk.belowCost)+'</td><td class="num">'+money(calc.assets)+' 元</td><td class="num" style="color:'+(calc.profit>=0?'#087e76':'#b44050')+'">'+(calc.profit>=0?'+':'')+money(calc.profit)+' 元</td><td class="num">'+pct(calc.return)+'</td></tr>';
  }
  out+='</tbody></table></div><p class="fine">進場後最大回檔是資產曲線相對前一個持有期間高點的最大跌幅；「低於本金最大幅度」則是最低資產相對原始投入的變化，兩者意義不同。'+(mode==='price'?'目前選擇純價格報酬，不含配息。':' 配息採網站收錄的歷史事件；早於配息資料涵蓋期間的結果可能不完整。')+'</p>';
  target.innerHTML=out;
 }catch(e){target.innerHTML='<p class="alert">'+esc(e.message||String(e))+'</p>';}finally{if(btn)btn.disabled=false;}
}
async function showHoldingPath(){
 const box=$('pathResult'),start=$('pathStart').value,capital=Number($('pathCapital').value);
 try{
 if(!start||!(capital>0)||!Number.isFinite(capital))throw Error('請輸入日期與正數本金');
 await loadIndex();
 const history=cache.index.rows;
 if(start<history[0].date||start>history.at(-1).date)throw Error('請選擇資料涵蓋期間內的日期');
 const rows=history.filter(r=>r.date>=start),value=r=>capital*r.close/rows[0].close;
 const vals=rows.map(value),lo=Math.min(...vals),hi=Math.max(...vals);
 const x=i=>10+680*i/Math.max(1,rows.length-1),y=v=>145-135*(v-lo)/(hi-lo||1);
 const points=vals.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ');
 const describe=i=>rows[i].date+'｜資產 '+money(vals[i])+' 元｜累積損益 '+money(vals[i]-capital)+' 元（'+pct(vals[i]/capital-1)+'）';
 box.innerHTML='<p>買入日 '+rows[0].date+'｜'+describe(rows.length-1)+'</p><svg id="pathPlot" viewBox="0 0 700 155" preserveAspectRatio="none" style="width:100%;height:180px" aria-label="每日模擬資產走勢"><polyline fill="none" stroke="#087e76" stroke-width="2" points="'+points+'"/></svg><label>逐日查看 <input style="width:100%" id="pathDay" type="range" min="0" max="'+(rows.length-1)+'" value="'+(rows.length-1)+'"></label><output id="pathRead"></output><details open><summary>逐年損益｜查看上漲與下跌年份</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>年末／最新日期</th><th>資產</th><th>當期損益</th><th>累積損益</th></tr></thead><tbody>'+rows.filter((r,i)=>i===rows.length-1||r.date.slice(0,4)!==rows[i+1].date.slice(0,4)).map((r,i,list)=>'<tr><td>'+r.date+'</td><td>'+money(value(r))+'</td><td>'+money(value(r)-(i?value(list[i-1]):capital))+'</td><td>'+money(value(r)-capital)+'</td></tr>').join('')+'</tbody></table></div></details>';
 const slider=$('pathDay'),read=()=>{$('pathRead').textContent=describe(Number(slider.value));};slider.oninput=read;read();
 $('pathPlot').onpointermove=e=>{const rect=e.currentTarget.getBoundingClientRect();slider.value=Math.round((((e.clientX-rect.left)/rect.width)*700-10)/680*(rows.length-1));read();};
 const episodes=findEpisodes(rows,.15);
 box.insertAdjacentHTML('beforeend','<details open><summary>持有期間回檔達 15% 的波段</summary>'+episodes.map(ep=>'<p>'+ep.peak.date+' 高點 '+money(value(ep.peak))+' 元 → '+ep.trough.date+' 低點 '+money(value(ep.trough))+' 元（'+pct(-ep.drawdown)+'），低點相對本金損益 '+money(value(ep.trough)-capital)+' 元。'+(ep.recovery?'收復前高日 '+ep.recovery:'截至資料日尚未收復前高')+'</p>').join('')+(episodes.length?'':'期間內無符合波段')+'</details>');
 }catch(err){box.textContent=err.message;}
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('button');if(!b)return;
 if(b.id==='pathRun'){showHoldingPath();return;}if(b.id==='historyCrashRun'||b.id==='historyCrashRefresh'){run();}if(b.id==='historyEntryRun'){runEntries();}
});
window.TradeCompassHistoricalCrash={html};
})();