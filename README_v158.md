# Trade Compass v1.5.8｜非股票資產與四檔替代持股來源

## 安裝（共四個檔案）

解壓後依照相對路徑上傳到 `tony71015-sudo/stock-tracker` 的 `main` 分支：

1. `scripts/import_other_active_etfs.py`（覆蓋現有 v1.5.7）
2. `scripts/import_alternative_active_etfs.py`（新增）
3. `.github/workflows/update-other-active-etfs.yml`（覆蓋 v1.5.6）
4. `active_etf.js`（覆蓋；新增現金、存款、期貨比較區塊）

**切勿整站重裝**。這份補丁不包含，也不改動統一投信抓取程式、法人更新程式、`index_etf.js`、使用者交易紀錄及既有快照。先備份 GitHub Repo 和瀏覽器中的個人交易紀錄。

GitHub → Actions →「更新其他台股主動式ETF持股並發布網站（來源不足標示無法比較）」→ Run workflow（main）。展開：

- `Validate and archive available issuer-reported holdings`：00994A、00408A 有望由原來的非股票項目錯誤改成 `saved`。
- `Collect alternative portfolio sources (fail closed on partial/PCF)`：檢視 `ALT_SOURCE_RESULT`。四檔各自顯示 `saved` 或 `unavailable` 及具體原因。成功後每次執行最多只新增當前來源頁面的**一個**有效日期。兩個不同日期成功後才開放日期比較。

## 資料設計與限制

### 00994A、00408A：非股票項目分類

把現金、存款、期貨、保證金、應收應付款從 `holdings` 分離為 `assetPositions`，保留原始來源數值及權重。股票完整性仍以股票項目檢驗，維持「同一股票、兩日期」比較。新增前台「非股票資產」表格。

- 現金／存款：來源若未提供「元／新台幣／TWD」單位，**不**把 SQLite 的 `shares` 當作元；顯示「來源單位待核實」，但可比較兩日期權重（百分點）。
- 期貨：只有來源名稱明確標示「口」時才以契約口數比較；標示不清時保留原始數值，不做口數增減推論。
- 期貨保證金與期貨契約是不同部位，不能合併。
- 若某部位只出現在其中一個日期，**不**把缺席直接當成 0 或平倉。
- 股數變化不等於基金經理人實際成交量。

### 00401A、00996A、00407A、00410A：替代來源

新增保守的自動擷取器：

| ETF | 尋找資料的頁面 | 資料類型 |
| --- | --- | --- |
| 00401A | `https://accounts.cmoney.tw/etf/tw/00401A/fundholding` | 第三方 CMoney |
| 00996A | `https://www.megafunds.com.tw/MEGA/etf/etf_product.aspx?id=23` | 兆豐投信官方 |
| 00407A | `https://www.moneydj.com/etf/x/basic/basic0007.xdjhtm?etfid=00407a.tw` | 第三方 MoneyDJ |
| 00410A | `https://www.moneydj.com/etf/x/basic/basic0007.xdjhtm?etfid=00410a.tw` | 第三方 MoneyDJ |

只在 HTML 可讀取、持股表有日期、至少 15 檔股票、完整股數與權重、股票權重合計在 40–103% 且沒有重複代號時，歸檔候選快照。嚴格拒絕前十大、無日期、PCF 或不合格資料。來源標記是「結構驗證通過，尚待官方逐筆核對」，**不保證獨立核對過的完整實際投資組合**。

外部網站可能有 JavaScript 載入、反爬蟲措施或改版，因此此次僅在模擬 HTML 執行了四個解析測試，**尚未實測 GitHub Actions 正式網路抓取成功**。沒有保證 4 檔會一次成功；失敗不刪除任何原有快照。請尊重資料供應者的使用條款和請求頻率。

## 排查

- `ALT_SOURCE_RESULT 00996A saved ...`：成功新增當日有效資料；需累積至少兩個有效日期。
- `ALT_SOURCE_RESULT 00407A unavailable ...`：來源目前不可解析或驗證不過，保留先前資料。
- 若 00994A / 00408A 仍 `unavailable`，查看 `reason`；可能另有非股票項目未被分類或股票權重不足，**不要直接取消驗證**。

## 本地檢查

`python -m py_compile scripts/import_other_active_etfs.py scripts/import_alternative_active_etfs.py`

`node --check active_etf.js`

## 版本相容

本包的 `.github/workflows/update-other-active-etfs.yml` 以 v1.5.6 的逐投信抓取、推送重試與資料夾容錯流程為基礎，新增替代資料採集步驟。請只覆蓋列出的四個檔案，不要回退已存在的最新行情／法人程式。
