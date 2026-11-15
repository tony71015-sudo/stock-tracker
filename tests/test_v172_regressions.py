import importlib.util
import pathlib
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('market_update',ROOT/'scripts/update_market.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RegressionTests(unittest.TestCase):
 def test_otc_full_official_fields(self):
  data=[]
  for i in range(101):
   data.append({'Date':'1151113','SecuritiesCompanyCode':str(5000+i),'CompanyName':'上櫃'+str(i),'Open':'50.5','High':'51','Low':'50','Close':'50.8','TradingShares':'1,200'})
  rows=m.parse_tpex(data)
  self.assertEqual(len(rows),101)
  self.assertEqual(rows[0]['date'],'2026-11-13')
  self.assertEqual(rows[0]['close'],50.8)
 def test_twse_all_stock_rows(self):
  items=[{'Date':'1151113','Code':str(2000+i),'Name':'上市','OpeningPrice':'40','HighestPrice':'41','LowestPrice':'39','ClosingPrice':'40.5','TradeVolume':'1,000'} for i in range(101)]
  self.assertEqual(len(m.parse_twse(items)),101)
 def test_close_only_rows_are_retained_without_fake_open(self):
  items=[{'Date':'1151113','SecuritiesCompanyCode':str(5000+i),'Open':'--','High':'51','Low':'50','Close':'50.8','TradingShares':'1,200'} for i in range(101)]
  rows=m.parse_tpex(items)
  self.assertEqual(len(rows),101)
  self.assertIsNone(rows[0]['open'])
  self.assertEqual(rows[0]['close'],50.8)
if __name__=='__main__':unittest.main()
