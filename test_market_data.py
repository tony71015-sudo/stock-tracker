import datetime as dt
import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'update_institutions.py'
spec = importlib.util.spec_from_file_location('update_institutions', SCRIPT)
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)


def twse_row():
    return ['1802', '台玻', '226,869,116', '86,542,809', '140,326,307', '0','0','0',
        '3,511,000','0','3,511,000','858,492','3,930,519','2,288,678','1,641,841',
        '2,409,257','3,192,606','-783,349','144,695,799']


def tpex_row():
    v=['0']*24
    v[0]='5483';v[1]='中美晶';v[2]='9000';v[3]='5000';v[4]='4000'
    v[11]='1000';v[12]='2000';v[13]='-1000'
    v[14]='1500';v[15]='1000';v[16]='500'
    v[17]='2000';v[18]='500';v[19]='1500'
    v[20]='3500';v[21]='1500';v[22]='2000';v[23]='5000'
    return v

class InstitutionalTests(unittest.TestCase):
    def test_twse_official_19_columns(self):
        actual=u.parse_twse({'stat':'OK','data':[twse_row()]})
        self.assertEqual(actual,[['1802','台玻',140326307,3511000,858492,1641841,-783349,144695799]])

    def test_tpex_24_duplicated_field_names(self):
        actual=u.parse_tpex({'tables':[{'fields':['買進股數']*24,'data':[tpex_row()]}]})
        self.assertEqual(actual,[['5483','中美晶',4000,-1000,2000,500,1500,5000]])

    def test_schema_drift_never_shows_misleading_numbers(self):
        bad=twse_row();bad[18]='100'
        with self.assertRaisesRegex(ValueError,'schema mismatch'):
            u.parse_twse({'stat':'OK','data':[bad]})
        bad=tpex_row();bad[22]='100'
        with self.assertRaisesRegex(ValueError,'schema mismatch'):
            u.parse_tpex({'tables':[{'data':[bad]}]})

    def test_tpex_no_data_not_fabricated(self):
        self.assertIsNone(u.parse_tpex({'tables':[]}))

    def test_fixed_api_urls(self):
        urls=u.date_urls(dt.date(2026,11,12))
        self.assertIn('date=20261112',urls['TWSE'])
        self.assertIn('date=115%2F11%2F12',urls['TPEX'])

    def test_completeness_and_window_60(self):
        base=dt.date(2026,8,1)
        days={}
        for i in range(60):
            day=(base+dt.timedelta(days=i)).isoformat()
            days[day]={'date':day,'markets':{'TWSE':[['0050','元大台灣50',100,-20,30,10,20,110]],'TPEX':[['5483','中美晶',-50,0,50,20,30,0]]}}
        snapshot,history=u.generate(days,'2026-11-13T05:00:00+00:00')
        v=snapshot['marketData']['TWSE']['entries'][0]
        self.assertEqual(v[8],[500,-100,150,550,5])
        self.assertEqual(v[9],[1000,-200,300,1100,10])
        self.assertEqual(v[10],[2000,-400,600,2200,20])
        self.assertEqual(v[11],[6000,-1200,1800,6600,60])
        self.assertEqual(len(history['TWSE']['series']['0050']),60)

        small=dict(list(days.items())[:15])
        snapshot2,_=u.generate(small)
        partial=snapshot2['marketData']['TWSE']['entries'][0]
        self.assertIsNone(partial[10])
        self.assertIsNone(partial[11])

    def test_stock_newly_listed_displays_observed_count(self):
        base=dt.date(2026,8,1); days={}
        for i in range(60):
            day=(base+dt.timedelta(days=i)).isoformat()
            rows=[['0050','元大台灣50',100,0,0,0,0,100]]
            if i>=57:rows.append(['2345','新股',10,2,3,1,2,15])
            days[day]={'date':day,'markets':{'TWSE':rows}}
        snapshot,_=u.generate(days)
        ipo=next(x for x in snapshot['marketData']['TWSE']['entries'] if x[0]=='2345')
        self.assertEqual(ipo[11],[30,6,9,45,3])

if __name__=='__main__':unittest.main()
