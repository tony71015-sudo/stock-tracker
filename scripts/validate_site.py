"""Check the actual Pages artifact and run network-free regression tests."""
import json
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]

class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        value = attrs.get('src') if tag == 'script' else attrs.get('href') if tag == 'link' and attrs.get('rel') == 'stylesheet' else None
        if value and not urlsplit(value).scheme and not value.startswith('//'):
            self.paths.append(unquote(urlsplit(value).path))

def validate(directory):
    directory = Path(directory).resolve()
    parser = Assets()
    parser.feed((directory / 'index.html').read_text(encoding='utf-8'))
    for asset in parser.paths:
        path = (directory / asset).resolve()
        if not path.is_relative_to(directory) or not path.is_file() or not path.stat().st_size:
            raise ValueError('Missing or invalid published asset: ' + asset)
        if path.suffix == '.js':
            subprocess.run(['node', '--check', str(path)], check=True)
    for path in directory.glob('data/**/*.json'):
        json.loads(path.read_text(encoding='utf-8'))
    print('PASS: published HTML dependencies and JSON files', flush=True)

def main():
    validate(sys.argv[1] if len(sys.argv) > 1 else ROOT)
    for path in sorted((ROOT / 'tests').glob('test_*.py')):
        if path.name == 'test_browser.py':
            continue  # Browser integration is a separate check, not an offline unit test.
        subprocess.run([sys.executable, '-B', str(path)], cwd=ROOT, check=True)
    subprocess.run(['node', 'tests/test_etf_curve_v174.js'], cwd=ROOT, check=True)
    print('PASS: offline regressions; browser integration not included', flush=True)

if __name__ == '__main__':
    main()
