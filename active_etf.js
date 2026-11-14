/* Trade Compass v1.4 active ETF holdings. Requires two complete, dated PCF snapshots to infer changes. */
(function(){'use strict';
const STORAGE='trade-compass-active-etf-snapshots-v1';
// Official SITCA active ETF bulletin snapshot (2026-11-14); the optional custom field handles future listings.
const catalog = [["00400A","主動國泰動能高息","股票"],["00401A","主動摩根台灣鑫收","股票"],["00402A","主動安聯美國科技","股票"],["00403A","主動統一升級50","股票"],["00404A","主動聯博動能50","股票"],["00405A","主動富邦台灣龍耀","股票"],["00406A","主動中信台灣收益","股票"],["00407A","主動凱基台灣","股票"],["00408A","主動第一金優股息","股票"],["00409A","主動復華全球50","股票"],["00410A","主動永豐科技趨勢","股票"],["00411A","主動統一前沿科技","股票"],["00412A","主動安聯亞半導體","股票"],["00415A","主動群益核心50","股票"],["00980A","主動野村臺灣優選","股票"],["00980D","主動聯博投等入息","債券"],["00981A","主動統一台股增長","股票"],["00981D","主動中信非投等債","債券"],["00982A","主動群益台灣強棒","股票"],["00982D","主動富邦動態入息","債券"],["00983A","主動中信ARK創新","股票"],["00983D","主動富邦複合收益","債券"],["00984A","主動安聯台灣高息","股票"],["00984D","主動聯博全球非投","債券"],["00985A","主動野村台灣50","股票"],["00985D","主動貝萊德優投等","債券"],["00986A","主動台新龍頭成長","股票"],["00986D","主動復華金融債息","債券"],["00987A","主動台新優勢成長","股票"],["00987D","主動統一美債量化","債券"],["00988A","主動統一全球創新","股票"],["00989A","主動摩根美國科技","股票"],["00990A","主動元大AI新經濟","股票"],["00991A","主動復華未來50","股票"],["00992A","主動群益科技創新","股票"],["00993A","主動安聯台灣","股票"],["00994A","主動第一金台股優","股票"],["00995A","主動中信台灣卓越","股票"],["00996A","主動兆豐台灣豐收","股票"],["00997A","主動群益美國增長","股票"],["00998A","主動復華金融股息","股票"],["00999A","主動野村臺灣高息","股票"]];
const selectList=catalog.map(([code,name])=>[code,name]);
const ETF_SOURCE='https://www.sitca.org.tw/ROC/SITCA_ETF/etf_bulletin.aspx';
const state={code:'00981A',filter:'all',search:'',local:{schema:1,snapshots:{}},published:null,loading:false,loaded:false,error:'',showImport:false,stockCode:'2330',stockTerm:'',asOfDate:'',compareMode:'previous',compareDate:''};
try{const raw=localStorage.getItem(STORAGE);if(raw){const x=JSON.parse(raw);if(x?.schema===1&&x.snapshots&&typeof x.snapshots==='object')state.local=x;}}catch(e){state.error='本機快照存取受限制：'+e.message;}
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const fmt=(x,d=0)=>x==null?'—':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:d,minimumFractionDigits:d});
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00'));
const validCode=x=>/^[0-9A-Z]{4,8}$/.test(x);
const compact=s=>String(s||'').trim().toUpperCase();
const positive=v=>Number.isFinite(Number(v))&&Number(v)>=0;
const safeNum=s=>{if(s===undefined||s===null||String(s).trim()==='')return null;const x=Number(String(s).replaceAll(',','').replace('%','').trim());return Number.isFinite(x)&&x>=0?x:null;};
function redraw(){if(window.TradeCompassBridge?.isPage?.('activeETF'))window.TradeCompassBridge.render();}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(state.local));state.error='';}catch(e){state.error='無法保存本機持股快照：'+e.message;}}
async function load(){if(state.loading||state.published)return;
 state.loading=true;
 try{const res=await fetch('data/active-etf/latest.json?c='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json();if(data.schema!==1||typeof data.snapshots!=='object')throw Error('官方快照格式不正確');state.published=data;}
 catch(e){state.error='網站公開持股資料暫不可用：'+e.message;}finally{state.loading=false;state.loaded=true;redraw();}}
function getSnapshots(code){
 const all=[...(state.published?.snapshots?.[code]||[]).map(x=>({...x,origin:'public'})),...(state.local.snapshots?.[code]||[]).map(x=>({...x,origin:'local'}))];
 const map=new Map();for(const s of all){if(!validDate(s.date)||!Array.isArray(s.holdings))continue;
 // User-imported record takes precedence if the same date is present.
 const old=map.get(s.date);if(!old||s.origin==='local')map.set(s.date,s);}
 return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
// Exact-date selection: never silently substitute a different day. The "previous" mode
// compares the last AVAILABLE snapshot, not necessarily the prior stock exchange session.
function selectSnapshots(snapshots, asOfDate, compareMode='previous', compareDate=''){
 const latest=snapshots[0];
 const target=asOfDate||latest?.date||'';
 const current=snapshots.find(x=>x.date===target)||null;
 const previous=compareMode==='custom'
   ?snapshots.find(x=>x.date===compareDate)||null
   :current?(snapshots.find(x=>x.date<current.date)||null):null;
 const validOrder=!!(current&&previous&&previous.date<current.date);
 const verified=validOrder&&!!current.complete&&!!previous.complete;
 const gaps=validOrder?Math.round((new Date(current.date+'T12:00:00Z')-new Date(previous.date+'T12:00:00Z'))/86400000):null;
 const comparisonDate=compareMode==='custom'?compareDate:(previous?.date||'');
 return {current,previous,target,comparisonDate,validOrder,verified,gaps};
}
function classify(previous,current){
 if(!previous?.complete||!current?.complete)return [];
 if(!validDate(previous.date)||!validDate(current.date)||previous.date>=current.date)return [];
 const old=new Map(previous.holdings.map(v=>[v.code,v]));const next=new Map(current.holdings.map(v=>[v.code,v]));
 const changes=[];
 for(const code of new Set([...old.keys(),...next.keys()])){
  const before=old.get(code),after=next.get(code);
  const b=before?.shares,a=after?.shares;
  const bothShares=b!=null&&a!=null;
  let type='unchanged',delta=null,note='';
  if(!before&&after){type='new';delta=a;}
  else if(before&&!after){type='cleared';delta=b==null?null:-b;}
  else if(bothShares){delta=a-b;if(delta>0)type='increased';else if(delta<0)type='decreased';}
  else if(before&&after&&before.weight!=null&&after.weight!=null){
   delta=after.weight-before.weight;
   if(Math.abs(delta)>1e-9){type=delta>0?'weight_up':'weight_down';note='僅權重變化，不能推定股數加減';}
  }
  if(type!=='unchanged')changes.push({code,name:after?.name||before?.name||code,type,delta,before,after,note});
 }
 const order={new:0,increased:1,decreased:2,cleared:3,weight_up:4,weight_down:5};
 return changes.sort((a,b)=>order[a.type]-order[b.type]||Math.abs(b.delta||0)-Math.abs(a.delta||0));
}
const badges={new:['新增','mint'],increased:['加碼','mint'],decreased:['減碼','gold'],cleared:['清倉','red'],weight_up:['權重上升','blue'],weight_down:['權重下降','slate']};
function csvParser(text){
 // RFC4180-style CSV line parser incl. quoted newlines and escaped quotes.
 const rows=[],row=[];let cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push([...row]);row.length=0;cell='';}
  else cell+=c;
 }
 if(quoted)throw Error('CSV 引號格式不完整');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 return rows;
}
function parseCSV(text,meta){
 const rows=csvParser(text.replace(/^\ufeff/,''));if(rows.length<2)throw Error('CSV 沒有持股資料');
 const norm=s=>String(s).replace(/\s+/g,'').replace(/\uFEFF/g,'').toLowerCase();
 const header=rows[0].map(norm);
 const idx=(...names)=>header.findIndex(h=>names.some(n=>norm(n)===h));
 const ccol=idx('股票代號','證券代號','stock_code','code','symbol','標的代號');
 const ncol=idx('股票名稱','證券名稱','stock_name','name','標的名稱');
 const scol=idx('持有股數','持股股數','股數','shares','quantity','持有數量');
 const wcol=idx('持股權重','持股權重%','權重','weight','weight_pct','weightpercent','權重(%)');
 const dcol=idx('日期','資料日期','date');const ecol=idx('ETF代號','etf','etf_code');
 if(ccol<0|| (scol<0&&wcol<0))throw Error('CSV 至少須有「股票代號」及「股數」或「權重」欄');
 const holdings=[];const codes=new Set();
 for(const [j,cols] of rows.slice(1).entries()){
   const code=compact(cols[ccol]);if(!validCode(code))throw Error(`第 ${j+2} 行股票代號無效`);
   if(codes.has(code))throw Error(`CSV 包含重複持股 ${code}，無法判定完整部位`);
   if(dcol>=0&&cols[dcol]&&cols[dcol].trim()!==meta.date)throw Error(`第 ${j+2} 行日期與選擇日期不一致`);
   if(ecol>=0&&cols[ecol]&&compact(cols[ecol])!==meta.code)throw Error(`第 ${j+2} 行 ETF 代號與選擇 ETF 不一致`);
   const shares=scol<0?null:safeNum(cols[scol]),weight=wcol<0?null:safeNum(cols[wcol]);
   if(shares===null&&weight===null)throw Error(`第 ${j+2} 行股數和權重皆無效`);
   if(shares!==null&&!Number.isInteger(shares))throw Error(`第 ${j+2} 行股數必須為整數（單位：股）`);
   if(weight!==null&&weight>100)throw Error(`第 ${j+2} 行權重大於 100%`);
   holdings.push({code,name:ncol>=0?String(cols[ncol]||code).trim():code,shares,weight});codes.add(code);
 }
 if(holdings.length>3000)throw Error('單次匯入超過 3,000 檔，請檢查檔案');
 return {date:meta.date,source:meta.source.slice(0,180),complete:meta.complete,holdings,importedAt:new Date().toISOString()};
}
function html(){if(!state.loaded&&!state.loading)queueMicrotask(load);
 const code=state.code,snapshots=getSnapshots(code);
 const selection=selectSnapshots(snapshots,state.asOfDate,state.compareMode,state.compareDate);
 const curr=selection.current,prev=selection.previous,canCompare=selection.verified;
 const changes=canCompare?classify(prev,curr):[];
 const q=window.TradeCompassMarket?.find(code);
 if(window.TradeCompassMarket?.status==='idle')queueMicrotask(()=>window.TradeCompassMarket.load());
 let s=`<div class="head"><div><div class="eyebrow">ACTIVE ETF PORTFOLIO MONITOR</div><h1>主動式 ETF 持股異動查詢</h1><p class="subtitle">查 ETF 開高低收、交易量、當沖、法人，以及兩份完整持股清單比較之新增／加碼／減碼／清倉</p></div><div class="actions"><button class="btn" data-active-refresh>↻ 重新載入公開資料</button><button class="btn" data-active-export>備份持股快照</button><label class="btn upload-label">還原快照 JSON<input type="file" id="activeRestoreFile" accept=".json,application/json" hidden></label></div></div>
 <div class="notice-banner">持股異動為<b>兩個公布日期快照差異</b>，不是當天實際委託成交；申購贖回、股票拆併股與基金規模變化可能影響股數。必須確認清單完整，才會判定「清倉」。私人匯入的持股快照只保存在目前瀏覽器。</div>
 <section class="panel tc-pad"><div class="tc-searchbar"><label for="activePicker">選擇主動式 ETF</label><select class="field tc-active-select" id="activePicker" aria-label="選擇主動式 ETF"><option value="">選擇 ETF（${catalog.length} 檔）</option>${catalog.map(([x,n,k])=>`<option value="${esc(x)}" ${x===code?'selected':''}>${esc(x)}｜${esc(n)}（${esc(k)}）</option>`).join('')}</select><label for="activeCode">自行輸入代號</label><input class="field" id="activeCode" value="${esc(code)}" placeholder="例如 00982A"><button class="btn primary" data-active-select>查詢 ETF</button><button class="btn" data-active-import-toggle>＋ 匯入官方 PCF 快照</button></div><div class="tc-flex" style="margin-top:13px"><span class="tc-badge">官方名單 ${catalog.length} 檔（2026/11/14）</span><span class="tc-badge">目前標的：${esc(catalog.find(x=>x[0]===code)?.[1]||'自訂代號 '+code)}</span><span class="tc-badge">公開持股快照：${state.published?.snapshots?.[code]?.length||0} 日</span><span class="tc-badge">本機快照：${state.local.snapshots?.[code]?.length||0} 日</span></div><p class="tc-note">ETF 清單依<a href="${ETF_SOURCE}" target="_blank" rel="noopener noreferrer">投信投顧公會官方名單</a>整理；選得到代號不等於有完整持股，必須另有投信官方 PCF 才可計算每日增減碼。新上市代號可在右側自行輸入。</p></section>`;
 if(state.error)s+=`<div class="tc-empty" style="margin-bottom:15px">${esc(state.error)}</div>`;
 if(state.showImport)s+=`<section class="panel tc-pad"><h2 class="panel-title">匯入 ETF 每日完整持股清單（CSV）</h2>
 <p class="tc-note">從投信官網取得申購買回清單（PCF）後，可整理成 CSV：<b>股票代號, 股票名稱, 股數, 權重</b>。股數必須是「股」，不是「張」。允許只有權重，但只能判定權重增減，不能判定實際加減碼股數。日期請使用該清單所屬交易日。</p>
 <div class="tc-upload"><label>公布資料日期 <input class="field" type="date" id="activeImportDate"></label><label>來源網址或名稱 <input class="field" id="activeImportSource" placeholder="投信官方 PCF 網址"></label></div>
 <div class="tc-upload"><label class="tc-check"><input type="checkbox" id="activeComplete"> 我確認是該 ETF 在該日期的<b>完整</b>股票持股清單（不是前十大或部分摘錄）</label></div>
 <div class="tc-upload"><label class="btn primary upload-label">選取 CSV 並匯入<input type="file" id="activeImportFile" accept=".csv,text/csv" hidden></label><button class="btn" data-active-template>下載 CSV 範本</button><a href="https://www.twse.com.tw/zh/products/securities/etf/news.html" target="_blank" rel="noopener noreferrer" class="btn">查找官方 PCF 來源</a></div>
 <p class="fine">這個欄位只接受 CSV。完整持股資料須來自發行投信之官方 PCF／投資組合揭露，並保留來源；請勿上傳個人股票交易紀錄。</p></section>`;
 if(q){s+=`<section class="panel tc-pad"><h2 class="panel-title">${esc(q.name)}（${esc(code)}）交易行情</h2><p class="panel-sub">資料日：${esc(q.date)}，盤後官方快照</p></section>`+window.TradeCompassMarket.quoteOverview(q);}
 else{s+=`<section class="panel tc-pad tc-empty">目前尚無 ${esc(code)} 可驗證的官方盤後行情。可能是尚未跑過 GitHub Actions、該 ETF 不在本次公開資料中，或資料日無成交。以下持股快照功能仍可單獨使用。</section>`;}
 // Search any individual stock's official market price while remaining on active ETF page.
 const stockTerm=compact(state.stockCode),stockQuote=window.TradeCompassMarket?.find(stockTerm);
 s+=`<section class="panel tc-pad"><div class="tc-section-head"><div><h2 class="panel-title">個股價格查詢</h2><p class="panel-sub">上市／上櫃股票與 ETF 成分股・官方最新盤後行情（非即時）</p></div></div><div class="tc-searchbar"><label for="activeStockCode">股票代號</label><input id="activeStockCode" class="field" value="${esc(state.stockCode)}" placeholder="例如 2330、2454、0050"><button class="btn primary" data-active-stock>查詢股價</button><button class="btn" data-active-stock-details>前往股票行情查詢</button></div>`;
 if(stockQuote){s+=`<div class="tc-active-price-grid">${[['股票',stockQuote.name+'（'+stockQuote.code+'）'],['資料日',stockQuote.date],['開盤',fmt(stockQuote.open,2)],['最高',fmt(stockQuote.high,2)],['最低',fmt(stockQuote.low,2)],['收盤',fmt(stockQuote.close,2)],['成交股數',fmt(stockQuote.volumeShares)]].map(([k,v])=>`<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>`;}
 else{s+=`<div class="tc-note" style="margin-top:12px">${state.stockCode?'查無 '+esc(state.stockCode)+' 的有效盤後股價；請確認官方行情資料日、股票代號及 GitHub Actions 更新狀態。':'請輸入股票代號查詢。'} 未取得資料時不補假價格。</div>`;}
 s+=`</section>`;
 s+=`<section class="panel tc-pad"><div class="tc-section-head"><div><h2 class="panel-title">成分股歷史持有與異動</h2><p class="panel-sub">選擇指定交易日的持股快照，再比較前一次或自訂日期的異動。</p></div></div>
 <div class="tc-date-controls">
 <label>查詢持股日期<input id="activeAsOf" type="date" class="field" value="${esc(selection.target)}" aria-label="查詢持股日期"></label>
 <label>比較方式<select id="activeCompareMode" class="field"><option value="previous" ${state.compareMode==='previous'?'selected':''}>自動：前一份已保存快照</option><option value="custom" ${state.compareMode==='custom'?'selected':''}>手動：指定比較日期</option></select></label>
 ${state.compareMode==='custom'?`<label>比較基準日<input id="activeCompareDate" type="date" class="field" value="${esc(state.compareDate)}" aria-label="比較基準日"></label>`:`<label>自動找到的基準日<input class="field" value="${esc(selection.comparisonDate||'尚無') }" readonly aria-label="自動基準日期"></label>`}
 </div>
 ${snapshots.length?`<p class="tc-note" style="margin:10px 0 13px">已保存 ${snapshots.length} 個日期：${snapshots.map(x=>`<button class="btn sm tc-date-chip" data-active-date="${esc(x.date)}">${esc(x.date)}${x.complete?'':' ⚠'}</button>`).join(' ')} </p>`:`<p class="tc-note" style="margin:10px 0 13px">目前沒有可選的持股快照日期。ETF 代號清單不等於持股資料，須由投信官方完整 PCF 來源取得或匯入。</p>`}
 <p class="tc-note">查詢日：<b>${esc(selection.target||'未選擇')}</b>｜比較日：<b>${esc(selection.comparisonDate||'尚無')}</b>｜查詢日持股 <b>${curr?.holdings?.length||0}</b> 檔。只有完整快照才可判定新增或清倉。自動模式使用「前一份有保存資料的日期」，未保證是前一交易日。</p>`;
 if(!curr){s+=`<div class="no-data"><strong>查無 ${esc(code)} 在 ${esc(selection.target||'指定日期')} 的完整持股快照</strong><p>已保存 ${snapshots.length} 個日期，不能將最近日期冒充你查詢的那天。請匯入該交易日的投信官方完整 PCF，或確認自動更新來源是否具備歷史檔。</p><button class="btn sm" data-active-import-toggle>匯入缺少日期的 PCF</button></div>`;}
 else{
 if(!canCompare){const why=(!prev)?`找不到 ${state.compareMode==='custom'?esc(state.compareDate||'指定比較日期'):'更早日期'} 的快照`:!selection.validOrder?'比較日期必須早於查詢日期':'至少一份快照未確認為完整清單';s+=`<div class="tc-empty">⚠ ${why}。目前只能查看查詢日持股，不進行新增／加碼／減碼／清倉判定。請匯入兩日的官方完整 PCF。</div>`;}
 else s+=`${selection.gaps>4?`<div class="tc-empty">注意：兩份快照相隔 ${selection.gaps} 個日曆日，期間可能存在未保存的交易日；以下只代表這兩個日期之間的淨變化，不代表每天操作紀錄。</div>`:''}<div class="tc-flex" style="margin:12px 0">${Object.entries(badges).filter(([k])=>!k.startsWith('weight')).map(([k,[text]])=>`<span class="tc-badge">${text} ${changes.filter(x=>x.type===k).length} 檔</span>`).join('')}<span class="fine">${esc(prev.date)} → ${esc(curr.date)}</span></div>`;
 if(canCompare)s+=`<div class="tc-filter-row"><label>分類</label><select class="field" id="activeFilter">${[['all','全部異動'],...Object.entries(badges).map(([key,[name]])=>[key,name])].map(([val,title])=>`<option value="${val}" ${state.filter===val?'selected':''}>${title}</option>`).join('')}</select><label>搜尋</label><input class="field" id="activeSearch" value="${esc(state.search)}" placeholder="股票名稱或代號"></div>`;
 const shown=changes.filter(x=>(state.filter==='all'||x.type===state.filter)&&[x.name,x.code].some(t=>String(t).toLowerCase().includes(state.search.toLowerCase())));
 if(canCompare){s+=`<div class="table-wrap tc-table-scroll"><table class="data-table"><thead><tr><th>代號／名稱</th><th>異動類型</th><th class="num">前次股數</th><th class="num">最新股數</th><th class="num">股數變動</th><th class="num">權重變化</th></tr></thead><tbody>`;
 for(const x of shown){const [label,color]=badges[x.type];const weight=x.before?.weight!=null&&x.after?.weight!=null?((x.after.weight-x.before.weight)>0?'+':'')+fmt(x.after.weight-x.before.weight,2)+' pp':'—';
 s+=`<tr><td><button class="tc-code-btn" data-active-quote="${esc(x.code)}" title="查詢個股收盤價">${esc(x.code)}</button> ${esc(x.name)}</td><td><span class="tag ${color}">${label}</span></td><td class="num">${fmt(x.before?.shares)}</td><td class="num">${fmt(x.after?.shares)}</td><td class="num ${x.delta>0?'positive':x.delta<0?'negative':''}">${x.delta==null?'—':(x.delta>0?'+':'')+fmt(x.delta)}</td><td class="num">${weight}</td></tr>`;}
 s+=`</tbody></table></div>`;
 if(!shown.length)s+='<p class="tc-note">目前篩選條件沒有符合的異動。</p>';
 }
 s+=`<h3 class="panel-title" style="margin-top:23px">${esc(curr.date)} 持股清單</h3><div class="table-wrap tc-table-scroll"><table class="data-table"><thead><tr><th>股票代號</th><th>股票名稱</th><th class="num">持有股數</th><th class="num">權重</th></tr></thead><tbody>`;
 for(const x of curr.holdings.slice().sort((a,b)=>(b.weight??0)-(a.weight??0))){s+=`<tr><td><button class="tc-code-btn" data-active-quote="${esc(x.code)}" title="查詢個股收盤價">${esc(x.code)}</button></td><td>${esc(x.name)}</td><td class="num">${fmt(x.shares)}</td><td class="num">${x.weight==null?'—':fmt(x.weight,2)+'%'}</td></tr>`;}
 s+='</tbody></table></div>';
 }
 s+=`</section><section class="panel tc-pad"><h2 class="panel-title">歷次快照與資料來源</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>資料日期</th><th>來源</th><th>持股檔數</th><th>完整性</th><th>操作</th></tr></thead><tbody>`;
 for(const x of snapshots){s+=`<tr><td>${esc(x.date)}</td><td>${esc(x.source||'未註明')}</td><td>${fmt(x.holdings.length)}</td><td>${x.complete?'<span class="tag mint">已確認完整</span>':'<span class="tag gold">未確認完整</span>'}</td><td>${x.origin==='local'?`<button class="btn sm danger" data-active-remove="${esc(x.date)}">刪除本機快照</button>`:'公開快照'}</td></tr>`;}
 s+=`</tbody></table></div></section><div class="tc-note">資料儲存：PCF CSV 匯入後，僅放在此瀏覽器的 localStorage（鍵：${STORAGE}）。更換電腦／清除瀏覽器網站資料可能遺失，請定期按「備份持股快照」。這份資料與原交易紀錄 JSON 備份分開。</div>`;
 return s;
}
function download(file,text,type='text/csv;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function importFile(file){const el=id=>document.getElementById(id);const date=el('activeImportDate')?.value,source=el('activeImportSource')?.value.trim()||'手動匯入：來源未填寫';const complete=!!el('activeComplete')?.checked;
 if(!validDate(date))return alert('請先選擇有效的公布日期。');
 if(!complete&&!confirm('你沒有確認這是完整清單：將僅保存持股快照，不會根據這筆快照判定清倉。確定匯入嗎？'))return;
 file.text().then(text=>{
 try{const snap=parseCSV(text,{date,code:state.code,source,complete});if(!state.local.snapshots[state.code])state.local.snapshots[state.code]=[];
 state.local.snapshots[state.code]=state.local.snapshots[state.code].filter(s=>s.date!==date).concat(snap).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,120);
 persist();state.asOfDate=date;state.showImport=false;redraw();alert(`已保存 ${snap.holdings.length} 檔 ${date} 持股資料。本機快照不會上傳至 GitHub。`);
 }catch(e){alert('CSV 匯入失敗：'+e.message);}
 }).catch(e=>alert('無法讀取 CSV：'+e.message));
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-active-select],[data-active-refresh],[data-active-import-toggle],[data-active-remove],[data-active-template],[data-active-export],[data-active-stock],[data-active-quote],[data-active-stock-details],[data-active-date]');if(!b)return;
 if(b.hasAttribute('data-active-select')){const code=compact(document.getElementById('activeCode')?.value);if(!validCode(code))return alert('請輸入正確的 ETF 股票代號');state.code=code;state.asOfDate='';state.compareDate='';state.filter='all';state.search='';redraw();}
 else if(b.dataset.activeDate){state.asOfDate=b.dataset.activeDate;redraw();}
 else if(b.hasAttribute('data-active-stock')){state.stockCode=compact(document.getElementById('activeStockCode')?.value);redraw();}
 else if(b.dataset.activeQuote){state.stockCode=b.dataset.activeQuote;redraw();document.querySelector('#activeStockCode')?.scrollIntoView({behavior:'smooth',block:'center'});}
 else if(b.hasAttribute('data-active-stock-details')){state.stockCode=compact(document.getElementById('activeStockCode')?.value||state.stockCode);window.TradeCompassBridge?.navigate?.('stockSearch');window.TradeCompassMarket?.select?.(state.stockCode);}
 else if(b.hasAttribute('data-active-refresh')){state.published=null;state.loaded=false;load();window.TradeCompassMarket?.load?.(true);}
 else if(b.hasAttribute('data-active-import-toggle')){state.showImport=!state.showImport;redraw();}
 else if(b.hasAttribute('data-active-remove')){if(!confirm('確定刪除此裝置上的 '+b.dataset.activeRemove+' 快照？'))return;state.local.snapshots[state.code]=(state.local.snapshots[state.code]||[]).filter(x=>x.date!==b.dataset.activeRemove);persist();redraw();}
 else if(b.hasAttribute('data-active-template'))download('主動ETF_完整持股CSV範本.csv','\ufeff股票代號,股票名稱,股數,權重\r\n2330,台積電,100000,10.5\r\n2454,聯發科,20000,5.2\r\n');
 else if(b.hasAttribute('data-active-export'))download('TradeCompass_主動ETF快照備份.json',JSON.stringify(state.local,null,2),'application/json');
});
document.addEventListener('change',e=>{if(e.target.id==='activePicker'&&e.target.value){state.code=e.target.value;state.asOfDate='';state.compareDate='';state.filter='all';state.search='';redraw();return;}if(e.target.id==='activeRestoreFile'&&e.target.files?.[0]){const file=e.target.files[0];file.text().then(t=>{const j=JSON.parse(t);if(j.schema!==1||!j.snapshots||typeof j.snapshots!=='object')throw Error('不是本系統匯出的持股快照 JSON');if(!confirm('還原會取代目前瀏覽器的主動式 ETF 持股快照，確定？'))return;state.local=j;persist();redraw();alert('已還原主動式 ETF 快照');}).catch(err=>alert('還原失敗：'+err.message));e.target.value='';}if(e.target.id==='activeAsOf'){state.asOfDate=e.target.value;redraw();return;}if(e.target.id==='activeCompareMode'){state.compareMode=e.target.value;redraw();return;}if(e.target.id==='activeCompareDate'){state.compareDate=e.target.value;redraw();return;}if(e.target.id==='activeFilter'){state.filter=e.target.value;redraw();}if(e.target.id==='activeImportFile'&&e.target.files?.[0]){importFile(e.target.files[0]);e.target.value='';}});
document.addEventListener('input',e=>{if(e.target.id==='activeSearch'){state.search=e.target.value;/* no rerender here; avoid input focus jumps */ const table=document.querySelector('.tc-table-scroll');if(table){for(const row of table.querySelectorAll('tbody tr'))row.hidden=!row.textContent.toLowerCase().includes(state.search.toLowerCase());}}});
document.addEventListener('keydown',e=>{if(e.target.id==='activeStockCode'&&e.key==='Enter'){e.preventDefault();document.querySelector('[data-active-stock]')?.click();}if(e.target.id==='activeCode'&&e.key==='Enter'){e.preventDefault();document.querySelector('[data-active-select]')?.click();}});
window.TradeCompassActiveETF={html,parseCSV,classify,getSnapshots,selectSnapshots,catalog,select(code){state.code=code;state.asOfDate='';state.compareDate='';redraw();}};
})();
