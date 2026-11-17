"""Offline safety checks for the 0050 dividend importer."""
import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "dividends", pathlib.Path(__file__).resolve().parents[1] / "scripts/refresh_0050_dividends.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class DividendTests(unittest.TestCase):
    def test_valid_official_rows(self):
        payload = {"fields": ["證券代號", "除息交易日", "收益分配發放日", "收益分配金額"],
                   "data": [["0050", "115/01/16", "115/02/12", "1.2"],
                            ["006208", "115/01/16", "115/02/12", "0.8"]]}
        self.assertEqual(mod.parse_twse(payload)["2026-01-16"]["amount"], 1.2)

    def test_reject_unknown_schema(self):
        with self.assertRaises(ValueError):
            mod.parse_twse({"fields": ["證券代號"], "data": [["0050"]]})

    def test_no_fabricated_archive_on_source_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = pathlib.Path(tmp) / "0050.json"
            with patch.object(mod, "TARGET", target), patch.object(
                mod, "fetch_twse", side_effect=RuntimeError("offline")
            ):
                self.assertEqual(mod.run(require=False), 0)
                self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
