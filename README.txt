Trade Compass — GitHub Pages recovery (2026-11-15)

Only REPLACE this GitHub file through GitHub website:
.github/workflows/update-institutions.yml

1. GitHub > Code > .github > workflows > update-institutions.yml
2. Edit with pencil; replace contents using the file in this ZIP; Commit to main.
3. Actions > 更新三大法人、股票行情並發布網站 > Run workflow (mode=auto).
4. Check https://tony71015-sudo.github.io/stock-tracker/index_etf_returns.js

Important:
- Does not attempt to modify GitHub workflows from inside Actions.
- Adds index_etf_returns.js to public site assets when present.
- Skips missing optional datasets.
- Only commits institutional and market data; active ETF data are maintained by their separate workflows.
- Does NOT create index ETF holdings datasets.
- If workflow still fails, capture the exact failing step; do not reinstall automatic workflow patch.
