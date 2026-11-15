import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

FILE=pathlib.Path(__file__).resolve().parents[1]/'scripts'/'refresh_0050_dividends.py'
spec=importlib.util.spec_from_file_location('dividend_v174',FILE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class DividendTests(unittest.TestCase):
    def test_date_and_cash(self):
        self.assertEqual(mod.dval('115/11/13'),'2026-11-13')
        self.assertEqual(mod.amount('1.50'),1.5)
        self.assertIsNone(mod.amount('-2'))
    def test_parse_official_snapshot(self):
        payload={'fields':['證券代號','除息交易日','收益分配發放日','收益分配金額'],
                 'data':[['0050','2026/08/07','2026/09/11','1.00'],['006208','2026/08/07','2026/09/11','1.00']]}
        parsed=mod.parse_twse(payload)
        self.assertEqual(len(parsed),1)
        self.assertEqual(parsed['2026-08-07']['amount'],1)
    def test_failed_official_fetch_does_not_create_fake_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(mod,'TARGET',pathlib.Path(folder)/'0050.json'):
                with patch.object(mod,'fetch_twse',side_effect=RuntimeError('blocked')):
                    self.assertEqual(mod.run(require=False),0)
                    self.assertFalse(mod.TARGET.exists())
    def test_merge_retains_old_valid_events(self):
        import json
        with tempfile.TemporaryDirectory() as folder:
            target=pathlib.Path(folder)/'0050.json'
            target.write_text(json.dumps({'etf':'0050','events':[{'exDate':'2025-06-17','paymentDate':'2025-07-01','amount':0.5}]}),encoding='utf-8')
            with patch.object(mod,'TARGET',target):
                with patch.object(mod,'fetch_twse',side_effect=RuntimeError('blocked')):
                    self.assertEqual(mod.run(),0)
            result=json.loads(target.read_text(encoding='utf-8'))
            self.assertEqual(len(result['events']),1)

if __name__=='__main__':unittest.main()
