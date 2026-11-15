import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('validate_site', Path(__file__).resolve().parents[1] / 'scripts/validate_site.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PublishedAssetTests(unittest.TestCase):
    def test_missing_deferred_module_blocks_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'index.html').write_text('<script src="index_etf_returns.js?v=1" defer></script>')
            with self.assertRaisesRegex(ValueError, 'index_etf_returns.js'):
                module.validate(root)

    def test_missing_stylesheet_blocks_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'index.html').write_text('<link rel="stylesheet" href="tools.css">')
            with self.assertRaisesRegex(ValueError, 'tools.css'):
                module.validate(root)

if __name__ == '__main__':
    unittest.main()
