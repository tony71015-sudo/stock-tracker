#!/usr/bin/env python3
"""Non-destructive idempotent integration into an existing Trade Compass checkout.

Only inserts a script tag and attaches a return-widget call to the preexisting
index_etf.js renderer. Stops if source structure has changed unexpectedly.
"""
from pathlib import Path


def main():
    index = Path('index.html')
    js = Path('index_etf.js')
    if not index.exists() or not js.exists():
        raise SystemExit('Missing index.html or index_etf.js; run this from the repository root.')
    html = index.read_text(encoding='utf-8')
    text = js.read_text(encoding='utf-8')
    tag = '<script src="index_etf_returns.js" defer></script>'
    if tag not in html:
        needle = '<script src="index_etf.js" defer></script>'
        if needle not in html:
            raise SystemExit('Cannot safely locate index_etf.js script tag; ask Codex to integrate manually.')
        html = html.replace(needle, needle + '\n' + tag, 1)
    if 'TradeCompassETFReturns?.html(state.fund)' not in text:
        needle = ' return html;}'
        if text.count(needle) != 1:
            raise SystemExit('Cannot safely locate index ETF render return; ask Codex to integrate manually.')
        text = text.replace(needle, " return html + (window.TradeCompassETFReturns?.html(state.fund)||'');}", 1)
    index.write_text(html, encoding='utf-8')
    js.write_text(text, encoding='utf-8')
    print('Integrated index_etf_returns.js without changing existing ETF or institutional algorithms.')


if __name__ == '__main__':
    main()
