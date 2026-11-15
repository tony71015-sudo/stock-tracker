'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
let fetchRequests=[];
const fakeDiv={etf:'0050',events:[{exDate:'2025-05-16',paymentDate:'2025-06-10',amount:1.2}]};
const sandbox={
  console,Date,Math,Number,String,JSON,Map,Set,Promise,
  localStorage:{getItem:()=>null,setItem:()=>{}},
  document:{addEventListener:()=>{}},
  fetch:async url=>{fetchRequests.push(String(url));if(String(url).includes('raw.githubusercontent.com'))return {ok:true,status:200,json:async()=>fakeDiv};return {ok:false,status:404,json:async()=>null};},
  window:{TradeCompassBridge:{isPage:()=>false,render:()=>{}}}
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('index_etf_returns.js','utf8'),sandbox,{filename:'index_etf_returns.js'});
const t=sandbox.window.TradeCompassETFReturns._test;
assert.equal(typeof t.investmentCapitalChart,'function');
assert.equal(typeof t.getVerifiedDividendArchive,'function');
const prices=[
 {date:'2025-06-17',close:200},{date:'2025-06-18',close:50},
 {date:'2025-06-19',close:55},{date:'2025-06-20',close:56}];
const invest=[{date:'2025-06-17',amount:1000},{date:'2025-06-19',amount:400}];
const res=t.compute(prices,invest,{fund:'0050',feePct:0,mode:'price'});
assert.equal(res.series[0].externalPaid,1000);
assert.equal(res.series[1].externalPaid,1000,'split is not new capital');
assert.equal(res.series[1].shares,20,'1:4 split must adjust holdings');
assert.equal(res.series[2].externalPaid,1385,'only filled buy transactions count, not unspent budget');
assert.equal(res.series[2].totalAssets,res.series[2].shares*55);
assert.equal(res.series[2].totalPnl,res.series[2].totalAssets-res.series[2].externalPaid);
const chart=t.investmentCapitalChart(res.series);
for(const expected of ['累積實際投入本金','投資組合總價值','累積總損益','2025-06-20','1,385'])assert(chart.includes(expected),expected);
assert(t.chart(res.series,'0050').includes('投資本金、資產價值與累積收益曲線'));
(async()=>{
 const found=await t.getVerifiedDividendArchive('0050');
 assert.equal(found.repoFallback,true);
 assert.equal(found.events.length,1);
 assert(fetchRequests.some(x=>x.includes('raw.githubusercontent.com')));
 console.log('PASS v1.7.4: filled capital, split adjustment, chart, dividend fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
