/* Trade Compass v1.6.9 | axis charts, split markers, dividend reload, daily mark-to-market, verified CSV fallback. */
(function(){'use strict';
const ETF=['0050','006208','009816'];
const KEY='trade-compass-index-etf-investments-v161'; // preserve existing investment data
const DIV_KEY='trade-compass-index-etf-local-dividends-v168';
const PRICE_KEY='trade-compass-index-etf-local-prices-v164'; // local historical backfill, never published automatically
const SPLITS={'0050':[{'date':'2025-06-18','ratio':4}]};
let store={};try{store=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
const pricesCache={},dividendsCache={},coverageCache={},errors={},pending={};let activeFund='0050';
let localPrices={};try{localPrices=JSON.parse(localStorage.getItem(PRICE_KEY)||'{}')||{};}catch{}
let localDividends={};try{localDividends=JSON.parse(localStorage.getItem(DIV_KEY)||'{}')||{};}catch{}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sgn=(v,d=0)=>Number.isFinite(v)?(v>0?'+':'')+num(v,d):'—';
const dateValid=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){console.warn('Cannot save ETF simulator',e);}};
const refresh=()=>{if(window.TradeCompassBridge?.isPage?.('indexETF'))window.TradeCompassBridge.render();};
const lots=fund=>Array.isArray(store[fund])?store[fund]:[];
function updateLots(fund,x){store[fund]=x;persist();refresh();}
function parsePrices(payload,code){if(payload?.etf!==code||!Array.isArray(payload.rows))throw Error('歷史價格檔案格式錯誤');const m=new Map();for(const r of payload.rows){const [d,c]=Array.isArray(r)?r:[r.date,r.close];const price=Number(c);if(dateValid(d)&&Number.isFinite(price)&&price>0)m.set(d,{date:d,close:price});}return [...m.values()].sort((a,b)=>a.date.localeCompare(b.date));}
function mergeLocalPrices(code,official){
 // Verified TWSE prices always take priority over locally imported gap rows.
 const merged=new Map(official.map(r=>[r.date,{...r,origin:'official'}]));
 for(const r of localPrices[code]||[]){
   if(!merged.has(r.date)&&dateValid(r.date)&&Number.isFinite(Number(r.close))&&Number(r.close)>0)
    merged.set(r.date,{date:r.date,close:Number(r.close),origin:'local'});
 }
 return [...merged.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function parseLocalCsv(csv,code){
 const lines=String(csv||'').replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const result=new Map();let rejected=0;
 for(const line of lines){
  const cells=line.split(',').map(c=>c.trim().replace(/^"|"$/g,''));
  if(cells[0]?.toLowerCase()==='date'||cells[0]?.toLowerCase()==='etf')continue;
  const d=cells.length>=3&&/^\d{4,6}[a-z]?$/i.test(cells[0])?cells[1]:cells[0];
  const value=cells.length>=3&&/^\d{4,6}[a-z]?$/i.test(cells[0])?cells[2]:cells[1];
  const rowCode=cells.length>=3&&/^\d{4,6}[a-z]?$/i.test(cells[0])?cells[0]:code;
  const price=Number(value);
  if(rowCode!==code||!dateValid(d)||!(price>0)||price>100000||d>new Date().toISOString().slice(0,10)){rejected++;continue;}
  result.set(d,{date:d,close:price});
 }
 return {rows:[...result.values()].sort((a,b)=>a.date.localeCompare(b.date)),rejected};
}
function saveLocalCsv(code,csv){
 const {rows,rejected}=parseLocalCsv(csv,code);
 if(!rows.length)throw Error('沒有通過驗證的日期與收盤價；請使用 date,close 或 etf,date,close 格式');
 const current=new Map((localPrices[code]||[]).map(x=>[x.date,x]));
 rows.forEach(r=>current.set(r.date,r));
 localPrices[code]=[...current.values()].sort((a,b)=>a.date.localeCompare(b.date));
 try{localStorage.setItem(PRICE_KEY,JSON.stringify(localPrices));}catch{throw Error('瀏覽器儲存空間不足，無法保存手動歷史資料');}
 refresh();return {added:rows.length,rejected,total:localPrices[code].length};
}
function monthSchedule(rule){
 if(!rule||!(Number(rule.amount)>0)||!dateValid(rule.from)||!dateValid(rule.to)||rule.from>rule.to)return [];
 const day=Math.max(1,Math.min(31,Number(rule.day)||1)),out=[];
 let [y,m]=rule.from.split('-').map(Number);const [ey,em]=rule.to.split('-').map(Number);
 while(y<ey||(y===ey&&m<=em)){
  const lastDay=new Date(Date.UTC(y,m,0)).getUTCDate();
  const date=`${y}-${String(m).padStart(2,'0')}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
  if(date>=rule.from&&date<=rule.to)out.push({date,amount:Number(rule.amount),kind:'dca'});
  if(++m>12){m=1;y++;}
  if(out.length>1500)break;
 }
 return out;
}
function missingMonths(prices,code){
 if(!prices.length)return [];
 const start={'0050':'2003-06','006208':'2012-07','009816':'2026-02'}[code];
 const all=new Set(prices.map(r=>r.date.slice(0,7)));
 const now=new Date().toISOString().slice(0,7);let [y,m]=start.split('-').map(Number),missing=[];
 while(`${y}-${String(m).padStart(2,'0')}`<=now){
   const k=`${y}-${String(m).padStart(2,'0')}`;
   if(!all.has(k))missing.push(k);
   if(++m>12){m=1;y++;}
 }
 return missing;
}
function parseDividends(payload,code){if(payload?.etf!==code||!Array.isArray(payload.events))throw Error('配息檔案格式錯誤');const seen=new Set(),out=[];for(const e of payload.events){if(!dateValid(e.exDate)||!dateValid(e.paymentDate)||e.paymentDate<e.exDate||!(Number(e.amount)>0)||seen.has(e.exDate))continue;seen.add(e.exDate);out.push({exDate:e.exDate,paymentDate:e.paymentDate,amount:Number(e.amount)});}return out.sort((a,b)=>a.exDate.localeCompare(b.exDate));}
function parseLocalDividendCsv(csv,code){
 if(code==='009816')throw Error('009816 不分配收益，不接受現金配息匯入');
 const rows=String(csv||'').replace(/^\uFEFF/,'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean),events=[],bad=[];
 for(let i=0;i<rows.length;i++){
  const cols=rows[i].split(',').map(v=>v.trim().replace(/^"|"$/g,''));
  if(i===0&&/exdate|除息日/i.test(cols[0]))continue;
  if(cols.length!==3||!dateValid(cols[0])||!dateValid(cols[1])||cols[1]<cols[0]||!(Number(cols[2])>0)||!Number.isFinite(Number(cols[2])))bad.push(i+1);
  else events.push({exDate:cols[0],paymentDate:cols[1],amount:Number(cols[2])});
 }
 if(bad.length)throw Error('配息 CSV 存在不合格列：'+bad.slice(0,8).join('、'));
 if(!events.length)throw Error('CSV 沒有有效配息事件');
 const keys=new Set();for(const e of events){if(keys.has(e.exDate))throw Error('同一除息日重複：'+e.exDate);keys.add(e.exDate);}
 return events.sort((a,b)=>a.exDate.localeCompare(b.exDate));
}
function effectiveDividends(code){
 if(code==='009816')return dividendsCache[code]||{events:[],distributionPolicy:'none'};
 const official=dividendsCache[code];const manual=localDividends[code]||[];
 if(!official&&!manual.length)return null;
 const all=new Map(manual.map(x=>[x.exDate,x]));
 for(const x of official?.events||[])all.set(x.exDate,x); // published official entries win
 return {...(official||{}),events:[...all.values()].sort((a,b)=>a.exDate.localeCompare(b.exDate)),manualCount:manual.length,sourceStatus:official?'official-plus-local':'local-only'};
}

// TC_ETF_DIVIDEND_FALLBACK_V174: missing GitHub Pages assets may still exist in
// the public source repository. This is a read-only fallback, never estimated data.
async function getVerifiedDividendArchive(code){
 const path='data/index-etf/dividends/'+code+'.json';
 const urls=[path+'?t='+Date.now(),
  'https://raw.githubusercontent.com/tony71015-sudo/stock-tracker/main/'+path+'?t='+Date.now()];
 const problems=[];
 for(let i=0;i<urls.length;i++){
  try{
   const response=await fetch(urls[i],{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const raw=await response.json();
   const events=parseDividends(raw,code);
   if(!events.length)throw Error('沒有通過日期與金額驗證的配息紀錄');
   return {raw,events,repoFallback:i===1};
  }catch(e){problems.push((i===0?'GitHub Pages':'GitHub 原始碼')+': '+e.message);}
 }
 throw Error(problems.join('；'));
}

async function load(code){if(!ETF.includes(code)||pending[code])return;pending[code]=true;try{
 if(!pricesCache[code]){const r=await fetch('data/index-etf/prices/'+code+'.json?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('股價 HTTP '+r.status);pricesCache[code]=parsePrices(await r.json(),code);}
 if(code==='006208'&&!coverageCache[code]){try{const r=await fetch('data/index-etf/prices/006208.coverage.json?ts='+Date.now(),{cache:'no-store'});coverageCache[code]=r.ok?await r.json():{error:'網站未發布 006208.coverage.json（HTTP '+r.status+'）'};}catch(e){coverageCache[code]={error:'回補統計讀取失敗：'+e.message};}}
 if(code==='009816'){dividendsCache[code]={events:[],coverageStart:'2026-02-03',asOf:null,distributionPolicy:'none'};delete errors[code+'_div'];}
 else try{const {raw,events,repoFallback}=await getVerifiedDividendArchive(code);dividendsCache[code]={events,coverageStart:raw.coverageStart||null,firstEventDate:raw.firstEventDate||null,lastEventDate:raw.lastEventDate||null,asOf:raw.asOf||null,sourceUrl:raw.sourceUrl||null,verificationStatus:raw.verificationStatus||'not-fully-verified',repoFallback};
 if(repoFallback)errors[code+'_div']='GitHub Pages 配息檔案未正常發布，暫時從公開 GitHub 原始碼讀取。資料仍應核對投信／證交所；請修復網站部署。';
 else delete errors[code+'_div'];}
 catch(e){errors[code+'_div']='公開配息檔案讀取失敗（'+e.message+'）。可匯入經核對的配息 CSV；未驗證前不顯示含息收益。';}
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
 let orderIndex=0,splitIndex=0,exIndex=0,lastDate='';const payments=[],events=[],divEvents=[],series=[],skippedGaps=[];
 let best=null,worst=null, bestRate=null,worstRate=null;
 const fee=Number(feePct)/100;if(!Number.isFinite(fee)||fee<0||fee>0.05)return null;
 for(const b of bars){const date=b.date,price=Number(b.close);
  // Corporate actions precede any purchases simulated at today's closing price.
  while(splitIndex<splits.length&&splits[splitIndex].date<=date){const e=splits[splitIndex++];if(!lastDate||lastDate<e.date){const before=shares;shares*=e.ratio;if(before>0)events.push({kind:'split',date:e.date,shares:shares-before,ratio:e.ratio,price,paid:0});}}
  while(exIndex<divs.length&&divs[exIndex].exDate<=date){const d=divs[exIndex++];if(!lastDate||lastDate<d.exDate){const amount=shares*d.amount;dividendGross+=amount;receivable+=amount;payments.push({...d,gross:amount,paid:false});divEvents.push({kind:'ex',date:d.exDate,amount,shares});}}
  for(const p of payments){if(!p.paid&&p.paymentDate<=date){p.paid=true;receivable-=p.gross;dividendCash+=p.gross;dividendsPaid+=p.gross;divEvents.push({kind:'payment',date:p.paymentDate,amount:p.gross});p.availableReinvestDate=nextDateAfter(p.paymentDate,bars);}}
  while(orderIndex<scheduled.length&&scheduled[orderIndex].date<=date){const v=scheduled[orderIndex++];if((Date.parse(date+'T00:00:00Z')-Date.parse(v.date+'T00:00:00Z'))/86400000>10){skippedGaps.push(v);continue;}const requested=Number(v.amount),qty=Math.floor(requested/(price*(1+fee))+1e-9);const paid=qty*price*(1+fee);externalPaid+=paid;bookCost+=paid;unused+=requested-paid;shares+=qty;events.push({kind:'purchase',source:v.kind==='dca'?'dca':'single',requestedDate:v.date,date,requested,shares:qty,price,paid,fee:qty*price*fee});}
  if(mode==='reinvest'&&dividendCash>0&&payments.some(p=>p.availableReinvestDate===date)){
   const qty=Math.floor(dividendCash/(price*(1+fee))+1e-9);if(qty>0){const paid=qty*price*(1+fee);shares+=qty;bookCost+=paid;reinvestPaid+=paid;reinvestFees+=paid-qty*price;dividendCash-=paid;events.push({kind:'reinvest',date,requested:paid,shares:qty,price,paid,fee:paid-qty*price});}
  }
  lastDate=date;
  if(externalPaid>0){const value=shares*price;const pricePnl=value-bookCost;const totalPnl=mode==='price'?value-externalPaid:value+dividendCash+receivable-externalPaid;
   const totalAssets=mode==='price'?value:value+dividendCash+receivable;const pct=externalPaid?100*totalPnl/externalPaid:0;
   const snap={date,close:price,shares,externalPaid,bookCost,value,pricePnl,totalPnl,pnl:totalPnl,pct,cash:dividendCash,receivable,totalAssets,dividendGross};series.push(snap);
   if(!best||snap.pnl>best.pnl)best=snap;if(!worst||snap.pnl<worst.pnl)worst=snap;
   if(!bestRate||snap.pct>bestRate.pct)bestRate=snap;if(!worstRate||snap.pct<worstRate.pct)worstRate=snap;
  }
 }
 const latest=series.at(-1)||null;return {events,divEvents,series,latest,best,worst,bestRate,worstRate,
  ignored,skippedGaps,notYet:scheduled.slice(orderIndex),unused,externalPaid,bookCost,dividendGross,dividendCash,receivable,reinvestPaid,reinvestFees,dividendsPaid,
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
// Two independent axis-based charts; raw price chart intentionally shows split gaps.
function chartPanel(series,key,title,color,unit,fund){
 const W=900,H=282,left=92,right=30,top=32,bottom=48,pw=W-left-right,ph=H-top-bottom;
 const values=series.map(s=>Number(s[key]));const min=Math.min(...values),max=Math.max(...values);
 const padding=Math.max((max-min)*0.08,Math.abs(max)*0.02,0.05);
 const lo=min-padding,hi=max+padding;const x=i=>left+i*pw/(series.length-1),y=v=>top+(hi-v)*ph/(hi-lo);
 const points=values.map((v,i)=>`${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
 let g=`<div style="overflow-x:auto;margin:14px 0 22px"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}，有日期及數值刻度，滑鼠移入顯示每日數據" style="width:100%;min-width:580px"><text x="${left}" y="18" font-size="14" font-weight="600" fill="currentColor">${esc(title)}（${esc(unit)}）</text>`;
 for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,yy=y(v);g+=`<line x1="${left}" x2="${W-right}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="currentColor" stroke-opacity="0.12"/><text x="${left-9}" y="${(yy+4).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor">${esc(num(v,key==='close'?2:0))}</text>`;}
 const ticks=[...new Set([0,Math.floor((series.length-1)/4),Math.floor((series.length-1)/2),Math.floor(3*(series.length-1)/4),series.length-1])];
 for(const i of ticks){const xx=x(i);g+=`<line x1="${xx.toFixed(1)}" x2="${xx.toFixed(1)}" y1="${top+ph}" y2="${top+ph+5}" stroke="currentColor" stroke-opacity=".5"/><text x="${xx.toFixed(1)}" y="${H-24}" text-anchor="middle" font-size="11" fill="currentColor">${esc(series[i].date.slice(2))}</text>`;}
 if(fund==='0050')for(const split of SPLITS['0050']){
  const idx=series.findIndex(s=>s.date>=split.date);if(idx>0&&idx<series.length){const xx=x(idx);g+=`<line x1="${xx.toFixed(1)}" x2="${xx.toFixed(1)}" y1="${top}" y2="${top+ph}" stroke="#c2410c" stroke-dasharray="5 4" stroke-width="2"/><text x="${Math.min(W-right-8,xx+7).toFixed(1)}" y="${top+15}" text-anchor="${xx>W-200?'end':'start'}" font-size="11" font-weight="600" fill="#c2410c">${esc(split.date)}｜1 拆 ${split.ratio}</text>`;}
 }
 g+=`<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${points}"/>`;
 // Each narrow transparent hit-area exposes the exact data even without JS chart libraries.
 const hitWidth=Math.max(1.5,Math.min(18,pw/(series.length-1)));
 for(let i=0;i<series.length;i++){
  const s=series[i],val=values[i];g+=`<rect x="${(x(i)-hitWidth/2).toFixed(2)}" y="${top}" width="${hitWidth.toFixed(2)}" height="${ph}" fill="transparent" pointer-events="all"><title>${esc(s.date)}｜${esc(title)}：${esc(num(val,2))} ${esc(unit)}${key==='pnl'?`｜持股 ${esc(num(s.shares,4))} 股｜投入 ${esc(num(s.externalPaid,2))} 元`:''}</title></rect>`;
 }
 g+=`<text x="${left+pw/2}" y="${H-5}" text-anchor="middle" font-size="11" fill="currentColor">日期（年-月-日）｜滑鼠移至折線區域查看每日值</text></svg></div>`;return g;
}

// TC_ETF_INVESTMENT_CURVE_V174: plot actual filled external purchases,
// portfolio liquidation value, and running profit using the SAME compute() snapshots.
// This is NOT a historic backtest with fixed capital: each purchase changes paid capital.
function investmentCapitalChart(series){
 if(!Array.isArray(series)||series.length<2)return '';
 const source=series.filter(s=>Number.isFinite(s.externalPaid)&&Number.isFinite(s.totalAssets)&&Number.isFinite(s.totalPnl));
 if(source.length<2)return '';
 // Chart at most 900 observations while preserving EVERY capital change if possible.
 const budget=900,picked=new Set([0,source.length-1]);
 for(let i=1;i<source.length;i++)if(source[i].externalPaid!==source[i-1].externalPaid)picked.add(i);
 for(let i=0;i<budget;i++)picked.add(Math.round(i*(source.length-1)/(budget-1)));
 let points=[...picked].sort((a,b)=>a-b).map(i=>source[i]);
 if(points.length>1600){
   // Keep every 5th marker plus first and last; full-fidelity values remain in compute().
   const reduced=points.filter((_,i)=>i===0||i===points.length-1||i%Math.ceil(points.length/1400)===0);
   points=reduced;
 }
 const W=940,H=326,L=102,R=22,T=36,B=64,PW=W-L-R,PH=H-T-B;
 const curves=[
  {key:'externalPaid',label:'累積實際投入本金',color:'#2563eb'},
  {key:'totalAssets',label:'投資組合總價值',color:'#0d9488'},
  {key:'totalPnl',label:'累積總損益',color:'#ea580c'}
 ];
 const all=points.flatMap(p=>curves.map(c=>p[c.key]));
 let lo=Math.min(0,...all),hi=Math.max(0,...all);
 if(hi===lo){hi+=1;lo-=1;}
 const pad=Math.max((hi-lo)*0.06,1);lo-=pad;hi+=pad;
 const x=i=>L+i*PW/(points.length-1),y=v=>T+(hi-v)*PH/(hi-lo);
 let out=`<div class="tc-compare-chart" style="margin:20px 0 24px;padding:14px;border:1px solid var(--border,#d9e3e8);border-radius:14px"><h3 style="margin:0 0 7px">投資本金、資產價值與累積收益曲線（依輸入紀錄）</h3><p class="fine">藍線＝實際已成交投入本金；綠線＝持股市值＋已認列現金／應收股息（僅在有效配息模式計入）；橘線＝累積損益。追加買入會同時增加投入本金與資產，不等於當日賺取收益。滑鼠移入查看數值。</p><div style="display:flex;flex-wrap:wrap;gap:14px;font-size:13px">${curves.map(c=>`<span><span style="color:${c.color};font-weight:800">━</span> ${c.label}</span>`).join('')}</div><div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="累積投入本金、資產價值、累積損益，含日期軸、金額軸及逐點提示" style="width:100%;min-width:600px">`;
 for(let j=0;j<=5;j++){
  const v=lo+(hi-lo)*j/5, yy=y(v);
  out+=`<line x1="${L}" x2="${W-R}" y1="${yy.toFixed(2)}" y2="${yy.toFixed(2)}" stroke="currentColor" stroke-opacity=".13"/><text x="${L-8}" y="${(yy+4).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor">${esc(num(v,0))}</text>`;
 }
 for(const i of [...new Set([0,Math.round((points.length-1)/4),Math.round((points.length-1)/2),Math.round(3*(points.length-1)/4),points.length-1])]){
  out+=`<text x="${x(i).toFixed(1)}" y="${H-34}" text-anchor="middle" font-size="11" fill="currentColor">${esc(points[i].date.slice(2))}</text>`;
 }
 for(const c of curves){
  const coords=points.map((p,i)=>`${x(i).toFixed(2)},${y(p[c.key]).toFixed(2)}`).join(' ');
  out+=`<polyline fill="none" stroke="${c.color}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round" points="${coords}"/>`;
 }
 // Narrow, transparent hit rectangles work without a chart dependency.
 const hitW=Math.max(1.2,Math.min(15,PW/(points.length-1)));
 for(let i=0;i<points.length;i++){
  const p=points[i];
  const tip=`${p.date}｜累積投入 ${num(p.externalPaid,2)} 元｜投資組合價值 ${num(p.totalAssets,2)} 元｜累積收益 ${sgn(p.totalPnl,2)} 元｜累積報酬 ${sgn(p.pct,2)}%`;
  out+=`<rect x="${(x(i)-hitW/2).toFixed(2)}" y="${T}" width="${hitW.toFixed(2)}" height="${PH}" fill="transparent" pointer-events="all"><title>${esc(tip)}</title></rect>`;
 }
 const end=source.at(-1);
 out+=`<text x="${L+PW/2}" y="${H-7}" text-anchor="middle" font-size="11" fill="currentColor">日期（交易日）｜各線共用新臺幣金額刻度</text></svg></div><p class="fine">截至 ${esc(end.date)}：實際投入 ${num(end.externalPaid,2)} 元；投資組合價值 ${num(end.totalAssets,2)} 元；累積收益 ${sgn(end.totalPnl,2)} 元。股息資料缺失時只顯示純價格收益，不假設股息為零；未成交預算不列為投入。</p></div>`;
 return out;
}

function chart(series,fund){if(series.length<2)return '<p class="fine">至少需要兩個交易日才可繪圖。</p>';
 return chartPanel(series,'close','ETF 原始收盤價','#0f9f91','元／股',fund)
  +chartPanel(series,'pnl','投資組合總損益','#d97706','新臺幣元',fund)
  +investmentCapitalChart(series)
  +(fund==='0050'?'<p class="fine">橘色虛線為 0050 於 2025-06-18 的 1 拆 4 分割日。上圖使用未還原原始收盤價，因此會出現價格斷層；下圖已按分割後持股增加調整，不應將分割價格落差視為實際虧損。</p>':'');
}
const metric=(label,val)=>`<div class="panel metric" style="padding:14px"><div class="metric-label">${esc(label)}</div><div class="metric-value" style="font-size:20px">${esc(val)}</div></div>`;

const PROJ_KEY='trade-compass-index-etf-projection-v1';
const projectionGraphs={};
function projectionConfig(fund){
 let all={};try{all=JSON.parse(localStorage.getItem(PROJ_KEY)||'{}')||{};}catch{}
 const x=all[fund]||{};
 return {initial:Math.max(0,Number(x.initial??100000)),monthly:Math.max(0,Number(x.monthly??3000)),annual:Math.max(0,Number(x.annual??0)),years:Math.max(1,Math.min(40,Number(x.years??40))),reinvest:x.reinvest!==false};
}
function projectionScenario(cfg,rate){
 const monthlyRate=Math.pow(1+rate,1/12)-1;
 let principal=cfg.initial,portfolio=cfg.initial,cashReturns=0;
 const rows=[{year:0,capital:principal,assets:portfolio,profit:0}];
 for(let month=1;month<=cfg.years*12;month++){
  if(cfg.reinvest)portfolio*=1+monthlyRate;
  else cashReturns+=principal*monthlyRate;
  principal+=cfg.monthly;
  if(cfg.reinvest)portfolio+=cfg.monthly;
  if(month%12===0){
   principal+=cfg.annual;
   if(cfg.reinvest)portfolio+=cfg.annual;
   if(!cfg.reinvest)cashReturns+=0;
   const assets=cfg.reinvest?portfolio:principal+cashReturns;
   rows.push({year:month/12,capital:principal,assets,profit:assets-principal});
  }
 }
 return rows;
}
function projectionPanel(prices,fund){
 const cfg=projectionConfig(fund),rates=[.03,.07,.10],series=rates.map(rate=>projectionScenario(cfg,rate));projectionGraphs[fund]={years:cfg.years,series};
 const colors=['#2563eb','#0d9488','#ea580c'],labels=['保守 3%','中性 7%','較高 10%'];
 const width=900,height=300,left=94,right=24,top=34,bottom=58,pw=width-left-right,ph=height-top-bottom;
 const maxProfit=Math.max(1,...series.flatMap(a=>a.map(x=>x.profit))),minProfit=Math.min(0,...series.flatMap(a=>a.map(x=>x.profit)));
 const y=v=>top+(maxProfit-v)*ph/(maxProfit-minProfit||1),x=i=>left+i*pw/cfg.years;
 let svg='<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="依年數比較三種年化總報酬率的預估累積獲利金額" style="width:100%;min-width:560px">';
 for(let j=0;j<=4;j++){const v=minProfit+(maxProfit-minProfit)*j/4,yy=y(v);svg+='<line x1="'+left+'" x2="'+(width-right)+'" y1="'+yy.toFixed(1)+'" y2="'+yy.toFixed(1)+'" stroke="currentColor" stroke-opacity=".13"/><text x="'+(left-8)+'" y="'+(yy+4).toFixed(1)+'" text-anchor="end" font-size="11" fill="currentColor">'+esc(num(v,0))+'</text>';}
 const ticks=[...new Set([0,Math.max(1,Math.round(cfg.years/4)),Math.max(1,Math.round(cfg.years/2)),Math.max(1,Math.round(cfg.years*3/4)),cfg.years])];
 ticks.forEach(year=>{const xx=x(year);svg+='<text x="'+xx.toFixed(1)+'" y="'+(height-35)+'" text-anchor="middle" font-size="11" fill="currentColor">'+year+' 年</text>';});
 series.forEach((rows,k)=>{const pts=rows.slice(1).map(r=>x(r.year).toFixed(2)+','+y(r.profit).toFixed(2)).join(' ');if(pts)svg+='<polyline fill="none" stroke="'+colors[k]+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="'+pts+'"/>';rows.slice(1).forEach(r=>{svg+='<circle cx="'+x(r.year).toFixed(2)+'" cy="'+y(r.profit).toFixed(2)+'" r="2.8" fill="'+colors[k]+'"><title>'+r.year+' 年｜'+labels[k]+'｜預估獲利 '+num(r.profit,0)+' 元｜投入 '+num(r.capital,0)+' 元｜資產 '+num(r.assets,0)+' 元</title></circle>';});});
 svg+='<text x="'+(left+pw/2)+'" y="'+(height-7)+'" text-anchor="middle" font-size="11" fill="currentColor">投資期間（年）</text></svg>';
 const marks=[1,3,5,7,10,15,20,30,40].filter(y=>y<=cfg.years);
 if(!marks.includes(cfg.years))marks.push(cfg.years);
 const tableRows=marks.map(year=>{const row=series.map(s=>s[year]);return '<tr><td>'+year+' 年</td><td class="num">'+num(row[1].capital,0)+'</td><td class="num">'+sgn(row[0].profit,0)+'</td><td class="num">'+sgn(row[1].profit,0)+'</td><td class="num">'+sgn(row[2].profit,0)+'</td></tr>';}).join('');
 const latest=prices?.at(-1);
 let out='<details open style="margin:18px 0;padding:16px;border:1px solid #dce8eb;border-radius:14px;background:#f9fcfc"><summary style="cursor:pointer;font-size:16px;font-weight:850">快速情境試算｜設定投入方式，看不同年數的預估獲利</summary>';
 out+='<p class="fine">先輸入起始金額、每月投入與每年加碼；折線直接比較 3%、7%、10% 三種年化總報酬假設。這是情境估算，不是報酬保證。</p>';
 out+='<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px;margin:14px 0">';
 out+='<label class="panel" style="padding:12px">① 起始投入（元）<input id="idxProjInitial" type="number" min="0" step="1000" class="field" style="display:block;width:100%;margin-top:7px" value="'+cfg.initial+'"></label>';
 out+='<label class="panel" style="padding:12px">② 每月投入（元）<input id="idxProjMonthly" type="number" min="0" step="500" class="field" style="display:block;width:100%;margin-top:7px" value="'+cfg.monthly+'"></label>';
 out+='<label class="panel" style="padding:12px">③ 每年額外加碼（元）<input id="idxProjAnnual" type="number" min="0" step="1000" class="field" style="display:block;width:100%;margin-top:7px" value="'+cfg.annual+'"></label>';
 out+='<label class="panel" style="padding:12px">④ 試算年數（1–40 年）<input id="idxProjYears" type="number" min="1" max="40" step="1" class="field" style="display:block;width:100%;margin-top:7px" value="'+cfg.years+'"></label></div>';
 out+='<label style="display:inline-flex;align-items:center;gap:8px;margin:2px 0 12px"><input id="idxProjReinvest" type="checkbox" '+(cfg.reinvest?'checked':'')+'> 將投資收益再投入，採複利估算</label> ';
 out+='<button id="idxProjectionRun" class="btn primary">更新情境圖表</button>';
 out+='<p class="fine">複利勾選時，假設收益持續再投入；取消時，收益留作現金，不再產生後續報酬。每月投入於月末加入、年度加碼於年末加入。年化報酬率視為總報酬假設，已包含配息影響；實際配息與 0050 分割則在下方歷史試算中依事件計算。';
 if(latest)out+=' 目前 '+esc(fund)+' 最近收盤 '+num(Number(latest.close),2)+' 元（'+esc(latest.date)+'），僅供價格參考。';
 out+='</p><div style="display:flex;flex-wrap:wrap;gap:12px;margin:12px 0">'+labels.map((t,i)=>'<span><b style="color:'+colors[i]+'">━</b> '+t+' 年化總報酬</span>').join('')+'</div><div id="idxProjChartWrap" style="position:relative;overflow-x:auto"><div id="idxProjTooltip" style="display:none;position:absolute;z-index:4;pointer-events:none;min-width:220px;padding:10px 12px;border-radius:9px;background:#102b3a;color:white;box-shadow:0 5px 18px #102b3a45;font-size:12px;line-height:1.7"></div>'+svg.replace('<svg viewBox=','<svg id="idxProjChart" viewBox=')+'</div>';
 out+='<div class="table-wrap"><table class="data-table"><thead><tr><th>期間</th><th class="num">累積投入本金</th><th class="num">獲利｜3%</th><th class="num">獲利｜7%</th><th class="num">獲利｜10%</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>';
 out+='<p class="fine">圖線與表格顯示「資產總值－累積投入本金」的預估獲利金額。未計通膨、稅費、交易成本，也不代表未來實際走勢。</p></details>';
 return out;
}


function comparePanel(){
 let out='<details id="idxComparePanel" style="margin:18px 0;padding:14px;border:1px solid #dce8eb;border-radius:14px"><summary style="cursor:pointer;font-size:15px;font-weight:850">同期間比較｜勾選 ETF，以相同日期與投入金額比較歷史結果</summary>';
 out+='<p class="fine">共用上方的起始投入、每月投入與每年加碼金額；空白起始日代表使用所選 ETF 都有資料的最早共同交易日。若選入 009816，能比較的期間會從它上市後開始。</p>';
 out+='<div class="filter-row" style="margin:10px 0"><label><input type="checkbox" data-idx-compare="0050" checked> 0050 元大台灣50</label><label><input type="checkbox" data-idx-compare="006208" checked> 006208 富邦台50</label><label><input type="checkbox" data-idx-compare="009816"> 009816 凱基台灣TOP50</label>';
 out+='<label>報酬模式</label><select id="idxCompareMode" class="field"><option value="price">純價格損益（不含配息）</option><option value="cash">含息總報酬（股息留現金）</option><option value="reinvest">含息總報酬（股息再投入）</option></select>';
 out+='<label>共同起始日</label><input id="idxCompareStart" type="date" class="field"><button id="idxCompareRun" class="btn primary">比較所選 ETF</button></div>';
 out+='<div id="idxCompareResult" aria-live="polite"></div></details>';return out;
}
function compareChart(dates,results,codes){
 const colors={'0050':'#0d9488','006208':'#2563eb','009816':'#ea580c'},W=900,H=310,L=98,R=25,T=32,B=52,PW=W-L-R,PH=H-T-B;
 const rows=dates.map(date=>({date,values:codes.map(code=>results[code].map.get(date)).filter(Boolean)})).filter(x=>x.values.length===codes.length);
 if(rows.length<2)return '<p class="fine">共同有效交易日不足，無法繪製比較線。</p>';
 const vals=rows.flatMap(r=>r.values.map(v=>v.totalPnl)),lo=Math.min(0,...vals),hi=Math.max(1,...vals),y=v=>T+(hi-v)*PH/(hi-lo||1),x=i=>L+i*PW/(rows.length-1);
 let out='<div style="overflow-x:auto"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="所選指數型 ETF 同日同額投入之歷史損益比較線圖" style="width:100%;min-width:560px">';
 for(let j=0;j<=4;j++){const v=lo+(hi-lo)*j/4,yy=y(v);out+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+yy.toFixed(1)+'" y2="'+yy.toFixed(1)+'" stroke="currentColor" stroke-opacity=".13"/><text x="'+(L-8)+'" y="'+(yy+4).toFixed(1)+'" text-anchor="end" font-size="11" fill="currentColor">'+esc(num(v,0))+'</text>';}
 const ticks=[...new Set([0,Math.floor((rows.length-1)/4),Math.floor((rows.length-1)/2),Math.floor(3*(rows.length-1)/4),rows.length-1])];
 for(const i of ticks)out+='<text x="'+x(i).toFixed(1)+'" y="'+(H-25)+'" text-anchor="middle" font-size="11" fill="currentColor">'+esc(rows[i].date)+'</text>';
 codes.forEach(code=>{const p=rows.map((r,i)=>x(i).toFixed(1)+','+y(r.values[codes.indexOf(code)].totalPnl).toFixed(1)).join(' ');out+='<polyline fill="none" stroke="'+colors[code]+'" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" points="'+p+'"/>';});
 const step=Math.max(1,Math.floor(rows.length/240));
 for(let i=0;i<rows.length;i+=step){const r=rows[i];codes.forEach((code,j)=>{const v=r.values[j];out+='<circle cx="'+x(i).toFixed(1)+'" cy="'+y(v.totalPnl).toFixed(1)+'" r="2.7" fill="'+colors[code]+'"><title>'+esc(code)+'｜'+esc(r.date)+'｜投入 '+num(v.externalPaid,0)+' 元｜獲利 '+sgn(v.totalPnl,0)+' 元｜資產 '+num(v.totalAssets,0)+' 元</title></circle>';});}
 out+='</svg></div><p class="fine">將滑鼠移到線上圓點可查看該日投入本金、獲利及資產總額。</p>';return out;
}
async function runIndexEtfComparison(codes,startInput,cfg,mode){
 await Promise.all(codes.map(code=>load(code)));
 const lists={};for(const code of codes){const p=mergeLocalPrices(code,pricesCache[code]||[]).filter(r=>r.close>0);if(!p.length)throw Error(code+' 沒有可用官方收盤價');lists[code]=p;}
 let common=new Set(lists[codes[0]].map(x=>x.date));
 for(const code of codes.slice(1)){const set=new Set(lists[code].map(x=>x.date));common=new Set([...common].filter(d=>set.has(d)));}
 const dates=[...common].sort();if(dates.length<2)throw Error('所選 ETF 沒有足夠的共同收盤日期。');
 const start=dates.find(d=>!startInput||d>=startInput);if(!start)throw Error('所選日期晚於共同行情範圍。');
 const end=dates.at(-1);if(start>=end)throw Error('共同期間至少需要兩個交易日。');
 if(mode!=='price'){const missing=codes.filter(code=>!effectiveDividends(code));if(missing.length)throw Error('以下 ETF 尚無可驗證的配息資料：'+missing.join('、')+'。請先選「純價格損益」，或取消缺資料的 ETF；不會把缺漏配息當成 0。');}
 const day=Number(start.slice(8,10)),investments=[];
 if(cfg.initial>0)investments.push({date:start,amount:cfg.initial,kind:'single'});
 if(cfg.monthly>0)investments.push(...monthSchedule({amount:cfg.monthly,day,from:start,to:end}));
 if(cfg.annual>0){const [sy,sm,sd]=start.split('-').map(Number);for(let n=1;n<=40;n++){const y=sy+n,last=new Date(Date.UTC(y,sm,0)).getUTCDate(),d=y+'-'+String(sm).padStart(2,'0')+'-'+String(Math.min(sd,last)).padStart(2,'0');if(d>end)break;if(d>=start)investments.push({date:d,amount:cfg.annual,kind:'single'});}}
 if(!investments.length)throw Error('請至少設定起始投入、每月投入或每年加碼其中一項。');
 const results={};
 for(const code of codes){const prices=lists[code].filter(r=>r.date>=start&&r.date<=end),div=effectiveDividends(code);const calc=compute(prices,investments,{fund:code,feePct:Number(store[activeFund+'_fee']||0),mode,dividends:div?.events||[]});if(!calc?.series?.length)throw Error(code+' 無法依目前期間與投入條件計算。');results[code]={...calc,map:new Map(calc.series.map(x=>[x.date,x]))};}
 const plotDates=dates.filter(d=>d>=start&&d<=end&&codes.every(code=>results[code].map.has(d)));
 let out='<p class="fine">比較期間：'+esc(start)+' 至 '+esc(end)+'；各檔使用相同投入日期與金額，非交易日投入順延到其後第一個有價格的交易日。</p>';
 out+=compareChart(plotDates,results,codes);
 out+='<div class="table-wrap"><table class="data-table"><thead><tr><th>ETF</th><th class="num">累積投入</th><th class="num">期末資產</th><th class="num">累積獲利</th><th class="num">報酬率</th></tr></thead><tbody>';
 for(const code of codes){const last=results[code].latest;out+='<tr><td>'+esc(code)+'</td><td class="num">'+num(last.externalPaid,0)+'</td><td class="num">'+num(last.totalAssets,0)+'</td><td class="num">'+sgn(last.totalPnl,0)+'</td><td class="num">'+sgn(last.pct,2)+'%</td></tr>';}
 out+='</tbody></table></div>';
 if(mode==='price'&&codes.includes('0050')&&!effectiveDividends('0050'))out+='<p class="alert">0050 配息檔目前仍缺漏；本次比較是「純價格損益」，沒有納入現金配息，不能視為完整總報酬比較。</p>';
 return out;
}

function html(fund){if(!ETF.includes(fund))fund='0050';activeFund=fund;if(!pending[fund]&&(!pricesCache[fund]||!dividendsCache[fund])&&!errors[fund+'_div'])Promise.resolve().then(()=>load(fund));
 const official=pricesCache[fund]||[],prices=mergeLocalPrices(fund,official),dfile=effectiveDividends(fund),ls=lots(fund),fee=Number(store[fund+'_fee']||0),dca=store[fund+'_dca']||{},recurring=monthSchedule(dca),gaps=missingMonths(prices,fund);
 let mode=store[fund+'_mode']||'price';if(!['price','cash','reinvest'].includes(mode))mode='price';
 const blocked=mode!=='price'&&!dfile;const usedMode=blocked?'price':mode;const calc=prices.length?compute(prices,[...ls,...recurring],{fund,feePct:fee,mode:usedMode,dividends:dfile?.events||[]}):null;const cur=calc?.latest;
 let h=`<section class="panel" style="margin-top:18px;padding:20px 23px" id="indexETFReturns"><h2 class="panel-title">指數型 ETF 股價與投入報酬試算（含配息、分割、總收益）</h2><p class="subtitle">${esc(fund)}｜可多次加碼；買入日期以當日或其後第一個可得交易日<strong>收盤價</strong>估算。所有試算保存在本機。</p>
 ${projectionPanel(prices,fund)}${comparePanel()}<details style="margin-top:18px"><summary style="cursor:pointer;font-weight:850">進階回看｜依歷史價格、投入紀錄、配息與分割計算</summary><p class="fine">這一區回看實際投入日期與歷史行情；上方則是假設未來年化報酬的情境試算，兩者用途不同。</p><div class="filter-row" style="margin:12px 0"><label>報酬計算</label><select id="idxReturnMode" class="field"><option value="price" ${mode==='price'?'selected':''}>純價格報酬</option><option value="cash" ${mode==='cash'?'selected':''}>含息總報酬（股息留現金）</option><option value="reinvest" ${mode==='reinvest'?'selected':''}>含息總報酬（股息再投入）</option></select><label>投入／加碼日期</label><input id="idxReturnDate" type="date" class="field"/><label>加碼預算（元）</label><input id="idxReturnAmount" type="number" min="1" step="1" class="field" placeholder="例：10000"/><button id="idxReturnAdd" class="btn primary">新增投入／加碼</button><label>買入手續費（%）</label><input id="idxReturnFee" type="number" min="0" max="5" step="0.0001" class="field" style="width:106px" value="${fee}"/></div>
 <details style="margin:10px 0" open><summary><strong>每月定期定額（可與單筆加碼合併）</strong></summary>
 <div class="filter-row" style="margin-top:12px"><label>每月金額（元）</label><input id="idxDcaAmount" type="number" min="1" class="field" style="width:130px" placeholder="例：3000" value="${esc(dca.amount||'')}"/><label>每月扣款日</label><input id="idxDcaDay" type="number" min="1" max="31" class="field" style="width:77px" value="${esc(dca.day||1)}"/><label>開始日期</label><input id="idxDcaFrom" type="date" class="field" value="${esc(dca.from||'')}"/><label>結束日期</label><input id="idxDcaTo" type="date" class="field" value="${esc(dca.to||'')}"/><button id="idxDcaSave" class="btn primary">儲存定期定額</button><button id="idxDcaClear" class="btn">停用</button></div>
 <p class="fine">預計扣款 ${recurring.length} 筆；非交易日順延至其後第一個有報價交易日，若晚於預定日期超過 10 天則跳過並提示缺漏；實際買入以該日收盤價估算。</p></details>
 <details style="margin:12px 0"><summary><strong>補入缺少的歷史股價（手動 CSV，僅存此瀏覽器）</strong></summary>
 <p class="fine">CSV 格式：date,close（或 etf,date,close）；例如 2008-10-01,35.5。請只匯入已核對的<strong>原始未還原收盤價</strong>。官方歷史價格優先，手動資料只補缺漏日，不覆蓋官方值。匯入不會上傳 GitHub。</p>
 <div class="filter-row"><input id="idxLocalCsvFile" type="file" accept=".csv,text/csv" class="field"/><button id="idxLocalCsvImport" class="btn">匯入 CSV</button><button id="idxLocalCsvClear" class="btn danger">清除本機補價</button></div>
 <p class="fine">已匯入 ${Number((localPrices[fund]||[]).length)} 筆本機價格。缺少月份（從上市日起算）：${gaps.length} 個${gaps.length?'；例如 '+esc(gaps.slice(0,8).join('、')):''}。官方回補請使用既有「更新指數型 ETF 每日收盤價」工作流程，執行 backfill，不要拿價格缺漏當作零。</p></details>
 <details style="margin:12px 0"><summary><strong>補入已核對的歷史配息（CSV，僅存此瀏覽器）</strong></summary>
 <p class="fine">適用 0050、006208。CSV 欄位：exDate,paymentDate,amount，日期為 YYYY-MM-DD、金額為每股新臺幣；不得使用推估數字。官方已有的除息日期優先保留。009816 依法定基金政策不配息，不需匯入。</p>
 <div class="filter-row"><input id="idxDivCsvFile" type="file" accept=".csv,text/csv" class="field"/><button id="idxDivCsvImport" class="btn">匯入已核對配息 CSV</button><button id="idxDivCsvClear" class="btn danger">清除本機配息</button></div>
 <p class="fine">本機配息事件 ${Number((localDividends[fund]||[]).length)} 筆。CSV 為本機補充資料，不代表已取得完整歷年股息；需要核對投信官方公告。</p></details>
 <div class="filter-row" style="margin:8px 0"><button id="idxDivReload" class="btn">重新讀取官方配息資料</button><span class="fine">重新向網站讀取 data/index-etf/dividends/${esc(fund)}.json，查核是否已發布；不會修改你的本機投入資料。</span></div>
 <p class="fine">價格資料：${prices.length?`${prices[0].date}～${prices.at(-1).date}（${prices.length} 日）`:'尚無'}；配息資料：${fund==='009816'?'不分配收益（非缺漏；收益留在基金淨值）':dfile?`${dfile.events.length} 筆，截至 ${esc(dfile.asOf||'未標示')}`:'尚無'}。來源：證交所 STOCK_DAY、投信公開收益分配政策及 ETF 收益分配歷史。</p>`;
 if(fund!=='009816'&&dfile){const oldest=dfile.events[0]?.exDate||'無可核對紀錄',newest=dfile.events.at(-1)?.exDate||'無';h+=`<p class="fine"><strong>${fund} 歷年現金配息：</strong>目前收錄 ${dfile.events.length} 筆；最早除息 ${esc(oldest)}，最近除息 ${esc(newest)}。資料會從官方可取得的最早紀錄向後累積；「最早一筆」不等於上市至今已全部核對。<a href="${esc(dfile.sourceUrl||'https://www.twse.com.tw/rwd/zh/ETF/etfDiv')}" target="_blank" rel="noopener noreferrer">核對資料來源</a>。</p>`;}
 if(fund==='009816')h+='<p class="fine"><strong>009816 不分配收益：</strong>「含息總報酬」和「配息再投入」模式不會虛構配息交易，計算結果在其他條件相同時等同純價格報酬；這不等於底層股票未產生股利，相關收益留在基金資產內。</p>';
 if(fund==='006208'){const c=coverageCache['006208'];if(c?.error)h+=`<p class="fine">006208 回補狀態：${esc(c.error)}。請確認後台已產生並公開 data/index-etf/prices/006208.coverage.json。</p>`;else if(c&&Number.isFinite(Number(c.rows)))h+=`<p class="fine">006208 後台回補：${Number(c.rows)} 筆價格、${Number(c.monthsWithPrices??0)}/${Number(c.targetMonths??0)} 個月份；缺漏 ${Number(c.missingMonthCount??0)} 個月；資料範圍 ${esc(c.earliestSaved||'無')}～${esc(c.latestSaved||'無')}。若仍有缺漏，可在 Actions 重複執行補抓。</p>`;}
 if(errors[fund+'_price'])h+=`<p class="alert">${esc(errors[fund+'_price'])}</p>`;
 if(errors[fund+'_div'])h+=`<p class="alert">${esc(errors[fund+'_div'])}</p>`;
 if(fund!=='009816'&&dfile&&dfile.events.length===0)h+='<p class="alert">目前官方配息檔案沒有可用配息事件；不能因此推定歷史期間均未配息，請核對來源與資料格式。</p>'; 
 if(dfile?.sourceStatus==='local-only')h+='<p class="alert">目前僅使用本機匯入的配息紀錄；歷史股息可能不完整，含息結果僅供參考，不能視為全期真實總報酬。</p>';
 if(blocked)h+='<p class="alert">配息資料尚無法驗證：以下先顯示可確認的「純價格報酬」，不是含息總報酬。可由後台發布官方配息 JSON，或匯入已核對的配息 CSV 後重算。不能將缺漏股息視為零。</p>';
 if(blocked)mode='price';
 if(calc&&cur){h+=`<div class="grid stats" style="margin-top:12px">${metric('額外投入成本',num(cur.externalPaid,2))}${metric('分割／再投入後股數',num(cur.shares,4))}${metric('平均帳面持股成本',cur.shares?num(cur.bookCost/cur.shares,4):'—')}${metric('最近收盤價',num(cur.close,2))}${metric('目前持股市值',num(cur.value))}${metric('價格損益',num(cur.pricePnl))}${metric('累積應得配息',mode==='price'?'未計入':num(calc.dividendGross,2))}${metric('現金＋待發配息',mode==='price'?'未計入':num(calc.dividendCash+calc.receivable,2))}${metric('總收益／總損益',sgn(cur.totalPnl,2))}${metric('含息總報酬率',mode==='price'?'未含配息：'+sgn(cur.pct,2)+'%':sgn(cur.pct,2)+'%')}${metric('投入本金累計',num(cur.externalPaid,2))}${metric('股價價差貢獻',sgn(cur.pricePnl,2))}${metric('配息收益貢獻',mode==='price'?'未計入':sgn(calc.dividendGross,2))}${metric('已用股息再投入',mode==='reinvest'?num(calc.reinvestPaid,2):'0.00')}${metric('期間最高損益',sgn(calc.best?.pnl))}${metric('期間最低損益',sgn(calc.worst?.pnl))}${metric('最高報酬率',sgn(calc.bestRate?.pct,2)+'%')}${metric('最低報酬率',sgn(calc.worstRate?.pct,2)+'%')}${metric('年化資金加權報酬 XIRR',calc.xirr===null?'資料不足':sgn(calc.xirr,2)+'%')}</div>`;
 h+=`<p class="fine"><strong>總收益核對：</strong>${mode==='price'?'價格模式＝最新持股市值－實際已買入成本；不包含股息。':'含息模式＝持股市值＋尚餘股息現金＋應收股息－實際已買入成本；若再投入則股息已轉成持股，不重複列為現金收益。'} 股價價差＋累積應得股息－股息再投入金額＝總收益（不含稅費差異；買入手續費已按設定納入）。</p>`;
 h+=`<p class="fine">最高損益 ${calc.best?.date||'—'}；最低損益 ${calc.worst?.date||'—'}。尚未投入的預算餘額：${num(calc.unused,2)} 元，未計入投入成本。股利再投入金額：${num(calc.reinvestPaid,2)} 元（不是新增本金）。</p>`;
 h+=chart(calc.series,fund);
 h+=`<div class="table-wrap"><table class="data-table"><thead><tr><th>事件類型</th><th>預定日期</th><th>模擬日期</th><th class="num">每股價格</th><th class="num">股數增加</th><th class="num">成本／再投入（元）</th></tr></thead><tbody>${calc.events.map(e=>`<tr><td>${e.kind==='purchase'?(e.source==='dca'?'定期定額':'投入／加碼'):e.kind==='split'?'分割增加股數':'股息再投入'}</td><td>${esc(e.requestedDate||e.date)}</td><td>${esc(e.date)}</td><td class="num">${num(e.price,2)}</td><td class="num">${num(e.shares,4)}</td><td class="num">${num(e.paid,2)}</td></tr>`).join('')}</tbody></table></div>`;
 if(mode!=='price'&&calc.divEvents.length)h+=`<details><summary>查看期間配息事件（${calc.divEvents.length} 筆）</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>事件</th><th>日期</th><th class="num">應得／入帳金額</th></tr></thead><tbody>${calc.divEvents.map(e=>`<tr><td>${e.kind==='ex'?'除息應得':'配息入帳'}</td><td>${esc(e.date)}</td><td class="num">${num(e.amount,2)}</td></tr>`).join('')}</tbody></table></div></details>`;
 if(fund!=='009816'&&dfile?.events?.length){h+=`<details><summary>查看 ${fund} 已收錄歷年配息（${dfile.events.length} 筆；依資料來源）</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>除息日</th><th>發放日</th><th class="num">每股配息（元）</th></tr></thead><tbody>${dfile.events.map(d=>`<tr><td>${esc(d.exDate)}</td><td>${esc(d.paymentDate)}</td><td class="num">${num(d.amount,4)}</td></tr>`).join('')}</tbody></table></div><p class="fine">本表列出基金每股配息事件，並非你的實領配息；實領金額依每次除息前持股計算。缺漏的早期紀錄不會被當成零。</p></details>`;}
 if(calc.ignored.length||calc.notYet.length||calc.skippedGaps.length)h+=`<p class="alert">部分投入日期超出股價範圍或距下一筆有效交易日超過 10 天，未納入計算。跳過缺漏 ${calc.skippedGaps.length} 筆；請補齊官方或已核對的歷史行情。</p>`;
 }else h+=`<p class="fine">請先按「儲存定期定額」，或新增單筆日期和金額，才能顯示收益；${!prices.length?'目前缺少行情資料。':'若預定日期超出現有歷史報價範圍，將無法產生持股。'}</p>`;
 if(ls.length)h+=`<div class="filter-row"><strong>多筆投入清單</strong><button id="idxReturnClear" class="btn danger">清除本 ETF 試算</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>日期</th><th class="num">預計投入金額</th><th>操作</th></tr></thead><tbody>${ls.map((x,i)=>`<tr><td>${esc(x.date)}</td><td class="num">${num(Number(x.amount))}</td><td><button class="btn" data-idx-return-delete="${i}">移除</button></td></tr>`).join('')}</tbody></table></div>`;
 h+=`<div class="note-box mt16"><strong>計算說明：</strong>0050 於 2025-06-18 進行 1 拆 4；分割增加股數並相應降低每股成本，<strong>不增加投入本金</strong>。股息依除息日前持股認列應收，發放後留存現金或在發放日後第一個有價交易日收盤價模擬再投入；未滿一股的餘額保留現金。配息再投入不屬於額外加碼。XIRR 以真正投入資金及期末資產計算。股價／配息源自公開資料，可能有漏日；0050 的 2003～2004 年官方歷史分配資料未在目前查詢來源內完整驗證；006208 自上市後亦須核對資料來源的涵蓋期間，缺漏時不得將 0 元視為完整。未計賣出交易稅、滑價、股息稅負及其他費用。非交易建議。</div></details></section>`;
 return h;}
document.addEventListener('click',e=>{if(!window.TradeCompassBridge?.isPage?.('indexETF'))return;const b=e.target.closest?.('button');if(!b)return;
 if(b.id==='idxCompareRun'){
  const codes=[...document.querySelectorAll('[data-idx-compare]:checked')].map(x=>x.dataset.idxCompare);
  if(codes.length<2){alert('請至少勾選兩檔 ETF');return;}
  const result=document.getElementById('idxCompareResult'),button=b;
  const cfg={initial:Number(document.getElementById('idxProjInitial')?.value),monthly:Number(document.getElementById('idxProjMonthly')?.value),annual:Number(document.getElementById('idxProjAnnual')?.value)};
  if(![cfg.initial,cfg.monthly,cfg.annual].every(v=>Number.isFinite(v)&&v>=0)){alert('請先確認上方投入金額');return;}
  if(result)result.innerHTML='<p class="fine">正在載入所選 ETF 的歷史收盤價…</p>';button.disabled=true;
  runIndexEtfComparison(codes,document.getElementById('idxCompareStart')?.value||'',cfg,document.getElementById('idxCompareMode')?.value||'price')
   .then(html=>{const target=document.getElementById('idxCompareResult');if(target)target.innerHTML=html;})
   .catch(err=>{const target=document.getElementById('idxCompareResult');if(target)target.innerHTML='<p class="alert">'+esc(err.message||String(err))+'</p>';})
   .finally(()=>{const current=document.getElementById('idxCompareRun');if(current)current.disabled=false;});
  return;
 }
 if(b.id==='idxProjectionRun'){
  const initial=Number(document.getElementById('idxProjInitial')?.value),monthly=Number(document.getElementById('idxProjMonthly')?.value),annual=Number(document.getElementById('idxProjAnnual')?.value),years=Number(document.getElementById('idxProjYears')?.value),reinvest=!!document.getElementById('idxProjReinvest')?.checked;
  if(![initial,monthly,annual].every(v=>Number.isFinite(v)&&v>=0&&v<=1e12)||!Number.isInteger(years)||years<1||years>40){alert('請輸入 0 至 1,000,000,000,000 元的投入金額，試算年數需為 1 至 40 年');return;}
  let all={};try{all=JSON.parse(localStorage.getItem(PROJ_KEY)||'{}')||{};}catch{}
  all[activeFund]={initial,monthly,annual,years,reinvest};localStorage.setItem(PROJ_KEY,JSON.stringify(all));refresh();return;
 }
 if(b.id==='idxDcaSave'){
  const amount=Number(document.getElementById('idxDcaAmount')?.value),day=Number(document.getElementById('idxDcaDay')?.value),from=document.getElementById('idxDcaFrom')?.value,to=document.getElementById('idxDcaTo')?.value;
  if(!(amount>0)||!(day>=1&&day<=31)||!dateValid(from)||!dateValid(to)||from>to){alert('請檢查每月金額、扣款日（1～31）與起訖日期');return;}
  store[activeFund+'_dca']={amount,day,from,to};persist();refresh();return;
 }
 if(b.id==='idxDcaClear'){delete store[activeFund+'_dca'];persist();refresh();return;}
 if(b.id==='idxLocalCsvImport'){
  const f=document.getElementById('idxLocalCsvFile')?.files?.[0];if(!f){alert('請先選 CSV 檔案');return;}
  f.text().then(txt=>{const result=saveLocalCsv(activeFund,txt);alert(`匯入 ${result.added} 筆，忽略 ${result.rejected} 筆；重新整理後會自動套用`);}).catch(e=>alert('匯入失敗：'+e.message));return;
 }
 if(b.id==='idxLocalCsvClear'){if(confirm('清除本 ETF 所有本機補入股價？官方資料不受影響。')){delete localPrices[activeFund];localStorage.setItem(PRICE_KEY,JSON.stringify(localPrices));refresh();}return;}
 if(b.id==='idxDivCsvImport'){
  const fund=activeFund,f=document.getElementById('idxDivCsvFile')?.files?.[0];if(!f){alert('請先選擇經核對的配息 CSV');return;}
  f.text().then(txt=>{const fresh=parseLocalDividendCsv(txt,fund);const prev=new Map((localDividends[fund]||[]).map(v=>[v.exDate,v]));fresh.forEach(v=>prev.set(v.exDate,v));localDividends[fund]=[...prev.values()].sort((a,b)=>a.exDate.localeCompare(b.exDate));localStorage.setItem(DIV_KEY,JSON.stringify(localDividends));refresh();alert('已補入 '+fresh.length+' 筆本機配息資料，請確認涵蓋期間完整');}).catch(err=>alert('配息匯入失敗：'+err.message));return;
 }
 if(b.id==='idxDivReload'){delete dividendsCache[activeFund];delete errors[activeFund+'_div'];load(activeFund);return;}
 if(b.id==='idxDivCsvClear'){if(confirm('清除本 ETF 本機配息紀錄？公開官方資料不會刪除。')){delete localDividends[activeFund];localStorage.setItem(DIV_KEY,JSON.stringify(localDividends));refresh();}return;}

 if(b.id==='idxReturnAdd'){const date=document.getElementById('idxReturnDate')?.value,amount=Number(document.getElementById('idxReturnAmount')?.value);if(!dateValid(date)||!(amount>0)){alert('請輸入有效日期與投入金額');return;}updateLots(activeFund,[...lots(activeFund),{date,amount}]);}
 if(b.id==='idxReturnClear'){if(confirm('確定清除這檔 ETF 的所有投入試算？'))updateLots(activeFund,[]);}
 if(b.dataset.idxReturnDelete!==undefined){const i=Number(b.dataset.idxReturnDelete);if(Number.isInteger(i))updateLots(activeFund,lots(activeFund).filter((_,j)=>i!==j));}
});
document.addEventListener('mousemove',e=>{
 const svg=e.target?.closest?.('#idxProjChart'),tip=document.getElementById('idxProjTooltip');
 if(!tip)return;
 if(!svg){tip.style.display='none';return;}
 const state=projectionGraphs[activeFund];if(!state)return;
 const rect=svg.getBoundingClientRect(),viewX=(e.clientX-rect.left)/rect.width*900;
 const year=Math.max(1,Math.min(state.years,Math.round((viewX-94)/782*state.years)));
 const rows=state.series.map(items=>items[year]);if(rows.some(row=>!row))return;
 tip.innerHTML='<strong>'+year+' 年｜累積投入 '+num(rows[1].capital,0)+' 元</strong><br>'+
  '<span style="color:#93c5fd">3%：獲利 '+sgn(rows[0].profit,0)+' 元｜資產 '+num(rows[0].assets,0)+' 元</span><br>'+
  '<span style="color:#5eead4">7%：獲利 '+sgn(rows[1].profit,0)+' 元｜資產 '+num(rows[1].assets,0)+' 元</span><br>'+
  '<span style="color:#fdba74">10%：獲利 '+sgn(rows[2].profit,0)+' 元｜資產 '+num(rows[2].assets,0)+' 元</span>';
 const wrap=tip.parentElement,box=wrap.getBoundingClientRect();tip.style.display='block';
 const left=e.clientX-box.left+12;
 tip.style.left=Math.max(8,Math.min(left,wrap.clientWidth-tip.offsetWidth-8))+'px';
 tip.style.top='8px';
});
document.addEventListener('change',e=>{if(e.target?.id==='idxReturnFee'){const x=Number(e.target.value);if(Number.isFinite(x)&&x>=0&&x<=5){store[activeFund+'_fee']=x;persist();refresh();}}
 if(e.target?.id==='idxReturnMode'){store[activeFund+'_mode']=e.target.value;persist();refresh();}});
window.TradeCompassETFReturns={html,load,_test:{compute,xirr,parsePrices,parseDividends,monthSchedule,parseLocalCsv,parseLocalDividendCsv,mergeLocalPrices,missingMonths,effectiveDividends,chart,chartPanel,investmentCapitalChart,getVerifiedDividendArchive}};
})();
