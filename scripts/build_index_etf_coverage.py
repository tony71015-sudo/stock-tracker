#!/usr/bin/env python3
"""Report only verifiable data present in repository; never fabricates portfolios.
Run locally or in the optional daily workflow.
"""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import json

FUNDS = {'0050': '元大台灣50', '006208': '富邦台50', '009816': '凱基台灣TOP50'}


def read_json(path):
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, OSError):
        return None


def report(root):
    output = {'schema': 1, 'updatedAt': datetime.now(timezone.utc).isoformat(), 'funds': {}}
    for code, name in FUNDS.items():
        index = read_json(root / f'data/index-etf/indexes/{code}.json')
        candidates = index.get('dates', []) if isinstance(index, dict) else []
        valid = []
        for day in sorted(set(candidates)):
            try:
                datetime.strptime(day, '%Y-%m-%d')
            except (ValueError, TypeError):
                continue
            snap = read_json(root / f'data/index-etf/history/{code}/{day}.json')
            if not isinstance(snap, dict) or snap.get('etf') != code or snap.get('date') != day:
                continue
            h = snap.get('holdings')
            if not isinstance(h, list) or len(h) < 40 or snap.get('verified') is not True or snap.get('kind') != 'actual_portfolio':
                continue
            if snap.get('type') in ('pcf_basket', 'creation_basket'):
                continue
            valid.append(day)
        price = read_json(root / f'data/index-etf/prices/{code}.json')
        dividend = read_json(root / f'data/index-etf/dividends/{code}.json')
        price_count = len(price.get('rows', [])) if isinstance(price, dict) and isinstance(price.get('rows'), list) else None
        dividend_count = len(dividend.get('events', [])) if isinstance(dividend, dict) and isinstance(dividend.get('events'), list) else None
        output['funds'][code] = {
            'name': name,
            'portfolioStatus': 'comparable' if len(valid) >= 2 else 'single_day' if len(valid) == 1 else 'unavailable',
            'verifiedPortfolioDates': valid,
            'verifiedPortfolioCount': len(valid),
            'portfolioLatest': valid[-1] if valid else None,
            'indexDatesListed': len(candidates),
            'priceFileExists': price is not None,
            'priceRowCountIfRowsSchema': price_count,
            'dividendPolicy': 'no_distribution' if code == '009816' else 'distributes',
            'dividendFileExists': dividend is not None,
            'dividendEventCount': dividend_count,
            'notes': '有日期索引仍需有效的實際持股檔；成分股法人交易不可當成基金交易。',
        }
    return output


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--root', default='.')
    p.add_argument('--output', default='data/index-etf/availability.json')
    args = p.parse_args()
    root = Path(args.root)
    dest = root / args.output
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload = report(root)
    dest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({code: x['portfolioStatus'] for code, x in payload['funds'].items()}, ensure_ascii=False))


if __name__ == '__main__':
    main()
