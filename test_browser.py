"""End-to-end smoke test. All market data here is MOCKED and never shipped."""
import datetime as dt
import functools
import http.server
import importlib.util
import json
from pathlib import Path
import threading
import unittest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('update_institutions',ROOT/'scripts/update_institutions.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)


def fixtures():
    dates=[];today=dt.date(2026,11,12)
    for i in range(160):
        day=today-dt.timedelta(days=i)
        if day.weekday()<5: dates.append(day)
        if len(dates)==60:break
    days={}
    for d in dates:
        date=d.isoformat()
        days[date]={'date':date,'markets':{
         'TWSE':[['0050','元大台灣50',3000,-1000,1000,400,600,3000],['2330','台積電',2000,100,400,100,300,2500]],
         'TPEX':[['5483','中美晶',-1000,200,300,100,200,-500]]}}
    snap,history=u.generate(days,'2026-11-13T05:00:00+00:00')
    return snap,history

class BrowserSmoke(unittest.TestCase):
    def test_dashboard_and_institutions(self):
        fixture,histories=fixtures()
        # Sandboxed environment blocks local HTTP, so embed JS and stub fetch in
        # about:blank; this validates browser UI without touching any official URL.
        html=(ROOT/'index.html').read_text(encoding='utf-8')
        css=(ROOT/'institutional.css').read_text(encoding='utf-8')
        js=(ROOT/'institutional.js').read_text(encoding='utf-8')
        html=html.replace('<link rel="stylesheet" href="institutional.css"/>', '<style>'+css+'</style>')
        html=html.replace('<script src="institutional.js" defer></script>', '<script>'+js+'</script>')
        old_data={'version':2,'settings':{'stop':5,'activation':10,'trail':5},
           'transactions':[
             {'id':'b1','date':'2026-11-01','symbol':'0050','name':'元大台灣50','side':'buy','shares':100,'price':100,'fee':1,'tax':0},
             {'id':'b2','date':'2026-11-02','symbol':'0050','name':'元大台灣50','side':'buy','shares':100,'price':110,'fee':1,'tax':0},
             {'id':'b3','date':'2026-11-01','symbol':'2330','name':'台積電','side':'buy','shares':10,'price':200,'fee':0,'tax':0}],
           'quotes':[{'id':'q1','date':'2026-11-03','symbol':'0050','high':118,'low':107,'close':115},
             {'id':'q2','date':'2026-11-03','symbol':'2330','high':225,'low':215,'close':220}],
           'manualPrices':[], 'cathay':{'discount':0.28}}
        with sync_playwright() as p:
            b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            ctx=b.new_context(viewport={'width':1365,'height':920},accept_downloads=True)
            page=ctx.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.set_content(html,wait_until='load')
            page.evaluate('''(data)=>{
              const st=window.__financeDebug.getState();Object.assign(st,data.old);
              window.fetch=async (url)=>({ok:true,json:async()=>{
                if(url.includes('latest.json'))return data.latest;
                if(url.includes('history-twse.json'))return data.twse;
                if(url.includes('history-tpex.json'))return data.tpex;
                throw Error('Unexpected URL: '+url);
              }});
            }''',{"old":old_data,"latest":fixture,"twse":histories["TWSE"],"tpex":histories["TPEX"]})
            page.evaluate('window.__financeDebug.setDate("2026-11-13")')
            self.assertIn('+2,198',page.locator('.metric-value').nth(2).inner_text())
            self.assertEqual(page.locator('[data-inst-stock]').count(),2)
            page.locator('[data-page="institutions"]').click()
            page.wait_for_selector('text=買超前 30 名')
            self.assertIn('2026-11-12',page.locator('main').inner_text())
            self.assertIn('60',page.locator('main').inner_text())
            self.assertIn('0050',page.locator('main').inner_text())
            page.screenshot(path='/mnt/data/Trade_Compass_v1.3_桌機預覽.png',full_page=False)
            page.locator('#instMarket').select_option('TPEX')
            self.assertIn('5483',page.locator('main').inner_text())
            self.assertNotIn('台積電',page.locator('main').inner_text())
            page.locator('#instMarket').select_option('ALL')
            page.locator('[data-inst-view="search"]').click()
            page.locator('#instSearch').fill('2330')
            page.locator('[data-inst-search]').click()
            self.assertIn('台積電',page.locator('main').inner_text())
            page.locator('[data-inst-detail="TWSE:2330"]').click()
            page.wait_for_selector('.inst-graph')
            self.assertIn('近 60',page.locator('main').inner_text())
            page.locator('[data-page="overview"]').click()
            page.locator('[data-inst-stock="0050"]').click()
            self.assertIn('我的持股 × 三大法人',page.locator('main').inner_text())
            self.assertIn('元大台灣50',page.locator('main').inner_text())
            self.assertEqual(len(page.evaluate('window.__financeDebug.getState().transactions')),3)
            self.assertEqual(len(page.evaluate('window.__financeDebug.getState().quotes')),2)
            self.assertFalse(errors,errors)
            # Mobile smoke
            m=ctx.new_page()
            m.on('pageerror',lambda e:errors.append(str(e)))
            m.set_viewport_size({'width':390,'height':844})
            m.set_content(html,wait_until='load')
            m.evaluate('''(data)=>{window.fetch=async()=>({ok:true,json:async()=>data})}''',fixture)
            m.locator('#openMenu').click()
            m.locator('[data-page="institutions"]').click()
            m.wait_for_selector('text=買超前 30 名')
            self.assertIn('三大法人籌碼查詢',m.locator('h1').inner_text())
            m.screenshot(path='/mnt/data/Trade_Compass_v1.3_手機預覽.png',full_page=False)
            self.assertFalse(errors,errors)
            b.close()

if __name__ == '__main__':unittest.main()
