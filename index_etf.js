/* Trade Compass v1.5.4 -- Index ETF actual holdings x TWSE/TPEx institutions.
   Portfolio deltas and institutional trading are independent data sources. */
(function(){'use strict';
const KEY='trade-compass-index-etf-v154';
const FUNDS={'0050':'元大台灣50','006208':'富邦台50','009816':'凱基台灣TOP50'};
const ACTORS={total:['三大法人合計',3],foreign:['外資',0],trust:['投信',1],dealer:['自營商',2]};
const WINDOWS=[1,5,10,20,60];
const state={fund:'0050',actor:'total',period:1,query:'',date:'',base:'',manual:false,local:{snapshots:{}},index:{},remote:{},inst:null,instError:'',warning:'',message:'',loading:false,initialized:false};
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.snapshots)state.local=saved;}catch(e){/* local storage may be blocked */}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=0)=>v===null||v===undefined?'—':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:d,minimumFractionDigits:d});
const sign=(v,d=0)=>v===null||v===undefined?'—':(v>0?'+':'')+fmt(v,d);
const validDay=s=>/^\d{4}-\d\d-\d\d$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
const safeCode=s=>/^[0-9A-Z. -]{2,24}$/.test(String(s||''));
const redraw=()=>{if(window.TradeCompassBridge?.isPage?.('indexETF'))window.TradeCompassBridge.render();};
async function json(path){const r=await fetch(path+(path.includes('?')?'&':'?')+'v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
function validateSnapshot(s,etf,expectedDate){
 if(!s||s.etf!==etf||!validDay(s.date)||expectedDate&&s.date!==expectedDate||!Array.isArray(s.holdings))throw Error('ETF 或持股日期不符');
 if(s.holdings.length<40)throw Error('少於 40 檔，不能確認為完整成分股持股');
 const seen=new Set();let sum=0,weights=0;
 const holdings=s.holdings.map(h=>{const code=String(h.code||h.symbol||'').trim().toUpperCase();if(!safeCode(code)||seen.has(code))throw Error('成分股代號無效或重複');seen.add(code);
 const shares=h.shares==null||h.shares===''?null:Number(h.shares);
 const weight=h.weight==null||h.weight===''?null:Number(h.weight);
 if(shares!==null&&(!Number.isInteger(shares)||shares<0))throw Error('持股股數格式錯誤');
 if(weight!==null&&(!Number.isFinite(weight)||weight<0||weight>100))throw Error('權重格式錯誤');
 if(shares===null&&weight===null)throw Error('持股與權重至少要有一項');
 if(weight!==null){sum+=weight;weights++;}
 return{code,name:String(h.name||'').slice(0,90),shares,weight};});
 if(weights&&sum>110)throw Error('持股權重合計異常');
 if(s.type==='pcf_basket'||s.type==='creation_basket')throw Error('PCF 申購籃子不能當實際持股');
 return{etf,date:s.date,holdings,source:String(s.source||''),kind:String(s.kind||'manual'),verified:s.verified===true};
}
function localDates(fund){return Object.keys(state.local.snapshots[fund]||{}).sort().reverse();}
function remoteDates(fund){return state.index[fund]?.dates||[];}
function dates(){return [...new Set([...localDates(state.fund),...remoteDates(state.fund)])].sort().reverse();}
function get(fund,date){return state.local.snapshots[fund]?.[date]||state.remote[fund+':'+date]||null;}
async function loadFund(){
 state.loading=true;state.warning='';redraw();const fund=state.fund;
 try{const x=await json('data/index-etf/indexes/'+fund+'.json');if(x.etf===fund&&Array.isArray(x.dates))state.index[fund]={dates:x.dates.filter(validDay)};else throw Error('索引格式不符');}
 catch(e){state.index[fund]={dates:[]};state.warning='尚無公開的完整 ETF 持股歷史索引；可匯入已確認的官方實際投資組合 CSV。';}
 const ds=dates();if(!state.date||!ds.includes(state.date))state.date=ds[0]||'';
 if(!state.base||!ds.includes(state.base)||state.base>=state.date)state.base=ds.find(d=>d<state.date)||'';
 state.loading=false;redraw();
}
async function loadSelected(){
 state.loading=true;state.message='';redraw();const fund=state.fund;
 let targets=[state.date,state.base].filter(Boolean);if(!state.base&&state.date){targets=[state.date];}
 for(const day of targets){if(get(fund,day))continue;
  try{const payload=await json('data/index-etf/history/'+fund+'/'+day+'.json');const snap=validateSnapshot(payload,fund,day);
    if(snap.kind!=='actual_portfolio'||!snap.verified)throw Error('來源尚未標示經驗證的完整實際持股');
    state.remote[fund+':'+day]=snap;
  }catch(e){state.message+=`${day}：沒有通過驗證的官方完整持股資料（${e.message}）。 `;}
 }
 state.loading=false;redraw();
}
async function loadInstitutional(){
 try{const data=await json('data/institutional/latest.json');if(data.schema!==1||data.units!=='shares'||!data.marketData)throw Error('法人資料格式不符');state.inst=data;state.instError='';}
 catch(e){state.instError='法人資料無法讀取：'+e.message;}redraw();
}
function instMap(){const result=new Map();if(!state.inst)return result;
 for(const market of ['TWSE','TPEX'])for(const r of state.inst.marketData?.[market]?.entries||[]){if(Array.isArray(r)&&r.length>=12)result.set(String(r[0]),{market,row:r,date:state.inst.marketData[market].date});}
 return result;}
function institution(entry){if(!entry)return{value:null,date:''};const r=entry.row;
 const arr=state.period===1?[r[2],r[3],r[4],r[7]]:r[8+[5,10,20,60].indexOf(state.period)];
 const value=Array.isArray(arr)&&arr.length>=4?arr[ACTORS[state.actor][1]]:null;
 return{value:Number.isSafeInteger(value)?value:null,date:entry.date};}
function comparisons(){const now=get(state.fund,state.date),before=get(state.fund,state.base);if(!now||!before)return[];
 const a=new Map(before.holdings.map(h=>[h.code,h]));const b=new Map(now.holdings.map(h=>[h.code,h]));const im=instMap();
 return[...new Set([...a.keys(),...b.keys()])].map(code=>{
  const prev=a.get(code),cur=b.get(code);const sh1=prev?.shares??null,sh2=cur?.shares??null,wt1=prev?.weight??null,wt2=cur?.weight??null;
  const delta=sh1!==null&&sh2!==null?sh2-sh1:null;const wdelta=wt1!==null&&wt2!==null?wt2-wt1:null;
  const status=!prev?'新增':!cur?'移出':delta>0?'股數增加':delta<0?'股數減少':delta===0?'不變':wdelta>0?'權重增加':wdelta<0?'權重減少':'無法判定';
  return{code,name:cur?.name||prev?.name||'',sh1,sh2,delta,wt1,wt2,wdelta,status,actor:institution(im.get(code))};
 }).filter(x=>!state.query||x.code.includes(state.query)||x.name.includes(state.query)).sort((a,b)=>Math.abs(b.delta??b.wdelta??0)-Math.abs(a.delta??a.wdelta??0));}
function csvParse(text){const out=[];let row=[],cell='',quote=false;const input=text.replace(/^\uFEFF/,'');for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quote&&input[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(cell);cell='';}else if((c==='\r'||c==='\n')&&!quote){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))out.push(row);row=[];cell='';}else cell+=c;}row.push(cell);if(row.some(x=>x.trim()))out.push(row);return out;}
function importCsv(text){const rows=csvParse(text);if(rows.length<2)throw Error('CSV 必須有標題及持股明細');
 const titles=rows[0].map(x=>x.trim().toLowerCase());const idx=(...keys)=>titles.findIndex(t=>keys.includes(t));
 const indices={fund:idx('etf','基金代號','etf代號'),date:idx('date','日期','資料日期'),code:idx('code','股票代號','成分股代號'),name:idx('name','股票名稱','成分股名稱'),shares:idx('shares','股數','持股股數'),weight:idx('weight','權重','權重(%)','比重(%)')};
 if(indices.date<0||indices.code<0||(indices.shares<0&&indices.weight<0))throw Error('CSV 缺少日期、股票代號及股數／權重');
 const groups=new Map();for(const r of rows.slice(1)){
  const fund=indices.fund>=0?r[indices.fund]?.trim():state.fund,day=r[indices.date]?.trim();
  if(!FUNDS[fund]||!validDay(day))throw Error('ETF 代號或日期不正確');
  const key=fund+':'+day;if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({code:r[indices.code]?.trim(),name:indices.name>=0?r[indices.name]?.trim():'',shares:indices.shares>=0?r[indices.shares]?.trim():null,weight:indices.weight>=0?r[indices.weight]?.trim():null});
 }
 let count=0;for(const [key,holdings] of groups){const[etf,date]=key.split(':');const snap=validateSnapshot({etf,date,holdings,kind:'manual',verified:false,source:'使用者匯入的實際投資組合（未經官方自動核對）'},etf,date);
 (state.local.snapshots[etf]??={})[date]=snap;count++;}
 localStorage.setItem(KEY,JSON.stringify(state.local));state.message=`已將 ${count} 個日期的持股明細存入本機（未經官方自動核對）。`;loadFund();}
