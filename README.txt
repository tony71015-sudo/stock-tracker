Trade Compass - Active ETF concurrent Git rebase conflict fix

Replaces/adds exactly two files:
  .github/workflows/update-other-active-etfs.yml  (replace)
  scripts/merge_active_etf_status.py                (add)

Why: multiple GitHub Actions jobs modify data/active-etf/status.json.
The earlier workflow aborted rebase when the remote main changed.

How:
1. Back up the existing workflow from GitHub.
2. Upload these two files to the matching GitHub repository paths.
3. Commit to main.
4. Actions > update-other-active-etfs > Run workflow (new run, not Re-run jobs).
5. Verify Commit public ETF snapshots only and Deploy GitHub Pages.

Safety:
- Does not force push.
- Resolves only the status.json structured metadata conflict.
- Fails on unexpected conflicts.
- Keeps ETF records with more available historical dates, and merges disjoint ETF codes.
- Does NOT modify portfolio data or certify third-party data.
- This patch does not resolve other issuers' PCF or invalid asset classifications.
