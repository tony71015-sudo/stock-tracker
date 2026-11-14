/* Trade Compass v1.4.9: indexed public actual portfolio snapshots, never creation baskets. */
(function(){'use strict';
const STORAGE='trade-compass-active-etf-snapshots-v1';
// Official SITCA active ETF bulletin snapshot (2026-11-14); the optional custom field handles future listings.
const catalog = [["00400A","主動國泰動能高息","股票"],["00401A","主動摩根台灣鑫收","股票"],["00402A","主動安聯美國科技","股票"],["00403A","主動統一升級50","股票"],["00404A","主動聯博動能50","股票"],["00405A","主動富邦台灣龍耀","股票"],["00406A","主動中信台灣收益","股票"],["00407A","主動凱基台灣","股票"],["00408A","主動第一金優股息","股票"],["00409A","主動復華全球50","股票"],["00410A","主動永豐科技趨勢","股票"],["00411A","主動統一前沿科技","股票"],["00412A","主動安聯亞半導體","股票"],["00415A","主動群益核心50","股票"],["00980A","主動野村臺灣優選","股票"],["00980D","主動聯博投等入息","債券"],["00981A","主動統一台股增長","股票"],["00981D","主動中信非投等債","債券"],["00982A","主動群益台灣強棒","股票"],["00982D","主動富邦動態入息","債券"],["00983A","主動中信ARK創新","股票"],["00983D","主動富邦複合收益","債券"],["00984A","主動安聯台灣高息","股票"],["00984D","主動聯博全球非投","債券"],["00985A","主動野村台灣50","股票"],["00985D","主動貝萊德優投等","債券"],["00986A","主動台新龍頭成長","股票"],["00986D","主動復華金融債息","債券"],["00987A","主動台新優勢成長","股票"],["00987D","主動統一美債量化","債券"],["00988A","主動統一全球創新","股票"],["00989A","主動摩根美國科技","股票"],["00990A","主動元大AI新經濟","股票"],["00991A","主動復華未來50","股票"],["00992A","主動群益科技創新","股票"],["00993A","主動安聯台灣","股票"],["00994A","主動第一金台股優","股票"],["00995A","主動中信台灣卓越","股票"],["00996A","主動兆豐台灣豐收","股票"],["00997A","主動群益美國增長","股票"],["00998A","主動復華金融股息","股票"],["00999A","主動野村臺灣高息","股票"]];
const selectList=catalog.map(([code,name])=>[code,name]);
const ETF_SOURCE='https://www.sitca.org.tw/ROC/SITCA_ETF/etf_bulletin.aspx';
const state={code:'00981A',filter:'all',search:'',local:{schema:1,snapshots:{}},published:null,loading:false,loaded:false,error:'',showImport:false,stockCode:'2330',stockTerm:'',asOfDate:'',compareMode:'previous',compareDate:'',archives:{},archiveStatus:{},archiveError:{},searching:false,searchMessage:'',feedStatus:null,showFeedCatalog:false,indexes:{},cacheStats:null,cacheMessage:'',cacheAvailable:true,pendingSearch:{}};
try{const raw=localStorage.getItem(STORAGE);if(raw){const x=JSON.parse(raw);if(x?.schema===1&&x.snapshots&&typeof x.snapshots==='object')state.local=x;}}catch(e){state.error='本機快照存取受限制：'+e.message;}
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const fmt=(x,d=0)=>x==null?'—':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:d,minimumFractionDigits:d});
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00'));
const validCode=x=>/^[0-9A-Z]{4,8}$/.test(x);
const validSecurityId=x=>/^[A-Z0-9][A-Z0-9.\-]{0,15}(?: [A-Z]{2,5})?$/.test(String(x||'').trim().toUpperCase());
const compact=s=>String(s||'').trim().toUpperCase();
const positive=v=>Number.isFinite(Number(v))&&Number(v)>=0;
const safeNum=s=>{if(s===undefined||s===null||String(s).trim()==='')return null;const x=Number(String(s).replaceAll(',','').replace('%','').trim());return Number.isFinite(x)&&x>=0?x:null;};
function redraw(){if(window.TradeCompassBridge?.isPage?.('activeETF'))window.TradeCompassBridge.render();}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(state.local));state.error='';}catch(e){state.error='無法保存本機持股快照：'+e.message;}}
async function load(){if(state.loading||state.published)return;
 state.loading=true;
 try{const res=await fetch('data/active-etf/latest.json?c='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json();if(data.schema!==1||typeof data.snapshots!=='object')throw Error('官方快照格式不正確');state.published=data;
  try{const rs=await fetch('data/active-etf/status.json?c='+Date.now(),{cache:'no-store'});if(rs.ok){const status=await rs.json();if(status.schema===1&&status.etfs&&typeof status.etfs==='object')state.feedStatus=status;}}catch(e){/* Status is informational. History queries continue. */}
 }
 catch(e){state.error='網站公開持股資料暫不可用：'+e.message;}finally{state.loading=false;state.loaded=true;redraw();}}
function validPublishedSnapshot(s){
 if(!s||!validDate(s.date)||!Array.isArray(s.holdings)||!s.source||!s.complete)return false;
 if(s.kind&&s.kind!=='actual_portfolio')return false;
 const unique=new Set();
 for(const x of s.holdings){if(!x||!validSecurityId(x.code)||unique.has(x.code))return false;unique.add(x.code);
  if(x.shares!==null&&(!Number.isSafeInteger(x.shares)||x.shares<0))return false;
  if(x.weight!==null&&(!Number.isFinite(x.weight)||x.weight<0||x.weight>100))return false;
 }
 return s.holdings.length>0;
}
const cache=()=>window.TradeCompassETFCache;
async function updateCacheStats(){
 try{state.cacheStats=await cache()?.stats();state.cacheAvailable=!!state.cacheStats;}
 catch(e){state.cacheAvailable=false;state.cacheMessage='IndexedDB 不可用，本次可使用網路資料，但無法持久快取：'+String(e.message||e);}
 redraw();
}
function appendArchive(code,snapshot){
 if(!validPublishedSnapshot(snapshot))throw Error('資料不是完整有效的基金實際持股');
 if(!Array.isArray(state.archives[code]))state.archives[code]=[];
 state.archives[code]=state.archives[code].filter(x=>x.date!==snapshot.date).concat({...snapshot,origin:'archive'}).sort((x,y)=>y.date.localeCompare(x.date));
}
async function fetchOfficialDay(code,date,refresh=false){
 if(!validCode(code)||!validDate(date))return false;
 const already=state.archives[code]?.some(x=>x.date===date);
 if(already&&!refresh)return true;
 if(!refresh){try{const saved=await cache()?.getSnapshot(code,date);if(saved&&validPublishedSnapshot(saved)){appendArchive(code,saved);return true;}}catch(e){state.cacheAvailable=false;}}
 try{
  const url='data/active-etf/daily/'+encodeURIComponent(code)+'/'+encodeURIComponent(date)+'.json';
  const result=await fetch(url,{cache:refresh?'no-store':'default'});
  if(!result.ok)throw Error('HTTP '+result.status);
  const json=await result.json();
  if(json.schema!==1||json.etf!==code||json.snapshot?.date!==date||!validPublishedSnapshot(json.snapshot))throw Error('官方持股日期或完整性驗證失敗');
  appendArchive(code,json.snapshot);
  try{await cache()?.putSnapshot(code,json.snapshot);}catch(e){state.cacheAvailable=false;}
  return true;
 }catch(e){
  // Offline fallback from a previously verified IndexedDB entry.
  try{const saved=await cache()?.getSnapshot(code,date);if(saved&&validPublishedSnapshot(saved)){appendArchive(code,saved);state.cacheMessage='網路暫不可用，已使用本機已驗證快照';return true;}}catch(_e){}
  state.archiveError[code]=date+'：'+String(e.message||e);
  return false;
 }
}
async function searchArchive(code,refresh=false){
 if(!validCode(code))return;
 if(state.archiveStatus[code]==='loading'){state.pendingSearch[code]=true;return;}
 state.archiveStatus[code]='loading';state.searching=true;state.archiveError[code]='';
 state.searchMessage=`正在取得 ${code} 日期索引與兩日官方完整持股…`;redraw();
 try{
  let index=!refresh?state.indexes[code]:null;
  if(!index){
   try{
    const result=await fetch('data/active-etf/indexes/'+encodeURIComponent(code)+'.json',{cache:refresh?'no-store':'default'});
    if(result.status===404){
     // Compatibility with existing v1.4.8 archives until the first successful new collector run.
     const old=await fetch('data/active-etf/history/'+encodeURIComponent(code)+'.json',{cache:'no-store'});
     if(old.status===404){state.archives[code]=state.archives[code]||[];state.indexes[code]={dates:[]};state.archiveStatus[code]='empty';state.searchMessage=`${code} 尚未發布官方實際持股歷史檔（非清倉）。`;return;}
     if(!old.ok)throw Error('舊版公開歷史檔 HTTP '+old.status);
     const data=await old.json();
     if(data.schema!==1||data.etf!==code||!Array.isArray(data.snapshots)||!data.snapshots.every(validPublishedSnapshot))throw Error('舊版歷史資料驗證失敗');
     const dates=[...new Set(data.snapshots.map(x=>x.date))].sort().reverse();
     index={dates};state.indexes[code]=index;
     // The legacy file has already been downloaded, so record all verified snapshots locally.
     for(const snap of data.snapshots){appendArchive(code,snap);try{await cache()?.putSnapshot(code,snap);}catch(e){state.cacheAvailable=false;}}
    }else{
     if(!result.ok)throw Error('日期索引 HTTP '+result.status);
     const data=await result.json();
     if(data.schema!==1||data.etf!==code||!Array.isArray(data.dates)||!data.dates.every(validDate))throw Error('日期索引格式錯誤');
     index={dates:[...new Set(data.dates)].sort().reverse()};state.indexes[code]=index;
     try{await cache()?.putManifest(code,index);}catch(e){state.cacheAvailable=false;}
    }
   }catch(e){
    let saved=null;try{saved=await cache()?.getManifest(code);}catch(_e){}
    if(!saved?.dates)throw e;
    index=saved;state.indexes[code]=index;state.cacheMessage='使用離線已保存日期索引';
   }
  }
  const dates=index?.dates||[];
  if(!dates.length){state.archiveStatus[code]='empty';state.searchMessage=`${code} 尚無官方完整實際持股日期，可使用手動匯入。`;return;}
  // Never substitute another day when the user explicitly selected a date.
  const selected=state.asOfDate||dates[0];
  const baseline=state.compareMode==='custom'?state.compareDate:dates.find(x=>x<selected);
  const required=[selected,baseline].filter(x=>x&&dates.includes(x));
  const loaded=await Promise.all([...new Set(required)].map(x=>fetchOfficialDay(code,x,refresh)));
  state.archiveStatus[code]=loaded.some(Boolean)?'ready':'empty';
  state.searchMessage=loaded.some(Boolean)?`已取得 ${code} 的 ${loaded.filter(Boolean).length} 份指定日期持股；其他日期需要時才下載。`:`${code} 查詢日期尚無可讀取的完整持股；${state.archiveError[code]||'請確認發行投信資料是否已發布。'}`;
 }catch(e){state.archiveStatus[code]='error';state.archiveError[code]=String(e.message||e);state.searchMessage='資料讀取失敗，可檢查連線或更新紀錄。';}
 finally{state.searching=false;updateCacheStats();redraw();if(state.pendingSearch[code]){delete state.pendingSearch[code];queueMicrotask(()=>searchArchive(code));}}
}
function availablePublicDates(code){
 return new Set([...(state.indexes[code]?.dates||[]),...[...(state.published?.snapshots?.[code]||[]),...(state.archives[code]||[])].filter(validPublishedSnapshot).map(x=>x.date)]);
}
function getSnapshots(code){
 const all=[...(state.published?.snapshots?.[code]||[]).map(x=>({...x,origin:'public'})),...(state.archives[code]||[]).map(x=>({...x,origin:'archive'})),...(state.local.snapshots?.[code]||[]).map(x=>({...x,origin:'local'}))];
 const map=new Map();for(const s of all){if(!validDate(s.date)||!Array.isArray(s.holdings))continue;
 // User-imported record takes precedence if the same date is present.
 const old=map.get(s.date);if(!old||s.origin==='local'||(s.origin==='archive'&&old.origin==='public'))map.set(s.date,s);}
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
 const verified=validOrder&&!!current.complete&&!!previous.complete&&
   (!current.kind||current.kind==='actual_portfolio')&&(!previous.kind||previous.kind==='actual_portfolio');
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
   const code=compact(cols[ccol]);if(!validSecurityId(code))throw Error(`第 ${j+2} 行證券識別碼無效`);
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
 return {date:meta.date,source:meta.source.slice(0,180),complete:meta.complete,kind:'actual_portfolio',holdings,importedAt:new Date().toISOString()};
}
// Full portfolio-by-portfolio comparison: unchanged positions are retained.
function portfolioRows(previous,current){
 if(!previous?.complete||!current?.complete||previous.date>=current.date)return [];
 const a=new Map(previous.holdings.map(x=>[x.code,x]));
 const b=new Map(current.holdings.map(x=>[x.code,x]));
 return [...new Set([...a.keys(),...b.keys()])].map(code=>{
   const before=a.get(code)||null,after=b.get(code)||null;
   const prevShares=before?.shares??(before?null:0);
   const currShares=after?.shares??(after?null:0);
   const delta=prevShares===null||currShares===null?null:currShares-prevShares;
   const weightPrev=before?.weight??(before?null:0);
   const weightCurr=after?.weight??(after?null:0);
   let status=before&&!after?'cleared':!before&&after?'new':delta>0?'increased':delta<0?'decreased':'unchanged';
   if(status==='unchanged'&&weightPrev!=null&&weightCurr!=null&&Math.abs(weightCurr-weightPrev)>1e-9)
     status=weightCurr>weightPrev?'weight_up':'weight_down';
   return {code,name:after?.name||before?.name||code,before:prevShares,after:currShares,delta,
     weightBefore:weightPrev,weightAfter:weightCurr,
     weightDelta:weightPrev===null||weightCurr===null?null:weightCurr-weightPrev,status};
 }).sort((x,y)=>Math.abs(y.delta??0)-Math.abs(x.delta??0)||x.code.localeCompare(y.code));
}
// Cash, deposits, and futures are not equities. Never infer TWD or contract
// units when the upstream scraper omitted unit metadata.
function assetPositionRows(previous,current){
 const a=new Map((previous?.assetPositions||[]).map(x=>[x.type+':'+x.id,x]));
 const b=new Map((current?.assetPositions||[]).map(x=>[x.type+':'+x.id,x]));
 return [...new Set([...a.keys(),...b.keys()])].map(key=>{
  const before=a.get(key),after=b.get(key),pos=after||before;
  const w0=before?.weight??null,w1=after?.weight??null;
  const comparable=!!before&&!!after&&!!before.unitVerified&&!!after.unitVerified&&before.unit===after.unit;
  const q0=comparable?before.reportedValue:null,q1=comparable?after.reportedValue:null;
  return {type:pos.type,name:pos.name,id:pos.id,unit:comparable?pos.unit:'來源單位待核實',
   before:q0,after:q1,delta:comparable&&q0!=null&&q1!=null?q1-q0:null,
   weightBefore:w0,weightAfter:w1,weightDelta:w0!=null&&w1!=null?w1-w0:null};
 });
}
function assetPositionsHTML(prev,curr,canCompare){
 const records=curr?.assetPositions||[];
 if(!records.length)return '';
 const names={cash:'現金／存款',futures:'期貨',margin:'保證金',receivable_payable:'應收／應付款'};
 const rows=canCompare?assetPositionRows(prev,curr):records.map(x=>({type:x.type,name:x.name,id:x.id,
   after:x.unitVerified?x.reportedValue:null,unit:x.unitVerified?x.unit:'來源單位待核實',
   before:null,delta:null,weightBefore:null,weightAfter:x.weight,weightDelta:null}));
 let output='<h3 class="panel-title" style="margin-top:24px">非股票資產｜現金、存款、期貨、保證金</h3>';
 output+='<p class="tc-note">僅在兩日期、同一部位、單位明確且一致時比較金額或期貨口數；未標單位者僅比較權重，不將來源數值誤認為新臺幣或口數。缺少部位不直接視為零。</p>';
 output+='<div class="table-wrap"><table class="data-table"><thead><tr><th>類別／名稱</th><th>單位</th><th class="num">基準值</th><th class="num">查詢值</th><th class="num">變化</th><th class="num">權重變化</th></tr></thead><tbody>';
 for(const x of rows){output+=`<tr><td>${esc(names[x.type]||x.type)}｜${esc(x.name)}</td><td>${esc(x.unit)}</td><td class="num">${x.before==null?'—':fmt(x.before)}</td><td class="num">${x.after==null?'—':fmt(x.after)}</td><td class="num">${x.delta==null?'—':(x.delta>0?'+':'')+fmt(x.delta)}</td><td class="num">${x.weightDelta==null?'—':(x.weightDelta>0?'+':'')+fmt(x.weightDelta,2)+' pp'}</td></tr>`;}
 output+='</tbody></table></div>';return output;
}
function csvEscape(x){const t=String(x??'');return /[",\r\n]/.test(t)?'"'+t.replaceAll('"','""')+'"':t;}
function comparisonCSV(code,previous,current){
 const header=['ETF代號','比較日期','查詢日期','股票代號','股票名稱','前日股數','當日股數','股數增減','前日權重%','當日權重%','權重變動百分點','分類'];
 const names={new:'新增',increased:'股數增加',decreased:'股數減少',cleared:'清倉',weight_up:'權重上升',weight_down:'權重下降',unchanged:'不變'};
 const entries=portfolioRows(previous,current).map(x=>[code,previous.date,current.date,x.code,x.name,x.before,x.after,x.delta,x.weightBefore,x.weightAfter,x.weightDelta,names[x.status]]);
 return '\ufeff'+[header,...entries].map(line=>line.map(csvEscape).join(',')).join('\r\n')+'\r\n';
}
// A single official export can include several dates and/or ETFs; each group is checked independently.
function parseMultiDateCSV(text,source,complete){
 const rows=csvParser(text.replace(/^\ufeff/,''));if(rows.length<2)throw Error('檔案沒有持股資料');
 const h=rows[0].map(x=>x.replace(/\s+/g,'').toLowerCase());
 const find=(...names)=>h.findIndex(x=>names.some(n=>x===n.toLowerCase()));
 const etf=find('ETF代號','etf','etf_code'),date=find('資料日期','日期','date');
 if(etf<0||date<0)throw Error('多日期檔案必須包含 ETF代號 與 資料日期');
 const groups=new Map();
 for(const [i,row] of rows.slice(1).entries()){
   const code=compact(row[etf]),day=String(row[date]||'').trim();
   if(!validCode(code)||!validDate(day))throw Error(`第 ${i+2} 行 ETF 或日期不正確`);
   const k=code+'|'+day;if(!groups.has(k))groups.set(k,[rows[0]]);
   groups.get(k).push(row);
 }
 if(groups.size>400)throw Error('單次最多 400 份日期快照');
 const snapshots=[];
 for(const [k,table] of groups){const [code,date]=k.split('|');
   const csv=table.map(r=>r.map(csvEscape).join(',')).join('\n');
   const snap=parseCSV(csv,{date,code,source,complete});
   if(snap.holdings.length<2)throw Error(`${code} ${date} 僅 ${snap.holdings.length} 檔，拒絕視為完整持股`);
   snapshots.push({code,...snap});
 }
 return snapshots;
}
function html(){if(!state.loaded&&!state.loading)queueMicrotask(load);
 const code=state.code,snapshots=getSnapshots(code);
 if(!state.archiveStatus[code]&&!state.searching)queueMicrotask(()=>searchArchive(code));
 const selection=selectSnapshots(snapshots,state.asOfDate,state.compareMode,state.compareDate);
 const curr=selection.current,prev=selection.previous,canCompare=selection.verified;
 const changes=canCompare?classify(prev,curr):[];
 const q=window.TradeCompassMarket?.find(code);
 if(window.TradeCompassMarket?.status==='idle')queueMicrotask(()=>window.TradeCompassMarket.load());
 let s=`<div class="head"><div><div class="eyebrow">ACTIVE ETF PORTFOLIO MONITOR</div><h1>主動式 ETF 每日持股歷史比較</h1><p class="subtitle">以基金每日實際投資組合為基準，查指定日期、前後持股與股數／權重異動；另附 ETF 與個股行情</p></div><div class="actions"><button class="btn" data-active-refresh>↻ 重新載入公開資料</button><button class="btn" data-active-export>備份持股快照</button><label class="btn upload-label">還原快照 JSON<input type="file" id="activeRestoreFile" accept=".json,application/json" hidden></label></div></div>
 <div class="notice-banner">持股異動為<b>兩個公布日期快照差異</b>，不是當天實際委託成交；申購贖回、股票拆併股與基金規模變化可能影響股數。必須確認清單完整，才會判定「清倉」。私人匯入的持股快照只保存在目前瀏覽器。</div>
 <section class="panel tc-pad"><div class="tc-searchbar"><label for="activePicker">選擇主動式 ETF</label><select class="field tc-active-select" id="activePicker" aria-label="選擇主動式 ETF"><option value="">選擇 ETF（${catalog.length} 檔）</option>${catalog.map(([x,n,k])=>`<option value="${esc(x)}" ${x===code?'selected':''}>${esc(x)}｜${esc(n)}（${esc(k)}）</option>`).join('')}</select><label for="activeCode">自行輸入代號</label><input class="field" id="activeCode" value="${esc(code)}" placeholder="例如 00982A"><button class="btn primary" data-active-select>查詢 ETF</button><button class="btn" data-active-query>按需讀取已公布持股</button><button class="btn" data-active-import-toggle>＋ 匯入官方完整持股</button></div><div class="tc-flex" style="margin-top:13px"><span class="tc-badge">官方名單 ${catalog.length} 檔（2026/11/14）</span><span class="tc-badge">目前標的：${esc(catalog.find(x=>x[0]===code)?.[1]||'自訂代號 '+code)}</span><span class="tc-badge">公開歷史快照：${availablePublicDates(code).size} 日</span><span class="tc-badge">手動匯入：${state.local.snapshots?.[code]?.length||0} 日</span></div><p class="tc-note">ETF 清單依<a href="${ETF_SOURCE}" target="_blank" rel="noopener noreferrer">投信投顧公會官方名單</a>整理；沒有兩日經驗證的完整持股時，會明確標示「暫時無法比較」。選得到代號不等於有完整持股，必須取得投信揭露的完整實際持股（PCF 籃子不一定相同）才能計算每日差異。新上市代號可在右側自行輸入。</p></section>`;
 const feedMap=state.feedStatus?.etfs||{};
 const statusTotals={ok:0,not_configured:0,not_verified:0,error:0};
 for(const [code] of catalog){const status=feedMap[code]?.status||'not_configured';statusTotals[status]=(statusTotals[status]||0)+1;}
 const selectedFeed=feedMap[code]||{status:'not_configured',detail:'尚未配置完整官方持股來源'};
 const statusName={ok:'已有持股資料',stale:'資料較舊',not_configured:'暫時無法比較',not_verified:'暫時無法比較',error:'更新失敗'};
 const comparisonLabel=(ticker,row)=>{const days=Math.max(Number(row?.historicalDates||0),availablePublicDates(ticker).size);return days>=2?'可選兩個已保存日期比較':days===1?'只有單日資料，暫時無法比較':'暫時無法比較（沒有兩份有效持股）';};
 s+=`<section class="panel tc-pad" id="activeFeeds"><div class="tc-section-head"><div><h2 class="panel-title">42 檔主動式 ETF 實際持股／比較可用性</h2><p class="panel-sub">已有持股 ${statusTotals.ok} 檔・資料較舊 ${statusTotals.stale||0} 檔・暫不可比對 ${statusTotals.not_configured+statusTotals.not_verified} 檔・失敗 ${statusTotals.error} 檔</p></div><button class="btn sm" data-active-feeds>${state.showFeedCatalog?'收合狀態':'查看全部 42 檔'}</button></div><p class="tc-note">目前查詢 ${esc(code)}：<b>${esc(statusName[selectedFeed.status]||'待設定')}</b>。${esc(selectedFeed.detail||'最後持股日 '+(selectedFeed.date||'—'))}｜<b>${esc(comparisonLabel(code,selectedFeed))}</b>。已保存 ${Number(selectedFeed.historicalDates||0)} 份完整快照。<span class="fine">最近檢查：${esc(state.feedStatus?.checkedAt||'尚未執行')}</span></p>`;
 if(state.showFeedCatalog){s+=`<div class="table-wrap"><table class="data-table"><thead><tr><th>ETF</th><th>資料狀態</th><th>比較能力</th><th>最後持股日期</th><th class="num">歷史快照</th></tr></thead><tbody>${catalog.map(([ticker,title])=>{const row=feedMap[ticker]||{};return `<tr><td><button class="btn sm ghost" data-active-feed-code="${esc(ticker)}">${esc(ticker)} ${esc(title)}</button></td><td>${esc(statusName[row.status]||'暫時無法比較')}</td><td>${esc(comparisonLabel(ticker,row))}</td><td>${esc(row.date||'—')}</td><td class="num">${fmt(row.historicalDates||0)}</td></tr>`;}).join('')}</tbody></table></div>`;}
 s+='</section>';
 s+=`<section class="panel tc-pad" id="activeCache"><div class="tc-section-head"><div><h2 class="panel-title">本機快取與容量管理</h2><p class="panel-sub">官方已驗證持股以 IndexedDB 保存；使用者的交易紀錄與手動匯入快照不受影響。</p></div><div class="actions"><button class="btn sm" data-active-cache-stats>更新容量</button><button class="btn sm danger" data-active-cache-clear>清除公開持股快取</button></div></div><div class="tc-flex"><span class="tc-badge">快取快照：${state.cacheStats?fmt(state.cacheStats.entries):'—'} 份</span><span class="tc-badge">日期索引：${state.cacheStats?fmt(state.cacheStats.indexes):'—'} 檔</span><span class="tc-badge">持股內容估計：${state.cacheStats?(state.cacheStats.bytes/1024/1024).toFixed(2)+' MiB':'—'}</span></div><p class="tc-note">${esc(state.cacheMessage||'僅按需下載所選 ETF、查詢日及比較日，已下載的官方快照可在此裝置離線重用。容量為快照 JSON 估算，不包含瀏覽器索引及其他網站資料。')}</p></section>`;
 s+=`<div class="tc-archive-status ${state.archiveStatus[code]==='ready'?'is-ok':''}"><b>前台自動查詢：</b>${esc(state.searchMessage||'點「按需讀取已公布持股」，讀取已收集的投信官方資料。')}<br><span class="fine">${state.archiveStatus[code]==='ready'?'來源：GitHub Pages 已發布的歷史檔案；若來自開源抓取器，仍需與投信原始完整持股核對':state.archiveStatus[code]==='empty'?'此 ETF 尚無自動歸檔來源，不代表無持股':state.archiveStatus[code]==='error'?'歷史讀取失敗：'+esc(state.archiveError[code]):'只會讀取完整且有效的公開快照'}</span></div>`;
 if(state.error)s+=`<div class="tc-empty" style="margin-bottom:15px">${esc(state.error)}</div>`;
 if(state.showImport)s+=`<section class="panel tc-pad"><h2 class="panel-title">匯入 ETF 每日完整持股清單（CSV）</h2>
 <p class="tc-note">從投信官網取得<b>基金實際完整投資組合明細</b>（不是只含一申購單位的 PCF 籃子）後，可整理成 CSV：<b>股票代號, 股票名稱, 股數, 權重</b>。股數必須是「股」，不是「張」。允許只有權重，但只能判定權重增減，不能判定實際加減碼股數。日期請使用該清單所屬交易日。</p>
 <div class="tc-upload"><label>公布資料日期 <input class="field" type="date" id="activeImportDate"></label><label>來源網址或名稱 <input class="field" id="activeImportSource" placeholder="投信官方實際持股揭露網址"></label></div>
 <div class="tc-upload"><label class="tc-check"><input type="checkbox" id="activeComplete"> 我確認是該 ETF 在該日期的<b>完整</b>股票持股清單（不是前十大或部分摘錄）</label></div>
 <div class="tc-upload"><label class="btn primary upload-label">選取 CSV 並匯入<input type="file" id="activeImportFile" accept=".csv,text/csv" hidden></label><button class="btn" data-active-template>下載 CSV 範本</button><a href="https://www.twse.com.tw/zh/products/securities/etf/news.html" target="_blank" rel="noopener noreferrer" class="btn">查找官方 PCF 來源</a></div>
 <p class="fine">這個欄位只接受 CSV。完整持股資料須來自發行投信之官方實際投資組合揭露；PCF 申購籃子不得直接視為基金實際持股，並保留來源；請勿上傳個人股票交易紀錄。</p>
 <div class="vline"></div><h3 class="panel-title">一次匯入多檔 ETF、多個日期</h3>
 <p class="tc-note">CSV 欄位：ETF代號,資料日期,股票代號,股票名稱,股數,權重。日期必須為 YYYY-MM-DD；每個 ETF 每個日期都須為完整實際持股，不接受 PCF 申購籃子。</p>
 <label class="btn upload-label">選取多日期官方持股 CSV<input type="file" id="activeBulkFile" accept=".csv,text/csv" hidden></label>
 <button class="btn" data-active-bulk-template>下載多日期 CSV 範本</button></section>`;
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
 ${snapshots.length?`<p class="tc-note" style="margin:10px 0 13px">已保存 ${snapshots.length} 個日期：${snapshots.map(x=>`<button class="btn sm tc-date-chip" data-active-date="${esc(x.date)}">${esc(x.date)}${x.complete?'':' ⚠'}</button>`).join(' ')} </p>`:`<p class="tc-note" style="margin:10px 0 13px">目前沒有可選的持股快照日期。ETF 代號清單不等於持股資料，須由投信每日完整投資組合來源取得或匯入。</p>`}
 <div class="tc-archive-commands"><button class="btn primary" data-active-query>🔎 查詢指定日期並比較</button><span class="fine">不需開啟 GitHub Actions；若無資料，需先由排程取得官方完整持股。</span></div><p class="tc-note">查詢日：<b>${esc(selection.target||'未選擇')}</b>｜比較日：<b>${esc(selection.comparisonDate||'尚無')}</b>｜查詢日持股 <b>${curr?.holdings?.length||0}</b> 檔。只有完整快照才可判定新增或清倉。自動模式使用「前一份有保存資料的日期」，未保證是前一交易日。</p>`;
 if(!curr){s+=`<div class="no-data"><strong>查無 ${esc(code)} 在 ${esc(selection.target||'指定日期')} 的完整持股快照</strong><p>已保存 ${snapshots.length} 個日期，不能將最近日期冒充你查詢的那天。請匯入該交易日的投信官方完整實際投資組合，或確認自動更新來源是否具備歷史檔。</p><button class="btn sm" data-active-import-toggle>匯入缺少日期的完整持股</button></div>`;}
 else{
 if(!canCompare){const why=(!prev)?`找不到 ${state.compareMode==='custom'?esc(state.compareDate||'指定比較日期'):'更早日期'} 的快照`:!selection.validOrder?'比較日期必須早於查詢日期':'至少一份快照未確認為完整清單';s+=`<div class="tc-empty">⚠ ${why}。目前只能查看查詢日持股，不進行新增／加碼／減碼／清倉判定。請匯入兩日的官方完整實際持股資料。</div>`;}
 else s+=`${selection.gaps>4?`<div class="tc-empty">注意：兩份快照相隔 ${selection.gaps} 個日曆日，期間可能存在未保存的交易日；以下只代表這兩個日期之間的淨變化，不代表每天操作紀錄。</div>`:''}<div class="tc-flex" style="margin:12px 0">${Object.entries(badges).filter(([k])=>!k.startsWith('weight')).map(([k,[text]])=>`<span class="tc-badge">${text} ${changes.filter(x=>x.type===k).length} 檔</span>`).join('')}<span class="fine">${esc(prev.date)} → ${esc(curr.date)}</span></div>`;
 if(canCompare)s+=`<div class="tc-filter-row"><label>分類</label><select class="field" id="activeFilter">${[['all','全部異動'],...Object.entries(badges).map(([key,[name]])=>[key,name])].map(([val,title])=>`<option value="${val}" ${state.filter===val?'selected':''}>${title}</option>`).join('')}</select><label>搜尋</label><input class="field" id="activeSearch" value="${esc(state.search)}" placeholder="股票名稱或代號"></div>`;
 const shown=changes.filter(x=>(state.filter==='all'||x.type===state.filter)&&[x.name,x.code].some(t=>String(t).toLowerCase().includes(state.search.toLowerCase())));
 if(canCompare){s+=`<div class="table-wrap tc-table-scroll"><table class="data-table"><thead><tr><th>代號／名稱</th><th>異動類型</th><th class="num">前次股數</th><th class="num">最新股數</th><th class="num">股數變動</th><th class="num">權重變化</th></tr></thead><tbody>`;
 for(const x of shown){const [label,color]=badges[x.type];const weight=x.before?.weight!=null&&x.after?.weight!=null?((x.after.weight-x.before.weight)>0?'+':'')+fmt(x.after.weight-x.before.weight,2)+' pp':'—';
 s+=`<tr><td><button class="tc-code-btn" data-active-quote="${esc(x.code)}" title="查詢個股收盤價">${esc(x.code)}</button> ${esc(x.name)}</td><td><span class="tag ${color}">${label}</span></td><td class="num">${fmt(x.before?.shares)}</td><td class="num">${fmt(x.after?.shares)}</td><td class="num ${x.delta>0?'positive':x.delta<0?'negative':''}">${x.delta==null?'—':(x.delta>0?'+':'')+fmt(x.delta)}</td><td class="num">${weight}</td></tr>`;}
 s+=`</tbody></table></div>`;
 if(!shown.length)s+='<p class="tc-note">目前篩選條件沒有符合的異動。</p>';
 // Complete side-by-side portfolio, including unchanged positions.
 s+=`<div class="tc-section-head" style="margin-top:24px"><div><h3 class="panel-title">兩日完整持股對照（含未異動）</h3><p class="panel-sub">${esc(prev.date)} → ${esc(curr.date)}；「股數」單位為股，權重差單位為百分點</p></div><button class="btn sm" data-active-export-comparison>↓ 下載比較 CSV</button></div>`;
 s+=`<div class="table-wrap tc-table-scroll"><table class="data-table"><thead><tr><th>代號／名稱</th><th class="num">基準日股數</th><th class="num">查詢日股數</th><th class="num">股數增減</th><th class="num">基準日權重</th><th class="num">查詢日權重</th><th class="num">權重差</th></tr></thead><tbody>`;
 for(const x of portfolioRows(prev,curr)){s+=`<tr><td><button class="tc-code-btn" data-active-quote="${esc(x.code)}">${esc(x.code)}</button> ${esc(x.name)}</td><td class="num">${fmt(x.before)}</td><td class="num">${fmt(x.after)}</td><td class="num ${x.delta>0?'positive':x.delta<0?'negative':''}">${x.delta==null?'—':(x.delta>0?'+':'')+fmt(x.delta)}</td><td class="num">${x.weightBefore==null?'—':fmt(x.weightBefore,2)+'%'}</td><td class="num">${x.weightAfter==null?'—':fmt(x.weightAfter,2)+'%'}</td><td class="num ${x.weightDelta>0?'positive':x.weightDelta<0?'negative':''}">${x.weightDelta==null?'—':(x.weightDelta>0?'+':'')+fmt(x.weightDelta,2)+' pp'}</td></tr>`;}
 s+='</tbody></table></div>';
 }
 s+=assetPositionsHTML(prev,curr,canCompare);
 s+=`<h3 class="panel-title" style="margin-top:23px">${esc(curr.date)} 持股清單</h3><div class="table-wrap tc-table-scroll"><table class="data-table"><thead><tr><th>股票代號</th><th>股票名稱</th><th class="num">持有股數</th><th class="num">權重</th></tr></thead><tbody>`;
 for(const x of curr.holdings.slice().sort((a,b)=>(b.weight??0)-(a.weight??0))){s+=`<tr><td><button class="tc-code-btn" data-active-quote="${esc(x.code)}" title="查詢個股收盤價">${esc(x.code)}</button></td><td>${esc(x.name)}</td><td class="num">${fmt(x.shares)}</td><td class="num">${x.weight==null?'—':fmt(x.weight,2)+'%'}</td></tr>`;}
 s+='</tbody></table></div>';
 }
 s+=`</section><section class="panel tc-pad"><h2 class="panel-title">歷次快照與資料來源</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>資料日期</th><th>來源</th><th>持股檔數</th><th>完整性</th><th>操作</th></tr></thead><tbody>`;
 for(const x of snapshots){s+=`<tr><td>${esc(x.date)}</td><td>${esc(x.source||'未註明')}</td><td>${fmt(x.holdings.length)}</td><td>${x.complete?'<span class="tag mint">已確認完整</span>':'<span class="tag gold">未確認完整</span>'}</td><td>${x.origin==='local'?`<button class="btn sm danger" data-active-remove="${esc(x.date)}">刪除本機快照</button>`:'公開快照'}</td></tr>`;}
 s+=`</tbody></table></div></section><div class="tc-note">資料儲存：手動持股 CSV 匯入後，保留在此瀏覽器的 localStorage；公開持股使用 IndexedDB 快取（鍵：${STORAGE}）。更換電腦／清除瀏覽器網站資料可能遺失，請定期按「備份持股快照」。這份資料與原交易紀錄 JSON 備份分開。</div>`;
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
document.addEventListener('click',e=>{const b=e.target.closest('[data-active-cache-clear],[data-active-cache-stats],[data-active-export-comparison],[data-active-bulk-template],[data-active-feeds],[data-active-feed-code],[data-active-select],[data-active-query],[data-active-refresh],[data-active-import-toggle],[data-active-remove],[data-active-template],[data-active-export],[data-active-stock],[data-active-quote],[data-active-stock-details],[data-active-date]');if(!b)return;
 if(b.hasAttribute('data-active-cache-stats')){updateCacheStats();return;}
 if(b.hasAttribute('data-active-cache-clear')){if(!confirm('清除本裝置的官方持股快取？不會清除個人交易或手動匯入快照。'))return;(async()=>{try{await cache()?.clear();state.archives={};state.indexes={};state.archiveStatus={[state.code]:'empty'};state.cacheMessage='已清除公開持股快取，下次查詢將從網站重新取得。';await updateCacheStats();}catch(e){alert('清除快取失敗：'+e.message);}})();return;}
 if(b.hasAttribute('data-active-export-comparison')){const snaps=getSnapshots(state.code);const selected=selectSnapshots(snaps,state.asOfDate,state.compareMode,state.compareDate);if(!selected.verified)return alert('必須有兩日完整實際持股才能匯出比較');download(`${state.code}_${selected.previous.date}_vs_${selected.current.date}_holdings.csv`,comparisonCSV(state.code,selected.previous,selected.current));return;}
 if(b.hasAttribute('data-active-bulk-template')){download('主動ETF_多日期實際持股_範本.csv','\ufeffETF代號,資料日期,股票代號,股票名稱,股數,權重\r\n00981A,2026-11-09,2330,台積電,100000,8.1\r\n00981A,2026-11-09,2454,聯發科,50000,4.3\r\n00981A,2026-11-10,2330,台積電,120000,9.0\r\n00981A,2026-11-10,2454,聯發科,40000,3.5\r\n');return;}
 if(b.hasAttribute('data-active-feeds')){state.showFeedCatalog=!state.showFeedCatalog;redraw();return;}
 if(b.dataset.activeFeedCode){state.code=b.dataset.activeFeedCode;state.asOfDate='';state.compareDate='';state.searchMessage='';searchArchive(state.code);redraw();return;}
 if(b.hasAttribute('data-active-query')){state.archiveStatus[state.code]='';searchArchive(state.code,true);}
 else if(b.hasAttribute('data-active-select')){const code=compact(document.getElementById('activeCode')?.value);if(!validCode(code))return alert('請輸入正確的 ETF 股票代號');state.code=code;state.asOfDate='';state.compareDate='';state.filter='all';state.search='';state.searchMessage='';searchArchive(code);redraw();}
 else if(b.dataset.activeDate){state.asOfDate=b.dataset.activeDate;redraw();}
 else if(b.hasAttribute('data-active-stock')){state.stockCode=compact(document.getElementById('activeStockCode')?.value);redraw();}
 else if(b.dataset.activeQuote){state.stockCode=b.dataset.activeQuote;redraw();document.querySelector('#activeStockCode')?.scrollIntoView({behavior:'smooth',block:'center'});}
 else if(b.hasAttribute('data-active-stock-details')){state.stockCode=compact(document.getElementById('activeStockCode')?.value||state.stockCode);window.TradeCompassBridge?.navigate?.('stockSearch');window.TradeCompassMarket?.select?.(state.stockCode);}
 else if(b.hasAttribute('data-active-refresh')){state.published=null;state.feedStatus=null;state.loaded=false;state.archiveStatus[state.code]='';searchArchive(state.code,true);load();window.TradeCompassMarket?.load?.(true);}
 else if(b.hasAttribute('data-active-import-toggle')){state.showImport=!state.showImport;redraw();}
 else if(b.hasAttribute('data-active-remove')){if(!confirm('確定刪除此裝置上的 '+b.dataset.activeRemove+' 快照？'))return;state.local.snapshots[state.code]=(state.local.snapshots[state.code]||[]).filter(x=>x.date!==b.dataset.activeRemove);persist();redraw();}
 else if(b.hasAttribute('data-active-template'))download('主動ETF_完整持股CSV範本.csv','\ufeff股票代號,股票名稱,股數,權重\r\n2330,台積電,100000,10.5\r\n2454,聯發科,20000,5.2\r\n');
 else if(b.hasAttribute('data-active-export'))download('TradeCompass_主動ETF快照備份.json',JSON.stringify(state.local,null,2),'application/json');
});
document.addEventListener('change',e=>{if(e.target.id==='activePicker'&&e.target.value){state.code=e.target.value;state.asOfDate='';state.compareDate='';state.filter='all';state.search='';state.searchMessage='';searchArchive(state.code);redraw();return;}if(e.target.id==='activeRestoreFile'&&e.target.files?.[0]){const file=e.target.files[0];file.text().then(t=>{const j=JSON.parse(t);if(j.schema!==1||!j.snapshots||typeof j.snapshots!=='object')throw Error('不是本系統匯出的持股快照 JSON');if(!confirm('還原會取代目前瀏覽器的主動式 ETF 持股快照，確定？'))return;state.local=j;persist();redraw();alert('已還原主動式 ETF 快照');}).catch(err=>alert('還原失敗：'+err.message));e.target.value='';}if(e.target.id==='activeAsOf'){state.asOfDate=e.target.value;searchArchive(state.code);redraw();return;}if(e.target.id==='activeCompareMode'){state.compareMode=e.target.value;searchArchive(state.code);redraw();return;}if(e.target.id==='activeCompareDate'){state.compareDate=e.target.value;searchArchive(state.code);redraw();return;}if(e.target.id==='activeFilter'){state.filter=e.target.value;redraw();}if(e.target.id==='activeBulkFile'&&e.target.files?.[0]){const file=e.target.files[0];const source=document.getElementById('activeImportSource')?.value.trim();const complete=!!document.getElementById('activeComplete')?.checked;
 if(!source||!complete){alert('請先填寫官方實際投資組合來源，並勾選確認「完整持股」；不可用申購籃子替代。');e.target.value='';return;}
 file.text().then(t=>{const list=parseMultiDateCSV(t,source,true);if(!confirm(`即將匯入 ${list.length} 份 ETF／日期完整持股快照到此瀏覽器，確定？`))return;
 for(const s of list){const old=state.local.snapshots[s.code]||[];state.local.snapshots[s.code]=old.filter(x=>x.date!==s.date).concat(s).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,240);}
 persist();state.asOfDate='';redraw();alert(`已匯入 ${list.length} 份持股快照；請先備份快照 JSON。`);}).catch(err=>alert('多日期匯入失敗：'+err.message));e.target.value='';}
 if(e.target.id==='activeImportFile'&&e.target.files?.[0]){importFile(e.target.files[0]);e.target.value='';}});
document.addEventListener('input',e=>{if(e.target.id==='activeSearch'){state.search=e.target.value;/* no rerender here; avoid input focus jumps */ const table=document.querySelector('.tc-table-scroll');if(table){for(const row of table.querySelectorAll('tbody tr'))row.hidden=!row.textContent.toLowerCase().includes(state.search.toLowerCase());}}});
document.addEventListener('keydown',e=>{if(e.target.id==='activeStockCode'&&e.key==='Enter'){e.preventDefault();document.querySelector('[data-active-stock]')?.click();}if(e.target.id==='activeCode'&&e.key==='Enter'){e.preventDefault();document.querySelector('[data-active-select]')?.click();}});
window.TradeCompassActiveETF={html,parseCSV,parseMultiDateCSV,classify,portfolioRows,comparisonCSV,getSnapshots,selectSnapshots,catalog,searchArchive,availablePublicDates,select(code){state.code=code;state.asOfDate='';state.compareDate='';redraw();}};
})();