function render(){if(!state.initialized){state.initialized=true;loadInstitutional();loadFund();}
 const ds=dates(),cur=get(state.fund,state.date),base=get(state.fund,state.base),rows=comparisons();
 const opts=Object.keys(FUNDS).map(code=>`<option value="${code}" ${state.fund===code?'selected':''}>${code} ${esc(FUNDS[code])}</option>`).join('');
 const days=ds.map(d=>`<option value="${d}" ${state.date===d?'selected':''}>${d}</option>`).join('');
 const bases=ds.filter(d=>d<state.date).map(d=>`<option value="${d}" ${state.base===d?'selected':''}>${d}</option>`).join('');
 let html=`<div class="head"><div><div class="eyebrow">INDEX ETF × INSTITUTIONAL FLOWS</div><h1>指數型 ETF 持股變化 × 三大法人</h1><p class="subtitle">比較完整實際持股快照，並顯示成分股外資、投信、自營商買賣超。兩組資料各自獨立，不代表 ETF 自己的買賣交易。</p></div></div>
 <section class="panel" style="padding:20px 23px"><div class="filter-row" style="gap:11px"><label>指數型 ETF</label><select id="indexFund" class="field">${opts}</select><label>查詢日</label><select id="indexDate" class="field"><option value="">未有資料</option>${days}</select><label>比較日</label><select id="indexBase" class="field"><option value="">未有前一筆</option>${bases}</select><button class="btn primary" id="indexLoad" ${state.loading?'disabled':''}>${state.loading?'讀取中…':'查詢並比較'}</button></div>
 <div class="filter-row" style="margin-top:15px"><label>法人種類</label><select id="indexActor" class="field">${Object.entries(ACTORS).map(([k,v])=>`<option value="${k}" ${k===state.actor?'selected':''}>${v[0]}</option>`).join('')}</select><label>買賣超區間</label><select id="indexPeriod" class="field">${WINDOWS.map(n=>`<option value="${n}" ${state.period===n?'selected':''}>${n} 日</option>`).join('')}</select><input id="indexQuery" class="field" value="${esc(state.query)}" placeholder="搜尋成分股名稱／代號"></div>
 <div class="fine" style="margin-top:12px">完整持股：${cur?'查詢日 '+cur.date:'查詢日尚無資料'} ／ ${base?'比較日 '+base.date:'比較日尚無資料'}。${cur?'來源：'+esc(cur.source||'未註明')+'。':''}</div>
 ${state.warning?`<p class="alert">${esc(state.warning)}</p>`:''}${state.message?`<p class="alert">${esc(state.message)}</p>`:''}
 <div class="note-box mt16">法人買賣超是<strong>個股在市場上的交易</strong>，不是該 ETF 的申購量或經理人買賣量。法人資料依已發布的最新統計區間顯示，可能與兩個持股日期不同；無資料一律顯示「—」。</div></section>`;
 if(state.instError)html+=`<div class="alert mt16">${esc(state.instError)}</div>`;
 if(!cur||!base){html+=`<section class="panel" style="padding:24px;margin-top:16px"><h2 class="panel-title">暫時無法比較</h2><p class="subtitle">本 ETF 需要至少兩個不同日期、每份不少於 40 檔成分股的完整持股資料。官方資料未接通時可於下方匯入完整持股 CSV（保存在本機）。</p></section>`;}
 else{const c={新增:0,移出:0,股數增加:0,股數減少:0};rows.forEach(r=>{if(c[r.status]!==undefined)c[r.status]++;});
 html+=`<div class="grid stats">${[['新增股票',c.新增],['移出股票',c.移出],['股數增加',c.股數增加],['股數減少',c.股數減少]].map(([l,v])=>`<section class="panel metric"><div class="metric-label">${l}</div><div class="metric-value">${fmt(v)}</div></section>`).join('')}</div>`;
 const dateLabels=['TWSE','TPEX'].map(m=>state.inst?.marketData?.[m]?.date).filter(Boolean);
 html+=`<section class="panel"><div class="panel-head"><div><h2 class="panel-title">持股變化與 ${esc(ACTORS[state.actor][0])} 買賣超</h2><p class="panel-sub">${esc(base.date)} → ${esc(cur.date)}；法人單位：股（換算張數÷1000）；法人資料日：${esc([...new Set(dateLabels)].join(' / ')||'尚無資料')}</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>成分股</th><th>異動</th><th class="num">比較日股數</th><th class="num">查詢日股數</th><th class="num">股數變化</th><th class="num">權重變化</th><th class="num">${esc(ACTORS[state.actor][0])} ${state.period} 日買賣超（張）</th></tr></thead><tbody>`;
 for(const r of rows){const deltaClass=r.delta>0?'positive':r.delta<0?'negative':'';const a=r.actor.value;
 html+=`<tr><td><strong>${esc(r.name||r.code)}</strong><div class="stock-code">${esc(r.code)}</div></td><td>${esc(r.status)}</td><td class="num">${fmt(r.sh1)}</td><td class="num">${fmt(r.sh2)}</td><td class="num ${deltaClass}">${sign(r.delta)}</td><td class="num">${r.wdelta===null?'—':sign(r.wdelta,2)+' pp'}</td><td class="num ${a>0?'positive':a<0?'negative':''}">${a===null?'—':sign(a/1000,1)}</td></tr>`;}
 html+=`</tbody></table></div></section>`;}
 html+=`<section class="panel" style="padding:23px;margin-top:18px"><h2 class="panel-title">匯入完整實際持股 CSV（本機保存）</h2><p class="subtitle">表頭須包含 etf,date,code,name,shares,weight；每檔 ETF 每天至少 40 檔成分股。這是手動匯入功能，不是自動官方驗證；PCF 申購籃子與只有前十大持股的資料不可當作完整實際持股。</p><input id="indexImport" type="file" accept=".csv,text/csv" class="field"/><div class="filter-row" style="margin-top:12px"><button id="indexExport" class="btn">備份本機指數 ETF 快照</button><button id="indexClear" class="btn danger">清除本機指數 ETF 快照</button></div></section>`;
 return html + (window.TradeCompassETFReturns?.html(state.fund)||'');}
