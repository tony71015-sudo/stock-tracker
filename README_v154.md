# Trade Compass v1.5.4 指數型 ETF × 三大法人／GitHub 推送衝突修正

## 本次修正

1. 原本「三大法人、股票行情並發布網站」的 `git push` 因其他工作流程或人員已更新 main 而被拒絕：改為 fetch → rebase → push，最多重試五次；若同一資料檔發生真正的內容衝突則明確失敗，不使用 `--force`。
2. 新增「指數型 ETF × 三大法人」前台頁面：0050 元大台灣50、006208 富邦台50、009816 凱基台灣TOP50。可選兩份持股日期，比較股數、權重、增減與移出，並選擇外資、投信、自營商或三大法人合計，以及 1／5／10／20／60 日淨買賣超。
3. 「成分股法人買賣超」和「ETF 持股變化」是不同統計來源，頁面分開標示；法人買賣超以現有 `data/institutional/latest.json` 最新發布區間為準，不會假裝與持股日期完全一致。
4. 需要**完整實際投資組合**才能比較。0050 等實物申贖 ETF 的 PCF 籃子數量不等於整檔 ETF 真實持股股數；不可把籃子直接當真實持股。新檔 `data/index-etf/indexes/*.json` 預設為空，官方持股未接通時顯示「暫時無法比較」。
5. 有官方完整實際投資組合 CSV 時，前台可以匯入持股資料（CSV 欄位 `etf,date,code,name,shares,weight`）。每個日期至少 40 檔、不能有重複代號，會在本機標示為**使用者匯入、未經官方自動核對**。支援本機匯出備份／清空，不影響個人交易資料。

## 更新順序（只裝補丁，不要重裝舊版完整網站）

先在網站下載交易 JSON 與主動式 ETF 快照備份。

將補丁依下列路徑上傳至既有 GitHub `main`，同名覆蓋，不可把整個 `TradeCompass_v154/` 目錄額外包進 repo：

- `index.html`
- `index_etf.js`（新檔）
- `.github/workflows/update-institutions.yml`（修正 push 並部署新 JS）
- `.github/workflows/update-active-etf-holdings.yml`（部署時包含新 JS 與指數型 ETF 資料）
- `.github/workflows/update-other-active-etfs.yml`（部署時包含新 JS 與指數型 ETF 資料）
- `data/index-etf/indexes/0050.json`、`006208.json`、`009816.json`（全新空索引，不是持股資料）

提交後，在 Actions 確認三大法人工作流程執行成功並發布頁面。新分頁會出現在左側「指數型 ETF × 法人」。

### GitHub workflow 兼容注意

此補丁以 v1.5.0～v1.5.3 先前交付的三個工作流程為基礎。如果你後來曾在 GitHub 額外修改這三個 `.yml`，覆蓋之前應對照差異，避免把你自行新增的步驟蓋掉。

### 官方資料網址（僅供取得完整實際持股；不是本次已接通）

- 0050 元大投信：https://www.yuantaetfs.com/product/detail/0050/ratio
- 006208 富邦投信：請以投信基金產品資訊的完整投資組合揭露為準
- 009816 凱基投信：https://www.kgifund.com.tw/Fund/Detail?fundID=J023

**沒有這些官方完整持股的兩個有效日期前，網頁會顯示無法比較。** 此版本沒有聲稱已自動抓到這三檔的歷史完整持股。

## 測試

- 舊專案測試 `pytest -q tests`：31 passed
- 新模組：50 個持股代號、兩天股數異動、各法人欄位、缺漏顯示，拒絕前十大／申購籃子；Node.js 測試通過。
- 工作流程 YAML 結構可解析，且使用安全推送重試。
- 尚未在使用者 GitHub 實際完成部署與官方持股下載。
