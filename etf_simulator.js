/* Trade Compass v1.4 ETF investment simulator. Uses hypothetical rates, not forecasts. */
(function(){'use strict';
const ETF_LIST=[['0050','元大台灣50'],['009816','凱基台灣TOP50'],['006208','富邦台50']];
const RATES=[.03,.07,.10];
const defaults=()=>({years:40,reinvest:true,yieldPct:2,etfs:Object.fromEntries(ETF_LIST.map(([code])=>[code,{enabled:code==='0050',initial:0,price:0,monthly:0}])),extras:[]});
const state={config:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const money=n=>Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:0});
const dec=(n,d=2)=>Number(n||0).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
const bounded=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
function cfg(){if(!state.config){let saved=window.TradeCompassBridge?.getETFConfig?.();const d=defaults();state.config={...d,...saved,etfs:{...d.etfs,...(saved?.etfs||{})},extras:Array.isArray(saved?.extras)?saved.extras:[]};}return state.config;}
function persist(){window.TradeCompassBridge?.saveETFConfig?.(state.config);}
function projectOne(p,config,rate){
 const years=bounded(config.years,0,40),totalMonths=years*12;
 let invested=Number(p.initial)||0,shares=0,cash=0;
 const price0=Number(p.price)||0;let price=price0;
 const rows=[{year:0,invested,shares:price0>0?invested/price0:0,stockValue:invested,cash:0,value:invested,profit:0,price}];
 if(!(price0>0))return rows.map(x=>({...x,value:0,stockValue:0,shares:0,invested:0}));
 shares=invested/price0;
 const y=bounded(config.yieldPct,0,30)/100;
 const monthlyPriceGrowth=Math.pow(1+rate,1/12)/(1+y/12)-1;
 const extras=config.extras.filter(e=>e.etf===p.code && Number(e.year)>=1 && Number(e.year)<=40);
 for(let month=1;month<=totalMonths;month++){
   price*=(1+monthlyPriceGrowth);
   const dividend=shares*price*y/12;
   if(config.reinvest)shares+=dividend/price;else cash+=dividend;
   const monthly=Number(p.monthly)||0;
   shares+=monthly/price;invested+=monthly;
   if(month%12===0){
      const year=month/12;
      for(const e of extras.filter(e=>Number(e.year)===year)){
         const x=Number(e.amount)||0;shares+=x/price;invested+=x;
      }
      const stockValue=shares*price;
      rows.push({year,invested,shares,stockValue,cash,value:stockValue+cash,profit:stockValue+cash-invested,price});
   }
 }
 return rows;
}
function calculate(config){
 const selected=ETF_LIST.filter(([code])=>config.etfs[code]?.enabled && Number(config.etfs[code].price)>0).map(([code,name])=>({code,name,...config.etfs[code]}));
 const all={};for(const rate of RATES){
  const every=selected.map(p=>({code:p.code,name:p.name,rows:projectOne(p,config,rate)}));
  const summary=Array.from({length:bounded(config.years,0,40)+1},(_,year)=>{
    const parts=every.map(e=>e.rows[year]);
    const invested=parts.reduce((s,e)=>s+e.invested,0),value=parts.reduce((s,e)=>s+e.value,0);
    return {year,invested,value,profit:value-invested};
  });
  all[String(Math.round(rate*100))]={summary,every};
 }
 return {selected,all};
}
function svgLine(result){
 const years=cfg().years,points=[result.all['3'].summary,result.all['7'].summary,result.all['10'].summary];
 const max=Math.max(1,...points.flat().map(x=>x.value)),w=920,h=290,p={l:77,r:25,t:15,b:38};
 const x=year=>p.l+(w-p.l-p.r)*year/Math.max(1,years),y=n=>h-p.b-(h-p.t-p.b)*n/max;
 const lines=points.map((rows,i)=>`<path d="${rows.map((v,j)=>(j?'L':'M')+x(v.year).toFixed(2)+','+y(v.value).toFixed(2)).join(' ')}" fill="none" stroke="${['#2c9f8c','#3778e7','#dc9673'][i]}" stroke-width="3.5" stroke-linejoin="round"/>`).join('');
 let grid='';for(let i=0;i<=4;i++){const v=max*i/4,yy=y(v);grid+=`<line x1="${p.l}" y1="${yy}" x2="${w-p.r}" y2="${yy}" stroke="#e7eef4"/><text x="${p.l-10}" y="${yy+4}" text-anchor="end" font-size="12" fill="#77889c">${money(v/10000)}萬</text>`;}
 for(let yr=0;yr<=years;yr+=Math.max(1,Math.ceil(years/8))){grid+=`<text x="${x(yr)}" y="${h-11}" text-anchor="middle" font-size="12" fill="#788b9d">${yr}年</text>`;}
 return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="三種年化報酬率假設下的資產成長曲線" style="display:block;width:100%;height:auto;min-height:170px">${grid}${lines}</svg>`;
}
function html(){
 const c=cfg(),r=calculate(c);let s=`<div class="head"><div><div class="eyebrow">ETF INVESTMENT SIMULATOR</div><h1>ETF 長期投資獲利試算</h1><p class="subtitle">0050、009816、006208｜第 0～40 年｜初始投入、每月定額、指定年度加碼、配息再投入</p></div><div class="actions"><button class="btn" data-etf-example>載入示例</button><button class="btn" data-etf-export>下載試算 CSV</button></div></div>
 <div class="notice-banner"><b>模型說明：</b>3%、7%、10% 是「配息全部再投入時的假設年化總報酬」，並非三檔 ETF 的實際或預測績效。配息率預設 2% 僅用於拆分「價格成長／配息」；不再投入時配息累積為不計利息的現金。未計交易費、稅、通膨、折溢價及價格波動順序。</div>
 <section class="panel tc-pad"><div class="tc-section-head"><h2 class="panel-title">投資參數</h2><div class="tc-flex"><label>投資年數 <input class="field tc-number" id="etfYears" type="number" min="0" max="40" value="${c.years}"></label><label>假設年配息率 % <input class="field tc-number" id="etfYield" type="number" min="0" max="30" step=".5" value="${c.yieldPct}"></label></div></div>
 <div class="tc-flex" style="margin:10px 0 16px"><label class="tc-check"><input type="checkbox" id="etfReinvest" ${c.reinvest?'checked':''}> 配息自動再投入（複利）</label><span class="fine">每月定期定額在月底投入；第 N 年加碼在第 N 週年末加入資產。</span></div>
 <div class="table-wrap"><table class="data-table"><thead><tr><th>選擇</th><th>ETF</th><th class="num">初始投入（元）</th><th class="num">初始購買價（元）</th><th class="num">每月定額（元）</th></tr></thead><tbody>`;
 for(const [code,name] of ETF_LIST){const p=c.etfs[code];s+=`<tr><td><input type="checkbox" data-etf-on="${code}" ${p.enabled?'checked':''} aria-label="納入 ${code} 計算"></td><td><b>${code}</b><div class="stock-code">${name}</div></td>${[['initial','1'],['price','.01'],['monthly','1']].map(([k,step])=>`<td class="num"><input class="field tc-row-input" type="number" min="0" step="${step}" data-etf-field="${code}:${k}" value="${p[k]||0}"></td>`).join('')}</tr>`;}
 s+=`</tbody></table></div></section>
 <section class="panel tc-pad"><div class="tc-section-head"><div><h2 class="panel-title">指定年度額外加碼</h2><p class="panel-sub">可新增多筆，例如第 3 年額外投入 100,000 元至 0050。</p></div><button class="btn sm" data-etf-add>＋ 新增加碼</button></div><div class="tc-extra-list">`;
 if(!c.extras.length)s+='<p class="fine">尚未設定額外加碼。</p>';
 for(const [i,x] of c.extras.entries())s+=`<div class="tc-extra"><label>標的 <select class="field" data-etf-extra="${i}:etf">${ETF_LIST.map(([code])=>`<option value="${code}" ${x.etf===code?'selected':''}>${code}</option>`).join('')}</select></label><label>第幾年 <input class="field tc-number" type="number" min="1" max="40" data-etf-extra="${i}:year" value="${x.year}"></label><label>金額 <input class="field" type="number" min="0" step="1" data-etf-extra="${i}:amount" value="${x.amount}"></label><button class="btn sm danger" data-etf-remove="${i}">刪除</button></div>`;
 s+=`</div></section>`;
 if(!r.selected.length){s+=`<section class="panel tc-pad"><div class="no-data"><strong>先勾選 ETF，輸入初始購買價</strong><p>每檔的股價需大於 0 才會納入計算；可以先按「載入示例」了解圖表與年度明細。</p></div></section>`;return s;}
 const fin=Object.fromEntries(['3','7','10'].map(k=>[k,r.all[k].summary.at(-1)]));
 s+=`<div class="grid stats tc-results">${['3','7','10'].map(k=>`<div class="panel metric ${k==='7'?'blue':'accent'}"><div class="metric-label">年化假設 ${k}%｜第 ${c.years} 年</div><div class="metric-value">NT$ ${money(fin[k].value)}</div><div class="metric-note">累計投入 ${money(fin[k].invested)} 元<br>獲利 <b class="${fin[k].profit>=0?'positive':'negative'}">${fin[k].profit>=0?'+':''}${money(fin[k].profit)} 元</b></div></div>`).join('')}</div>`;
 s+=`<section class="panel tc-pad"><h2 class="panel-title">資產成長走勢｜三種年化報酬情境</h2><div class="tc-legend"><span><i style="background:#2c9f8c"></i>3%</span><span><i style="background:#3778e7"></i>7%</span><span><i style="background:#dc9673"></i>10%</span></div>${svgLine(r)}</section>`;
 s+=`<section class="panel tc-pad"><h2 class="panel-title">年度投資明細（第 0～${c.years} 年）</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>年度</th><th class="num">累計投入本金</th>${['3','7','10'].map(k=>`<th class="num">${k}% 資產</th><th class="num">${k}% 獲利</th>`).join('')}</tr></thead><tbody>`;
 for(let i=0;i<=c.years;i++){s+=`<tr><td>${i}</td><td class="num">${money(r.all['7'].summary[i].invested)}</td>${['3','7','10'].map(k=>`<td class="num">${money(r.all[k].summary[i].value)}</td><td class="num ${r.all[k].summary[i].profit>=0?'positive':'negative'}">${money(r.all[k].summary[i].profit)}</td>`).join('')}</tr>`;}
 s+='</tbody></table></div></section>';
 s+=`<section class="panel tc-pad"><h2 class="panel-title">分 ETF 試算｜年化 7%（第 ${c.years} 年）</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>標的</th><th class="num">持有股數（模型）</th><th class="num">期末每股價格（模型）</th><th class="num">累計投入</th><th class="num">資產總值</th><th class="num">獲利</th></tr></thead><tbody>`;
 for(const t of r.all['7'].every){const x=t.rows.at(-1);s+=`<tr><td>${t.code} ${t.name}</td><td class="num">${dec(x.shares,3)}</td><td class="num">${dec(x.price)}</td><td class="num">${money(x.invested)}</td><td class="num">${money(x.value)}</td><td class="num ${x.profit>=0?'positive':'negative'}">${money(x.profit)}</td></tr>`;}
 s+='</tbody></table></div><p class="fine">未再投入配息的情境中，「資產總值」包含領取後尚未再投資的累積現金股利；本模型不計股票拆併股或實際配息日期。</p></section>';
 return s;
}
function refresh(){if(window.TradeCompassBridge?.isPage?.('etfSim'))window.TradeCompassBridge.render();}
function setField(el){const c=cfg();if(el.id==='etfYears')c.years=bounded(el.value,0,40);
 else if(el.id==='etfYield')c.yieldPct=bounded(el.value,0,30);
 else if(el.id==='etfReinvest')c.reinvest=el.checked;
 else if(el.dataset.etfOn){c.etfs[el.dataset.etfOn].enabled=el.checked;}
 else if(el.dataset.etfField){const [code,prop]=el.dataset.etfField.split(':');c.etfs[code][prop]=bounded(el.value,0,1e12);}
 else if(el.dataset.etfExtra){const [idx,prop]=el.dataset.etfExtra.split(':');if(!c.extras[idx])return;if(prop==='etf')c.extras[idx][prop]=el.value;else c.extras[idx][prop]=bounded(el.value,prop==='year'?1:0,prop==='year'?40:1e12);}
 else return;
 persist();refresh();}
function exportCSV(){const r=calculate(cfg());if(!r.selected.length){alert('請先輸入至少一檔有效的 ETF 購入價格');return;}
 const header=['年度','累計投入本金','3%資產','3%獲利','7%資產','7%獲利','10%資產','10%獲利'];const rows=[header];
 for(let i=0;i<=cfg().years;i++)rows.push([i,r.all['7'].summary[i].invested,...['3','7','10'].flatMap(k=>[r.all[k].summary[i].value,r.all[k].summary[i].profit])]);
 const csv='\ufeff'+rows.map(row=>row.join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='TradeCompass_ETF_40年試算.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('change',e=>{if(e.target.matches('[data-etf-on],[data-etf-field],[data-etf-extra],#etfYears,#etfYield,#etfReinvest'))setField(e.target);});
document.addEventListener('click',e=>{const btn=e.target.closest('[data-etf-add],[data-etf-remove],[data-etf-example],[data-etf-export]');if(!btn)return;
 const c=cfg();if(btn.hasAttribute('data-etf-add')){c.extras.push({etf:'0050',year:3,amount:100000});persist();refresh();}
 else if(btn.dataset.etfRemove!==undefined){c.extras.splice(Number(btn.dataset.etfRemove),1);persist();refresh();}
 else if(btn.hasAttribute('data-etf-example')){if(!confirm('載入示例將覆蓋 ETF 試算輸入值（不影響股票交易記錄）。確定嗎？'))return;state.config=defaults();state.config.etfs['0050']={enabled:true,initial:100000,price:100,monthly:5000};state.config.extras=[{etf:'0050',year:5,amount:100000}];persist();refresh();}
 else if(btn.hasAttribute('data-etf-export'))exportCSV();
});
window.TradeCompassETF={html,calculate,projectOne,defaults};
})();