function download(text,filename){const blob=new Blob([text],{type:'application/json;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),300);}
document.addEventListener('change',async e=>{
 const id=e.target?.id;if(!id||!id.startsWith('index'))return;
 if(id==='indexFund'){state.fund=e.target.value;state.date='';state.base='';state.warning='';await loadFund();}
 if(id==='indexDate'){state.date=e.target.value;const ds=dates();state.base=ds.find(d=>d<state.date)||'';redraw();}
 if(id==='indexBase'){state.base=e.target.value;redraw();}
 if(id==='indexActor'){state.actor=e.target.value;redraw();}
 if(id==='indexPeriod'){state.period=Number(e.target.value);redraw();}
 if(id==='indexQuery'){state.query=e.target.value.trim();redraw();}
 if(id==='indexImport'){const f=e.target.files?.[0];if(!f)return;try{importCsv(await f.text());}catch(err){state.message='匯入失敗：'+err.message;redraw();}}
});
document.addEventListener('input',e=>{if(e.target?.id==='indexQuery'){state.query=e.target.value.trim();redraw();}});
document.addEventListener('click',e=>{const id=e.target?.id;if(id==='indexLoad')loadSelected();
 if(id==='indexExport')download(JSON.stringify(state.local,null,2),'trade-compass-index-etf-backup.json');
 if(id==='indexClear'&&confirm('確定清除本機指數型 ETF 快照？此操作不影響個人交易紀錄和其他主動式 ETF 資料。')){state.local={snapshots:{}};localStorage.removeItem(KEY);state.message='本機快照已清除。';loadFund();}});
window.TradeCompassIndexETF={html:render,_test:{validateSnapshot,importCsv,institution,instMap,comparisons,state}};
})();
