"""Unit tests use synthetic rows only. No fake values are shipped as official data."""
import importlib.util
import pathlib
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('market',ROOT/'scripts/update_market.py')
market=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(market)
PCF=importlib.util.spec_from_file_location('active',ROOT/'scripts/update_active_etf.py')
active=importlib.util.module_from_spec(PCF);PCF.loader.exec_module(active)

class MarketTests(unittest.TestCase):
    def test_twse_daily_official_fields(self):
        example={'Date':'1151112','Code':'2330','Name':'台積電','TradeVolume':'12,345,678','TradeValue':'500,000,000','OpeningPrice':'100.00','HighestPrice':'106','LowestPrice':'99','ClosingPrice':'105'}
        rows=market.parse_twse([example]*101)
        self.assertEqual(len(rows),101)
        self.assertEqual(rows[0]['date'],'2026-11-12')
        self.assertEqual(rows[0]['volumeShares'],12345678)
        self.assertEqual(rows[0]['close'],105)
    def test_tpex_real_field_aliases(self):
        row={'Date':'1151112','SecuritiesCompanyCode':'5483','CompanyName':'中美晶','Open':'135','High':'136','Low':'133','Close':'135','TradingShares':'100,000'}
        rows=market.parse_tpex([row]*101)
        self.assertEqual(len(rows),101)
        self.assertEqual(rows[0]['volumeShares'],100000)
        self.assertEqual(rows[0]['close'],135)
    def test_invalid_prices_not_counted(self):
        row={'Date':'1151112','Code':'2330','Name':'X','TradeVolume':'20','OpeningPrice':'100','HighestPrice':'103','LowestPrice':'110','ClosingPrice':'101'}
        with self.assertRaisesRegex(ValueError,'too few'):market.parse_twse([row]*200)
    def test_daytrade_needs_explicit_header(self):
        doc={'tables':[{'fields':['證券代號','證券名稱','當日沖銷交易成交股數'],'data':[['2330','台積電','12,000'],['0050','ETF','9,000']]}]}
        self.assertEqual(market.parse_daytrade(doc),{'2330':12000,'0050':9000})
        self.assertEqual(market.parse_daytrade({'tables':[{'fields':['證券代號','成交量'],'data':[['2330','12,000']]}]}),{})
    def test_pcf_requires_dates_and_complete_portfolio(self):
        rows=['日期,股票代號,股票名稱,股數,權重']+[f'2026-11-12,{2000+i},股票,1000,1.0' for i in range(5)]
        x=active.parse_csv('\n'.join(rows),{'url':'https://www.example.com.tw/official.csv','minimum_holdings':5})
        self.assertEqual(len(x['holdings']),5)
        self.assertTrue(x['complete'])
        bad='股票代號,股數\n2330,1000\n'
        with self.assertRaisesRegex(ValueError,'date'):active.parse_csv(bad,{'url':'https://www.example.com.tw/a.csv'})

if __name__=='__main__':unittest.main()
