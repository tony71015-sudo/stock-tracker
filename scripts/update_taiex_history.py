#!/usr/bin/env python3
"""Fetch TWSE daily TAIEX history from the official monthly index endpoint."""
from __future__ import annotations
import datetime as dt
import json
import logging
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "history" / "taiex.json"
URL = "https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TradeCompass historical index data)",
    "Accept": "application/json,text/plain,*/*",
}
LOG = logging.getLogger("taiex_history")


def month_iter(start: dt.date, end: dt.date):
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        yield year, month
        month += 1
        if month > 12:
            year, month = year + 1, 1


def fetch_month(year: int, month: int) -> list[list[object]]:
    query_date = f"{year}{month:02d}01"
    request = urllib.request.Request(
        f"{URL}?date={query_date}&response=json",
        headers={**HEADERS, "Cache-Control": "no-cache"},
    )
    last_error = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if payload.get("stat") not in ("OK", "NO DATA!"):
                raise ValueError(f"TWSE status: {payload.get('stat')}")
            rows = []
            for row in payload.get("data", []):
                if len(row) < 5:
                    continue
                match = re.fullmatch(r"\s*(\d{2,3})/(\d{1,2})/(\d{1,2})\s*", str(row[0]))
                if not match:
                    continue
                roc_year, m, d = map(int, match.groups())
                date = dt.date(roc_year + 1911, m, d).isoformat()
                close = float(str(row[4]).replace(",", "").strip())
                if close > 0:
                    rows.append([date, close])
            return rows
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
            last_error = exc
            if attempt < 4:
                delay = min(2 ** attempt, 16)
                LOG.warning("%s/%02d attempt %d failed: %s; retry in %ds",
                            year, month, attempt + 1, exc, delay)
                time.sleep(delay)
    raise RuntimeError(f"TWSE history unavailable for {query_date}: {last_error}")


def load_existing():
    try:
        if DEST.exists():
            payload = json.loads(DEST.read_text(encoding="utf-8"))
        else:
            # A queued workflow may check out an older push commit while a newer
            # Actions run has already published the archive to main.
            archive_url = "https://raw.githubusercontent.com/tony71015-sudo/stock-tracker/main/data/history/taiex.json"
            request = urllib.request.Request(archive_url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = json.loads(response.read().decode("utf-8"))
        if payload.get("index") != "TAIEX":
            return {}
        return {row[0]: row for row in payload.get("rows", [])
                if isinstance(row, list) and len(row) == 2}
    except (OSError, urllib.error.URLError, json.JSONDecodeError, AttributeError):
        LOG.warning("No reusable TAIEX archive available; a full backfill may be required.")
        return {}


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    today = dt.date.today()
    existing = load_existing()
    if existing:
        latest = max(dt.date.fromisoformat(key) for key in existing)
        start = latest.replace(day=1)
        start = (start.replace(day=1) - dt.timedelta(days=1)).replace(day=1)
        LOG.info("Updating TWSE TAIEX history from %s", start)
    else:
        start = dt.date(1999, 1, 1)
        LOG.info("Bootstrapping TWSE TAIEX history from 1999-01")
    merged = dict(existing)
    months = list(month_iter(start, today))
    for index, (year, month) in enumerate(months):
        rows = fetch_month(year, month)
        for row in rows:
            merged[row[0]] = row
        LOG.info("%s-%02d: %d daily rows", year, month, len(rows))
        if index + 1 < len(months):
            time.sleep(1)
    ordered = [merged[key] for key in sorted(merged)]
    if not ordered or ordered[0][0] > "1999-01-31":
        raise RuntimeError("TAIEX history does not reach January 1999; refusing partial publication.")
    payload = {
        "schema": 1,
        "index": "TAIEX",
        "source": "TWSE MI_5MINS_HIST",
        "sourceUrl": URL,
        "priceType": "daily close index; price return only, excludes dividends",
        "coverageStart": ordered[0][0],
        "asOf": ordered[-1][0],
        "rows": ordered,
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
                    encoding="utf-8")
    LOG.info("Saved %d daily TAIEX rows (%s to %s)", len(ordered), ordered[0][0], ordered[-1][0])


if __name__ == "__main__":
    main()
