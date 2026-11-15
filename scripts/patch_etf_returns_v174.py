#!/usr/bin/env python3
"""Minimal, guarded, idempotent patch for an existing Trade Compass ETF simulator.

Never replaces the whole user-maintained JS file. Refuses unknown structures.
"""
from pathlib import Path
import argparse

MARK_CHART = 'TC_ETF_INVESTMENT_CURVE_V174'
MARK_DIV = 'TC_ETF_DIVIDEND_FALLBACK_V174'

CHART_FN = r'''
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
'''

DIV_FN = r'''
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
'''

OLD_DIV = """else try{const r=await fetch('data/index-etf/dividends/'+code+'.json?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const raw=await r.json();dividendsCache[code]={events:parseDividends(raw,code),coverageStart:raw.coverageStart||null,firstEventDate:raw.firstEventDate||null,lastEventDate:raw.lastEventDate||null,asOf:raw.asOf||null,sourceUrl:raw.sourceUrl||null,verificationStatus:raw.verificationStatus||'not-fully-verified'};delete errors[code+'_div'];}
 catch(e){errors[code+'_div']='公開配息檔案讀取失敗（'+e.message+'）。可匯入經核對的配息 CSV；未驗證前不顯示含息收益。';}"""
NEW_DIV = """else try{const {raw,events,repoFallback}=await getVerifiedDividendArchive(code);dividendsCache[code]={events,coverageStart:raw.coverageStart||null,firstEventDate:raw.firstEventDate||null,lastEventDate:raw.lastEventDate||null,asOf:raw.asOf||null,sourceUrl:raw.sourceUrl||null,verificationStatus:raw.verificationStatus||'not-fully-verified',repoFallback};
 if(repoFallback)errors[code+'_div']='GitHub Pages 配息檔案未正常發布，暫時從公開 GitHub 原始碼讀取。資料仍應核對投信／證交所；請修復網站部署。';
 else delete errors[code+'_div'];}
 catch(e){errors[code+'_div']='公開配息檔案讀取失敗（'+e.message+'）。可匯入經核對的配息 CSV；未驗證前不顯示含息收益。';}"""


def patch(source: str) -> str:
    s=source
    if MARK_CHART not in s:
        a='function chart(series,fund){'
        if s.count(a)!=1: raise ValueError('Cannot safely locate existing chart(); source may have changed')
        s=s.replace(a,CHART_FN+'\n'+a,1)
        target="+chartPanel(series,'pnl','投資組合總損益','#d97706','新臺幣元',fund)"
        if s.count(target)!=1: raise ValueError('Cannot safely locate current PnL chart call')
        s=s.replace(target,target+'\n  +investmentCapitalChart(series)',1)
        target="effectiveDividends,chart,chartPanel}"
        if s.count(target)!=1: raise ValueError('Cannot safely locate chart test exports')
        s=s.replace(target,'effectiveDividends,chart,chartPanel,investmentCapitalChart}',1)
    if MARK_DIV not in s:
        anchor='async function load(code)'
        if s.count(anchor)!=1: raise ValueError('Cannot safely locate load()')
        if s.count(OLD_DIV)!=1: raise ValueError('Cannot safely locate dividend fetch block; refuse unsafe replacement')
        s=s.replace(anchor,DIV_FN+'\n'+anchor,1)
        s=s.replace(OLD_DIV,NEW_DIV,1)
        target='investmentCapitalChart}'
        if s.count(target)!=1: raise ValueError('Cannot safely locate investment curve export')
        s=s.replace(target,'investmentCapitalChart,getVerifiedDividendArchive}',1)
    if s.count(MARK_CHART)!=1 or s.count(MARK_DIV)!=1: raise ValueError('Patch markers missing or duplicated')
    return s


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--file',default='index_etf_returns.js')
    args=parser.parse_args()
    file=Path(args.file)
    if not file.exists(): raise SystemExit('Missing '+str(file)+'; run in repository root')
    before=file.read_text(encoding='utf-8')
    result=patch(before)
    if before!=result:
        file.write_text(result,encoding='utf-8')
        print('SUCCESS: inserted investment lines and verified dividend fetch fallback')
    else:print('ALREADY PATCHED: no changes')

if __name__=='__main__': main()
