/* Historical drawdown hold-through simulator for Taiwan index ETFs. */
(function(){
'use strict';
const FUNDS=['0050','006208'];
const splitEvents={ '0050':[{date:'2025-06-18',ratio:4}] };
const cache={prices:{},dividends:{}};
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
 const bars=cache.prices[code].filter(x=>x.date>=start);if(!bars.length)return null;
 const buy=bars[0],qty=Math.floor(amount/buy.close),leftover=amount-qty*buy.close;
 let shares=qty,cash=leftover,receivable=0,divGross=0,splitIndex=0,divIndex=0;
 const divs=mode==='price'?[]:cache.dividends[code].events.slice().sort((a,b)=>a.exDate.localeCompare(b.exDate));
 const splits=splitEvents[code]||[];
 const payments=[];
 for(const b of bars){
  while(splitIndex<splits.length&&splits[splitIndex].date<=b.date){const e=splits[splitIndex++];if(e.date>=start)shares*=e.ratio;}
  while(divIndex<divs.length&&divs[divIndex].exDate<=b.date){
   const d=divs[divIndex++];
   if(d.exDate>start){const value=shares*Number(d.amount);receivable+=value;divGross+=value;payments.push({...d,value,paid:false});}
  }
  for(const p of payments){if(!p.paid&&p.paymentDate<=b.date){p.paid=true;receivable-=p.value;cash+=p.value;p.reinvestDate=cache.prices[code].find(x=>x.date>p.paymentDate)?.date||null;}}
  if(mode==='reinvest'){
   const available=payments.some(p=>p.paid&&p.reinvestDate===b.date);
   if(available&&cash>=b.close){const bought=Math.floor(cash/b.close);shares+=bought;cash-=bought*b.close;}
  }
 }
 const last=bars[bars.length-1],assets=shares*last.close+cash+receivable;
 return {code,start:buy.date,end:last.date,buyPrice:buy.close,lastPrice:last.close,shares,cash,receivable,divGross,assets,profit:assets-amount,return:assets/amount-1};
}
function html(){
 return '<section class="panel" style="margin-top:18px;padding:22px 24px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap"><div><div class="eyebrow">LONG-TERM INVESTING HISTORY</div><h2 class="panel-title">歷史股災回顧區</h2><p class="subtitle">從 0050 歷史高點辨識大幅回檔，再模擬於高點投入、持有至最新收盤的結果。</p></div><button class="btn" id="historyCrashRefresh">讀取最新資料</button></div>'+
 '<div class="note-box mt16"><strong>模擬方式：</strong>以 0050 收盤價高點至後續低點辨識非重疊回檔；每次假設在該波段高點收盤投入相同金額，並持有至各 ETF 最新可用收盤日。可比較 0050 與 006208。股數以整股計算，剩餘預算及配息列為現金；0050 依 2025 年 1 拆 4 調整股數。</div>'+
 '<div class="filter-row" style="margin:16px 0"><label>投入金額（新臺幣）</label><input id="historyCrashAmount" class="field" type="number" min="1000" step="1000" value="100000" style="width:170px"><label>最低回檔幅度</label><select id="historyCrashThreshold" class="field"><option value="0.15" selected>15% 以上</option><option value="0.20">20% 以上</option><option value="0.25">25% 以上</option></select><label>報酬計算</label><select id="historyCrashMode" class="field"><option value="reinvest" selected>含息總報酬（配息再投入）</option><option value="cash">含息總報酬（配息留現金）</option><option value="price">純價格報酬（不含配息）</option></select><button id="historyCrashRun" class="btn primary">開始回顧</button></div>'+
 '<div id="historyCrashResult" aria-live="polite"><p class="fine">按「開始回顧」後，網站會讀取已發布的歷史價格與配息資料。</p></div>'+
 '<div class="note-box mt16"><strong>美股比較：</strong>本版先呈現網站已有可核對資料的台灣 ETF。美股 ETF 的歷史含息資料與匯率尚未納入，因此不顯示未驗證的 SPY／QQQ 績效；加入前需確認歷史還原收盤價與匯率來源。</div>'+
 '<p class="fine" style="margin-top:14px">資料來源：網站已發布的證交所 ETF 每日收盤價與配息檔案。回檔幅度依 0050 未還原收盤價計算；金額未計手續費、稅費及匯率。歷史表現不代表未來會以相同速度復原，也不構成投資建議。</p></section>';
}
async function run(){
 const target=$('historyCrashResult'),btn=$('historyCrashRun');
 if(!target)return;
 const amount=Number($('historyCrashAmount')?.value),threshold=Number($('historyCrashThreshold')?.value),mode=$('historyCrashMode')?.value||'reinvest';
 if(!(amount>=1000)||!Number.isFinite(amount)){target.innerHTML='<p class="alert">投入金額至少為 1,000 元。</p>';return;}
 if(btn)btn.disabled=true;
 target.innerHTML='<p class="fine">正在載入 0050、006208 歷史價格與配息資料…</p>';
 try{
  await Promise.all(FUNDS.map(loadFund));
  const episodes=findEpisodes(cache.prices['0050'],threshold);
  if(!episodes.length){target.innerHTML='<p class="fine">目前資料期間內沒有符合門檻的完整回檔。</p>';return;}
  let out='<p class="fine">回檔區間以 0050 高點至低點計算；每列列出同一高點買進、持有至該 ETF 最新資料日的試算。'+(episodes.some(e=>e.open)?' 最新一段仍在回檔中，尚未確認低點或復原時間。':'')+'</p>';
  out+='<div class="table-wrap"><table class="data-table"><thead><tr><th>回檔波段（以 0050 計）</th><th class="num">最大回檔</th><th>持有期間</th><th>ETF</th><th class="num">期末資產</th><th class="num">獲利金額</th><th class="num">總報酬率</th></tr></thead><tbody>';
  for(const ep of episodes){
   for(const code of FUNDS){
    const calc=simulate(code,ep.peak.date,amount,mode);
    if(!calc)continue;
    out+='<tr><td>'+esc(ep.peak.date)+' 高點 → '+esc(ep.trough.date)+' 低點'+(ep.open?'（進行中）':'')+'</td><td class="num">'+pct(-ep.drawdown)+'</td><td>'+esc(calc.start)+' 至 '+esc(calc.end)+(ep.recovery?'；0050 復原 '+esc(ep.recovery):'；0050 尚未收復前高')+'</td><td><strong>'+code+'</strong></td><td class="num">'+money(calc.assets)+' 元</td><td class="num" style="color:'+(calc.profit>=0?'#087e76':'#b44050')+'">'+(calc.profit>=0?'+':'')+money(calc.profit)+' 元</td><td class="num">'+pct(calc.return)+'</td></tr>';
   }
  }
  out+='</tbody></table></div><p class="fine">每次模擬投入 '+money(amount)+' 元；配息再投入按配息發放後首個交易日收盤價，以整股模擬，未用完現金保留。'+(mode==='price'?'本次為純價格報酬，不含配息。':'')+' 報酬率＝（期末資產－原始投入）÷原始投入。</p>';
  const first=cache.prices['0050'][0]?.date,last=cache.prices['0050'].at(-1)?.date;
  out+='<p class="fine">0050 價格涵蓋：'+esc(first||'—')+' 至 '+esc(last||'—')+'；006208：'+esc(cache.prices['006208'][0]?.date||'—')+' 至 '+esc(cache.prices['006208'].at(-1)?.date||'—')+'。';
  if(mode!=='price')out+=' 配息檔涵蓋範圍：0050 '+esc(cache.dividends['0050'].coverageStart||'未標示')+' 起；006208 '+esc(cache.dividends['006208'].coverageStart||'未標示')+' 起。早於可核對配息範圍的總報酬可能不完整。';
  out+='</p>';target.innerHTML=out;
 }catch(e){target.innerHTML='<p class="alert">'+esc(e.message||String(e))+'</p>';}
 finally{if(btn)btn.disabled=false;}
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('button');if(!b)return;
 if(b.id==='historyCrashRun'||b.id==='historyCrashRefresh'){run();}
});
window.TradeCompassHistoricalCrash={html};
})();