#!/usr/bin/env python3
"""Report genuine verified index ETF snapshots against a 12-trading-date goal.

Never manufacture past observations. The existing index rebuilder is the
source of truth for validation; this script merely reports availability.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

BASE = Path('data/index-etf')
CODES = ('0050', '006208', '009816')
TARGET = 12


def inspect(code):
    path = BASE / 'indexes' / (code + '.json')
    data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    dates = sorted({d for d in data.get('dates', []) if isinstance(d, str)}, reverse=True)
    count = len(dates)
    return {
        'etf': code,
        'targetTradingDates': TARGET,
        'availableTradingDates': count,
        'remainingToTarget': max(0, TARGET - count),
        'targetReached': count >= TARGET,
        'latestTwelveDates': dates[:TARGET],
        'earliestAvailableDate': dates[-1] if dates else None,
        'latestAvailableDate': dates[0] if dates else None,
        'sourceTypesByDate': {d: data.get('sourceTypesByDate', {}).get(d, 'unknown') for d in dates[:TARGET]},
        'note': '只計入真正通過驗證且已保存的不同持股日期；不會複製或推估歷史股數。'
    }


def main():
    report = {
        'schema': 1,
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'goal': '各ETF至少12個不同交易日期的實際持股快照',
        'funds': {code: inspect(code) for code in CODES},
    }
    target = BASE / 'coverage' / 'twelve-day-goal.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    # Skip identical progress reports to minimize pointless commits.
    if target.exists():
        try:
            old = json.loads(target.read_text(encoding='utf-8'))
            if old.get('funds') == report['funds']:
                report['generatedAt'] = old.get('generatedAt', report['generatedAt'])
        except (OSError, ValueError):
            pass
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for code in CODES:
        d = report['funds'][code]
        print(f"TARGET12 {code}: {d['availableTradingDates']}/{TARGET}; remaining={d['remainingToTarget']}; latest={d['latestAvailableDate']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
