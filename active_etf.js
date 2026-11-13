/* Trade Compass v1.4 active ETF holdings. Requires two complete, dated PCF snapshots to infer changes. */
(function(){'use strict';
const STORAGE='trade-compass-active-etf-snapshots-v1';
const selectList=[['00981A','主動統一台股增長'],['009805','主動式 ETF'],['009819','主動台灣 ETF'],['009827','主動式 ETF'],['009831','主動式 ETF']];
const state={code:'00981A',filter:'all',search:'',local:{schema:1,snapshots:{}},published:null,loading:false,loaded:false,error:'',showImport:false};
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
 const code=state.code,snapshots=getSnapshots(code),curr=snapshots[0],prev=snapshots[1];
 const canCompare=!!(curr?.complete&&prev?.complete&&curr.date>prev.date);
 const changes=canCompare?classify(prev,curr):[];
 const q=window.TradeCompassMarket?.find(code);
 if(window.TradeCompassMarket?.status==='idle')queueMicrotask(()=>window.TradeCompassMarket.load());
 let s=`<div class="head"><div><div class="eyebrow">ACTIVE ETF PORTFOLIO MONITOR</div><h1>主動式 ETF 持股異動查詢</h1><p class="subtitle">查 ETF 開高低收、交易量、當沖、法人，以及兩份完整持股清單比較之新增／加碼／減碼／清倉</p></div><div class="actions"><button class="btn" data-active-refresh>↻ 重新載入公開資料</button><button class="btn" data-active-export>備份持股快照</button><label class="btn upload-label">還原快照 JSON<input type="file" id="activeRestoreFile" accept=".json,application/json" hidden></label></div></div>
 <div class="notice-banner">持股異動為<b>兩個公布日期快照差異</b>，不是當天實際委託成交；申購贖回、股票拆併股與基金規模變化可能影響股數。必須確認清單完整，才會判定「清倉」。私人匯入的持股快照只保存在目前瀏覽器。</div>
 <section class="panel tc-pad"><div class="tc-searchbar"><label for="activeCode">ETF 代號</label><input class="field" id="activeCode" list="activeSuggestions" value="${esc(code)}" placeholder="00981A"><datalist id="activeSuggestions">${selectList.map(([x,n])=>`<option value="${x}">${esc(n)}</option>`).join('')}</datalist><button class="btn primary" data-active-select>查詢</button><button class="btn" data-active-import-toggle>＋ 匯入官方 PCF 快照</button></div><div class="tc-flex" style="margin-top:13px"><span class="tc-badge">公開快照：${state.published?.updatedAt?esc(state.published.updatedAt):'尚無驗證資料'}</span><span class="tc-badge">本機快照：${state.local.snapshots?.[code]?.length||0} 筆</span></div></section>`;
 if(state.error)s+=`<div class="tc-empty" style="margin-bottom:15px">${esc(state.error)}</div>`;
 if(state.showImport)s+=`<section class="panel tc-pad"><h2 class="panel-title">匯入 ETF 每日完整持股清單（CSV）</h2>
 <p class="tc-note">從投信官網取得申購買回清單（PCF）後，可整理成 CSV：<b>股票代號, 股票名稱, 股數, 權重</b>。股數必須是「股」，不是「張」。允許只有權重，但只能判定權重增減，不能判定實際加減碼股數。日期請使用該清單所屬交易日。</p>
 <div class="tc-upload"><label>公布資料日期 <input class="field" type="date" id="activeImportDate"></label><label>來源網址或名稱 <input class="field" id="activeImportSource" placeholder="投信官方 PCF 網址"></label></div>
 <div class="tc-upload"><label class="tc-check"><input type="checkbox" id="activeComplete"> 我確認是該 ETF 在該日期的<b>完整</b>股票持股清單（不是前十大或部分摘錄）</label></div>
 <div class="tc-upload"><label class="btn primary upload-label">選取 CSV 並匯入<input type="file" id="activeImportFile" accept=".csv,text/csv" hidden></label><button class="btn" data-active-template>下載 CSV 範本</button><a href="https://www.twse.com.tw/zh/products/securities/etf/news.html" target="_blank" rel="noopener noreferrer" class="btn">查找官方 PCF 來源</a></div>
 <p class="fine">這個欄位只接受 CSV。完整持股資料須來自發行投信之官方 PCF／投資組合揭露，並保留來源；請勿上傳個人股票交易紀錄。</p></section>`;
 if(q){s+=`<section class="panel tc-pad"><h2 class="panel-title">${esc(q.name)}（${esc(code)}）交易行情</h2><p class="panel-sub">資料日：${esc(q.date)}，盤後官方快照</p></section>`+window.TradeCompassMarket.quoteOverview(q);}
 else{s+=`<section class="panel tc-pad tc-empty">目前尚無 ${esc(code)} 可驗證的官方盤後行情。可能是尚未跑過 GitHub Actions、該 ETF 不在本次公開資料中，或資料日無成交。以下持股快照功能仍可單獨使用。</section>`;}
 s+=`<section class="panel tc-pad"><div class="tc-section-head"><div><h2 class="panel-title">成分股持有與異動</h2><p class="panel-sub">最新：${esc(curr?.date||'尚無')} ｜ 對比：${esc(prev?.date||'尚無')} ｜ ${curr?.holdings?.length||0} 檔持股</p></div></div>`;
 if(!curr){s+=`<div class="no-data"><strong>尚未取得 ${esc(code)} 的完整每日持股快照</strong><p>請匯入至少兩個不同日期的官方完整 PCF 清單，才可以比較新增、加碼、減碼和清倉。沒有資料時不顯示虛構異動。</p></div>`;}
 else{
 if(!canCompare)s+=`<div class="tc-empty">⚠ ${!prev?'只有一份快照，請再匯入另一交易日':'至少一份快照未確認為完整清單'}，因此不判定新增、加碼、減碼或清倉；仍可查看目前快照。</div>`;
 else s+=`<div class="tc-flex" style="margin:12px 0">${Object.entries(badges).filter(([k])=>!k.startsWith('weight')).map(([k,[text]])=>`<span class="tc-badge">${text} ${changes.filter(x=>x.type===k).length} 檔</span>`).join('')}<span class="fine">${esc(prev.date)} → ${esc(curr.date)}</span></div>`;
 if(canCompare)s+=`<div class="tc-filter-row"><label>分類</label><select class="field" id="activeFilter">${[['all','全部異動'],...Object.entries(badges).map(([key,[name]])=>[key,name])].map(([val,title])=>`<option value="${val}" ${state.filter===val?'selected':''}>${title}</option>`).join('')}</select><label>搜尋</label><input class="field" id="activeSearch" value="${esc(state.search)}" placeholder="股票名稱或代號"></div>`;
 const shown=changes.filter(x=>(state.filter==='all'||x.type===state.filter)&&[x.name,x.code].some(t=>String(t).toLowerCase().includes(state.search.toLowerCase())));
 if(canCompare){s+=`<div class="table-wrap tc-table-scroll"><table class="data-table"><thead><tr><th>代號／名稱</th><th>異動類型</th><th class="num">前次股數</th><th class="num">最新股數</th><th class="num">股數變動</th><th class="num">權重變化</th></tr></thead><tbody>`;
 for(const x of shown){const [label,color]=badges[x.type];const weight=x.before?.weight!=null&&x.after?.weight!=null?((x.after.weight-x.before.weight)>0?'+':'')+fmt(x.after.weight-x.before.weight,2)+' pp':'—';
 s+=`<tr><td><b>${esc(x.code)}</b> ${esc(x.name)}</td><td><span class="tag ${color}">${label}</span></td><td class="num">${fmt(x.before?.shares)}</td><td class="num">${fmt(x.after?.shares)}</td><td class="num ${x.delta>0?'positive':x.delta<0?'negative':''}">${x.delta==null?'—':(x.delta>0?'+':'')+fmt(x.delta)}</td><td class="num">${weight}</td></tr>`;}
 s+=`</tbody></table></div>`;
 if(!shown.length)s+='<p class="tc-note">目前篩選條件沒有符合的異動。</p>';
 }
 s+=`<h3 class="panel-title" style="margin-top:23px">最新持股清單</h3><div class="table-wrap tc-table-scroll"><table class="data-table"><thead><tr><th>股票代號</th><th>股票名稱</th><th class="num">持有股數</th><th class="num">權重</th></tr></thead><tbody>`;
 for(const x of curr.holdings.slice().sort((a,b)=>(b.weight??0)-(a.weight??0))){s+=`<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td class="num">${fmt(x.shares)}</td><td class="num">${x.weight==null?'—':fmt(x.weight,2)+'%'}</td></tr>`;}
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
 persist();state.showImport=false;redraw();alert(`已保存 ${snap.holdings.length} 檔 ${date} 持股資料。本機快照不會上傳至 GitHub。`);
 }catch(e){alert('CSV 匯入失敗：'+e.message);}
 }).catch(e=>alert('無法讀取 CSV：'+e.message));
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-active-select],[data-active-refresh],[data-active-import-toggle],[data-active-remove],[data-active-template],[data-active-export]');if(!b)return;
 if(b.hasAttribute('data-active-select')){const code=compact(document.getElementById('activeCode')?.value);if(!validCode(code))return alert('請輸入正確的 ETF 股票代號');state.code=code;state.filter='all';state.search='';redraw();}
 else if(b.hasAttribute('data-active-refresh')){state.published=null;state.loaded=false;load();window.TradeCompassMarket?.load?.(true);}
 else if(b.hasAttribute('data-active-import-toggle')){state.showImport=!state.showImport;redraw();}
 else if(b.hasAttribute('data-active-remove')){if(!confirm('確定刪除此裝置上的 '+b.dataset.activeRemove+' 快照？'))return;state.local.snapshots[state.code]=(state.local.snapshots[state.code]||[]).filter(x=>x.date!==b.dataset.activeRemove);persist();redraw();}
 else if(b.hasAttribute('data-active-template'))download('主動ETF_完整持股CSV範本.csv','\ufeff股票代號,股票名稱,股數,權重\r\n2330,台積電,100000,10.5\r\n2454,聯發科,20000,5.2\r\n');
 else if(b.hasAttribute('data-active-export'))download('TradeCompass_主動ETF快照備份.json',JSON.stringify(state.local,null,2),'application/json');
});
document.addEventListener('change',e=>{if(e.target.id==='activeRestoreFile'&&e.target.files?.[0]){const file=e.target.files[0];file.text().then(t=>{const j=JSON.parse(t);if(j.schema!==1||!j.snapshots||typeof j.snapshots!=='object')throw Error('不是本系統匯出的持股快照 JSON');if(!confirm('還原會取代目前瀏覽器的主動式 ETF 持股快照，確定？'))return;state.local=j;persist();redraw();alert('已還原主動式 ETF 快照');}).catch(err=>alert('還原失敗：'+err.message));e.target.value='';}if(e.target.id==='activeFilter'){state.filter=e.target.value;redraw();}if(e.target.id==='activeImportFile'&&e.target.files?.[0]){importFile(e.target.files[0]);e.target.value='';}});
document.addEventListener('input',e=>{if(e.target.id==='activeSearch'){state.search=e.target.value;/* no rerender here; avoid input focus jumps */ const table=document.querySelector('.tc-table-scroll');if(table){for(const row of table.querySelectorAll('tbody tr'))row.hidden=!row.textContent.toLowerCase().includes(state.search.toLowerCase());}}});
document.addEventListener('keydown',e=>{if(e.target.id==='activeCode'&&e.key==='Enter'){e.preventDefault();document.querySelector('[data-active-select]')?.click();}});
window.TradeCompassActiveETF={html,parseCSV,classify,getSnapshots,select(code){state.code=code;redraw();}};
})();
