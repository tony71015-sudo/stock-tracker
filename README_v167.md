# Trade Compass v1.6.7：0050、006208 歷史配息與總收益

本補丁以使用者已採用的 v1.6.6 為基礎，只需覆蓋兩個檔案，不需更改既有 GitHub Actions YAML，也不會覆蓋 index.html、三大法人、主動式 ETF 資料。

## 上傳檔案

- `index_etf_returns.js` → GitHub 儲存庫根目錄（覆蓋同名檔）
- `scripts/update_index_etf_dividends.py` → GitHub `scripts/`（覆蓋同名檔）

**不要上傳 `__pycache__`。** 提交後，執行既有的「更新指數型 ETF 官方歷史股價（自動補缺）」工作流程；該工作流程原本已有呼叫 `python scripts/update_index_etf_dividends.py`。再使用現有發布流程將 `data/index-etf/dividends/*.json` 和 `index_etf_returns.js` 發布至 GitHub Pages。

## 歷史配息

- 0050：自證交所查詢介面可取得的 2005 年起逐筆累積；0050 2003–2004 年的官方配息事件不保證在現有介面可查，不能直接當作已完整核對。
- 006208：查詢起點使用上市日 2012-07-17，往後逐筆累積。尚須逐筆核對是否有漏報，最早事件日期不等於已證明完整歷史。
- 009816：保持原本的「收益不分配」處理，不製造虛構配息。
- 下載失敗、欄位格式不符或查無符合資格事件時，保留舊有有效資料；不得以 0 元配息假裝已核實完整歷史。

`data/index-etf/dividends/0050.json`、`006208.json` 會新增 `listingDate`、`firstEventDate`、`lastEventDate`、`verificationStatus` 等診斷欄位，保留既有 `events` 相容格式。

## 網頁新增

在「指數型 ETF × 三大法人」的報酬試算區新增：

- 各檔最早與最近已收錄配息日期、完整逐筆事件表（除息日、發放日、每單位金額）
- 總收益／總損益、總報酬率、累計本金、持股股價價差、配息貢獻、已用配息再投入金額
- 繼續保留每月定期定額、單筆加碼、0050 分割 1 拆 4、XIRR、最高與最低損益

### 計算口徑

**純價格**：總損益 = 最新持股市值 − 實際已買入成本（不含現金股息）。

**配息留現金**：總損益 = 最新持股市值 + 已收現金股息 + 應收未領股息 − 實際已買入成本。

**配息再投入**：總損益 = 最新持股市值 + 尚未投入的股息現金 + 應收未領股息 − 實際已買入成本；已再投入的股息不算新增外部本金。0050 股票分割會增加股數、不改變原始投入本金。

股價價差與配息貢獻為**分項展示**；如果股息已再投入，須扣除再投入的資金流後再合計，以避免重複認列。模擬買入按取得的每日收盤價，不等同實際成交；尚未包含股息所得稅、二代健保補充保費、滑價與賣出費稅。

## 資料檢查

- GitHub 後台：`data/index-etf/dividends/0050.json`、`006208.json` 的 `events` 是否有增量。
- GitHub Pages：`https://tony71015-sudo.github.io/stock-tracker/data/index-etf/dividends/0050.json`、`006208.json` 能否開啟。
- JS 模組：`https://tony71015-sudo.github.io/stock-tracker/index_etf_returns.js` 不應是 404。

**注意**：此 ZIP 包含程式，不含事先捏造或未逐筆驗證的歷史配息資料。必須在 GitHub Actions 真實抓取成功、GitHub Pages 正式發布後，才會在網站顯示真實事件。因為資料可能延遲、缺漏，投資前請向元大、富邦投信官方公告交叉核對。
