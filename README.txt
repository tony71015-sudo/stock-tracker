Trade Compass: recovery of update-institutions Git rebase error

Replace only .github/workflows/update-institutions.yml on GitHub main.
This repair stops update_active_etf.py running in the institutional workflow (ETF snapshots have their own jobs), isolates stray generated files before rebase, and preserves GitHub Pages staging of index_etf_returns.js.
After manual upload/commit, run 更新三大法人、股票行情並發布網站 with mode=auto. Verify Commit public market datasets and Deploy GitHub Pages are green. No bootstrap needed.
Note: If the source repository has diverged since the last supplied version, review the YAML diff before overwriting.
