import importlib.util
import json
import pathlib
import unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('market_updater',ROOT/'scripts/update_market.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MarketRepairTests(unittest.TestCase):
 def test_tpex_parses_quote(self):
  rows=[{'Date':'1151113','SecuritiesCompanyCode':str(5000+i),'CompanyName':'股票','Open':'50','High':'51','Low':'49','Close':'50.5','TradingShares':'1000'} for i in range(101)]
  self.assertEqual(len(m.parse_tpex(rows)),101)
 def test_twse_parses_6770_2308(self):
  rows=[{'Date':'1151113','Code':str(2000+i),'Name':'股票','OpeningPrice':'50','HighestPrice':'51','LowestPrice':'49','ClosingPrice':'50.5','TradeVolume':'1000'} for i in range(101)]
  rows[0]['Code']='6770';rows[0]['Name']='力積電';rows[1]['Code']='2308';rows[1]['Name']='台達電'
  parsed=m.parse_twse(rows)
  self.assertEqual({x['code'] for x in parsed if x['code'] in ('6770','2308')},{'6770','2308'})
 def test_incomplete_json_retry(self):
  import io
  class Reply:
   status=200
   headers={}
   def __init__(self,b):self.b=b
   def __enter__(self):return self
   def __exit__(self,*a):return None
   def read(self,*a):return self.b
  with patch.object(m.urllib.request,'urlopen',side_effect=[Reply(b'[ {"Code":"9999"'),Reply(b'[{"Code":"6770"}]')]):
   with patch.object(m.time,'sleep'):
    self.assertEqual(m.fetch_json('https://example.invalid')[0]['Code'],'6770')
if __name__=='__main__':unittest.main()
