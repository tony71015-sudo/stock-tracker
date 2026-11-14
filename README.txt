Trade Compass v1.5.7 — fix other active ETF importer skipping all as unlisted.

Replace only scripts/import_other_active_etfs.py in your GitHub repository, commit to main, then manually run update-other-active-etfs.yml. No workflow or HTML replacement necessary.

The importer will add missing supported ETF entries to data/active-etf/catalog.json, retaining the existing catalog, and import only eligible snapshots. PCF-only funds remain excluded; structural checks do not independently verify actual fund holdings.

Verify Actions log: CATALOG_RECOVERED, ETF_RESULT status saved/retained/unavailable rather than unlisted. GitHub Actions success does not guarantee verified holdings.
