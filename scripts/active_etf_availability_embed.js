/* Trade Compass additive diagnostics: public index/status files only; no portfolio changes. */
(() => {
  'use strict';
  const ROOT = 'data/active-etf/';
  const MAX_PARALLEL = 5;
  const refreshMs = 5 * 60 * 1000;
  let lastFetched = 0;
  let entries = [];
  let busy = false;
  let filter = 'all';
  let error = '';
  const stateLabels = {
    ready: '可比較', single: '只有單日資料', missing: '尚無歷史持股檔',
    rejected: '來源未通過驗證', failed: '讀取失敗'
  };
  const catalog = () => {
    const select = document.querySelector('#activePicker');
    if (!select) return [];
    return [...select.options].filter(o => /^\d{4,6}[A-Z]?$/.test(o.value))
      .map(o => ({code:o.value, name:(o.textContent||'').replace(/^\S+\s*[｜|]\s*/, '')}));
  };
  const get = async url => {
    const response = await fetch(url, {cache:'no-store'});
    if (response.status === 404) return null;
    if (!response.ok) throw Error('HTTP '+response.status);
    return response.json();
  };
  const reasonFrom = row => String(row?.reason || row?.detail || row?.message || '').slice(0, 250);
  const interpreted = (code, name, index, feed, readError) => {
    const dates = Array.isArray(index?.dates) ? [...new Set(index.dates.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().reverse() : [];
    const n = dates.length;
    const backend = feed && typeof feed === 'object' ? feed : {};
    const backendStatus = String(backend.status||'');
    const text = reasonFrom(backend);
    const rejected = backendStatus === 'not_verified' || /PCF|creation basket|完整性|未通過驗證|不完整/i.test(text);
    const status = n>=2 ? 'ready' : n===1 ? 'single' : rejected ? 'rejected' : readError ? 'failed' : 'missing';
    let reason = n>=2 ? '已有兩日以上日期索引；實際查詢仍須驗證兩日持股內容' : n===1 ? '僅有一日可查，不能判定買入或賣出' : text || (readError ? '索引讀取錯誤：'+readError : '未發布完整持股歷史日期索引');
    if (rejected && n===0 && text) reason = text;
    return {code,name,status,days:n,latest:dates[0]||backend.date||'',reason,checked:backend.checkedAt||''};
  };
  async function collect(force=false) {
    if(busy || (!force && Date.now()-lastFetched < refreshMs && entries.length)) return;
    const items = catalog();
    if (!items.length) return;
    busy=true; error='';
    try {
      const suffix='?t='+Date.now();
      let status={};
      try {status=await get(ROOT+'status.json'+suffix)||{};}
      catch(e){error='狀態檔讀取失敗：'+e.message;}
      const rows=Array(items.length);
      let cursor=0;
      await Promise.all(Array.from({length:Math.min(MAX_PARALLEL,items.length)},async()=>{
        while (cursor<items.length) {
          const i=cursor++;
          const {code,name}=items[i];
          let index=null, failure='';
          try {index=await get(ROOT+'indexes/'+encodeURIComponent(code)+'.json'+suffix);}
          catch(e){failure=e.message||String(e);}
          rows[i]=interpreted(code,name,index,status.etfs?.[code],failure);
        }
      }));
      entries=rows;lastFetched=Date.now();
    }catch(e){error='無法取得標註資料：'+String(e.message||e);}
    finally {busy=false;render();}
  }
  const create = (tag,text,cls) => {const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  function render() {
    const anchor=document.querySelector('#activeFeeds');
    const existing=document.querySelector('#tcActiveAvailability');
    if(!anchor){if(existing)existing.remove();return;}
    const panel=existing||create('section',undefined,'panel tc-pad');
    panel.id='tcActiveAvailability';
    panel.replaceChildren();
    const head=create('div',undefined,'tc-section-head');
    const title=create('div'); title.append(create('h2','主動式 ETF 持股檔案與比較狀態','panel-title'),create('p','自動檢查後台每日持股日期索引；無檔案不代表基金沒有持股','panel-sub'));
    const button=create('button','↻ 重新檢查','btn sm');button.type='button';button.disabled=busy;button.addEventListener('click',()=>{button.disabled=true;collect(true);});
    head.append(title,button);panel.append(head);
    const summary={ready:0,single:0,missing:0,rejected:0,failed:0};entries.forEach(x=>summary[x.status]++);
    panel.append(create('p',entries.length ? `可比較 ${summary.ready} 檔｜單日 ${summary.single} 檔｜無歷史檔 ${summary.missing} 檔｜來源未驗證 ${summary.rejected} 檔｜讀取失敗 ${summary.failed} 檔` : '正在確認公開歷史檔案…','tc-note'));
    if(error)panel.append(create('p',error,'tc-note'));
    const toolbar=create('div',undefined,'tc-flex');
    const pick=create('select',undefined,'field');pick.setAttribute('aria-label','篩選歷史檔狀態');
    [['all','全部 ETF'],['missing','尚無歷史檔'],['rejected','來源未通過驗證'],['single','只有單日'],['ready','可比較'],['failed','讀取失敗']].forEach(([v,t])=>{const opt=create('option',t);opt.value=v;opt.selected=v===filter;pick.append(opt);});
    pick.addEventListener('change',()=>{filter=pick.value;render();});toolbar.append(pick);panel.append(toolbar);
    const wrap=create('div',undefined,'table-wrap');
    const table=create('table',undefined,'data-table');
    const header=create('thead'),headerRow=create('tr');
    ['ETF','資料狀態','日期數','最近日期','原因／限制'].forEach(t=>headerRow.append(create('th',t)));
    header.append(headerRow);table.append(header);
    const tbody=create('tbody');
    const visible=entries.filter(x=>filter==='all'||x.status===filter);
    for(const item of visible){const tr=create('tr');
      [item.code+' '+item.name,stateLabels[item.status],String(item.days),item.latest||'—',item.reason].forEach((t,i)=>{
        const cell=create('td',t);
        if (i===1){cell.style.fontWeight='600';cell.style.color=item.status==='ready'?'#11846c':item.status==='failed'?'#c34848':'inherit';}
        tr.append(cell);
      });tbody.append(tr);
    }
    if(!visible.length){const tr=create('tr'),td=create('td','沒有符合條件的 ETF');td.colSpan=5;tr.append(td);tbody.append(tr);}
    table.append(tbody);wrap.append(table);panel.append(wrap);
    panel.append(create('p','資料來源：GitHub Pages 上的 data/active-etf/indexes/*.json 與 status.json。索引有兩日僅代表有可查日期；不等於已核對全部持股，更不能推定經理人實際買賣。PCF 申購贖回籃子不可冒充基金實際持股。請以投信官方公告交叉確認。','tc-note'));
    if(!existing)anchor.insertAdjacentElement('afterend',panel);
  }
  let scheduled=false;
  const sync=()=>{
    scheduled=false;
    if(!document.querySelector('#activeFeeds'))return;
    if(!document.querySelector('#tcActiveAvailability'))render();
    if(!busy && (Date.now()-lastFetched>refreshMs))collect();
  };
  const observer=new MutationObserver(()=>{
    if(!scheduled){scheduled=true;setTimeout(sync,100);}
  });
  const start=()=>{observer.observe(document.body,{childList:true,subtree:true});sync();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
