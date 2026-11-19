#!/usr/bin/env python3
"""Safely publish generated market data when other GitHub Actions update main.

Records the changed institutional/market JSON files before GitHub Actions resets
its disposable checkout, then reconciles those files against the latest remote.
Only files under these two data directories may be written.
"""
import argparse
import datetime as dt
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path.cwd()
ALLOWED = ("data/institutional/", "data/market/", "data/history/")
TIME_KEYS = ("generatedAt", "updatedAt", "attemptedAt", "lastUpdated", "timestamp", "date", "asOf")


def git(*args, check=True):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, check=check)


def allowed(path):
    return path.endswith(".json") and path.startswith(ALLOWED) and ".." not in Path(path).parts


def read_git_file(commit, path):
    result = git("show", f"{commit}:{path}", check=False)
    return result.stdout if result.returncode == 0 else None


def parse_json(raw):
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else None
    except (ValueError, TypeError, UnicodeError):
        return None


def freshness(doc):
    if not isinstance(doc, dict):
        return None
    for k in TIME_KEYS:
        value = doc.get(k)
        if not value or not isinstance(value, str):
            continue
        try:
            if len(value) == 10:
                return dt.datetime.fromisoformat(value).replace(tzinfo=dt.timezone.utc)
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
        except ValueError:
            continue
    return None


def merge_market_flow(remote, generated):
    """Merge official trading-date records without discarding remote-only dates."""
    if not isinstance(remote.get("records"), list) or not isinstance(generated.get("records"), list):
        return None
    merged = {}
    for row in remote["records"]:
        if not isinstance(row, dict) or not isinstance(row.get("date"), str):
            return None
        merged[row["date"]] = row
    for row in generated["records"]:
        if not isinstance(row, dict) or not isinstance(row.get("date"), str):
            return None
        merged.setdefault(row["date"], row)  # Remote's existing validated day wins.
    latest = max((remote, generated), key=lambda x: freshness(x) or dt.datetime.min.replace(tzinfo=dt.timezone.utc))
    result = dict(latest)
    result["records"] = [merged[k] for k in sorted(merged)]
    return result


def snapshot(folder):
    folder.mkdir(parents=True, exist_ok=True)
    modified = git("diff", "--name-only", "-z", "HEAD", "--", "data/institutional", "data/market", "data/history").stdout
    new = git("ls-files", "--others", "--exclude-standard", "-z", "--", "data/institutional", "data/market", "data/history").stdout
    staged = git("diff", "--cached", "--name-only", "-z", "--", "data/institutional", "data/market", "data/history").stdout
    names = {n.decode("utf-8") for n in (modified + new + staged).split(b"\0") if n}
    names = sorted(n for n in names if allowed(n) and (ROOT / n).is_file())
    for name in names:
        target = folder / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, target)
    (folder / "files.json").write_text(json.dumps(names), encoding="utf-8")
    print(f"Snapshot: {len(names)} modified JSON data files", flush=True)


def apply(folder, base):
    names = json.loads((folder / "files.json").read_text(encoding="utf-8"))
    for name in names:
        if not allowed(name):
            raise ValueError(f"Unsafe snapshot path: {name!r}")
        local = (folder / name).read_bytes()
        remote = (ROOT / name).read_bytes() if (ROOT / name).exists() else None
        original = read_git_file(base, name)
        if remote == local:
            continue
        if remote == original or remote is None:
            result, action = local, "copied new dataset"
        else:
            local_json, remote_json = parse_json(local), parse_json(remote)
            if local_json is None or remote_json is None:
                result, action = remote, "preserved concurrent remote (invalid/unrecognized JSON)"
            elif name == "data/institutional/market-flow.json":
                merged = merge_market_flow(remote_json, local_json)
                if merged is None:
                    result, action = remote, "preserved concurrent remote (unknown record format)"
                else:
                    result = (json.dumps(merged, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
                    action = "merged date-indexed market flow records"
            else:
                newer_local, newer_remote = freshness(local_json), freshness(remote_json)
                if newer_local is not None and (newer_remote is None or newer_local > newer_remote):
                    result, action = local, "used newer verified snapshot"
                else:
                    result, action = remote, "preserved newer or undated concurrent remote snapshot"
        if result is not None:
            dest = ROOT / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(result)
        print(f"{name}: {action}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["snapshot", "apply"])
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--base")
    opts = parser.parse_args()
    if opts.operation == "snapshot":
        snapshot(opts.directory)
    else:
        if not opts.base:
            parser.error("--base required for apply")
        apply(opts.directory, opts.base)


if __name__ == "__main__":
    main()
