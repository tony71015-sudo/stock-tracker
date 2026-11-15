# Trade Compass v1.7.2：指數型 ETF 累積與股票行情查詢修正

## 修改範圍（局部補丁）

- `scripts/update_market.py`：強化上市/上櫃欄位相容、代號去重、全市場數量檢查；官方來源資料不足時保留舊快照並列出警告。仍是**盤後行情**，不是即時報價。
- `market.js`：修正股票名稱搜尋、股票代號與 `.TW` / `.TWO` 後綴；顯示公開資料的實際有效總筆數與日期。當日無交易且缺少有效價格的證券不會捏造收盤價。
- `scripts/update_index_etf_holdings.py`：保留既有來源，對 0050、006208、009816 每日累積已驗證快照，增加已存歷史日數、缺少日數與日期清單的後台診斷。**不會**虛構 0050、009816 的過往 11 天持股。

## 直接上傳 GitHub

1. 備份目前同名檔案，確認期間沒有 Codex 對其另做修改。
2. 覆蓋 `scripts/update_market.py`、`market.js`、`scripts/update_index_etf_holdings.py` 三個檔案，提交到 `main`。
3. 使用現有的「更新三大法人、股票行情並發布網站」工作流程，確認 `data/market/latest.json` 的 `markets.TWSE.count` 和 `markets.TPEX.count`，且 `warnings` 不含解析失敗。**不要跑 bootstrap**。
4. 使用現有的「更新指數型 ETF 持股」工作流程，於 `data/index-etf/capture-status/` 核對 `historicalDatesSaved`、`remainingTo12`；使用既有的日期索引重建工作流程。
5. 確保 Pages 仍發布 `market.js` 和 `data/market/latest.json`；若發布版本舊，應從現有的正常網站部署流程同步。

## 注意

- 網站目前已確認 006208 有 12 日、0050/009816 各約 1 日；本修正不動也不刪既有日期。
- 無法從官方或可驗證來源查到某個過去日期，就不會將 11/13 快照複製到那天。只有來源實際提供指定歷史日期才能回補。
- 若當日行情抓到的證券數量仍偏少，請查看 `data/market/latest.json` 的 `warnings`、`markets`，很可能是上游欄位變更或資料發布滯後；不要把缺值當成 0。
- 不修改任何既有 GitHub Actions YAML、三大法人籌碼程式、主動式 ETF、投資報酬試算或私人持股。
- 這份補丁是依先前可取得的 v1.5.0 與指數 ETF v2 原始程式製作；若 GitHub 上目前版本已有額外修改，請先比較差異再覆蓋。
