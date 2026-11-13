# 投資風控中心 Trade Compass v1.3

> GitHub Pages 免費託管、上市＋上櫃三大法人公開行情排程更新、持股交易紀錄只保存在使用者自己的瀏覽器。
>
> **上線前請先從舊網站下載 JSON 備份，並且保留原有 GitHub Pages 網址。**

## v1.3 新增功能

- 「三大法人籌碼」分頁：上市 TWSE、上櫃 TPEx、合併市場。
- **當日**買賣超排行，以及 **5 / 10 / 20 / 60 個交易日**累積外資、投信、自營商、三大法人合計買賣超。
- 買超與賣超前 30 名、依法人類別篩選、按代號或名稱搜尋個股。
- 個股近 60 筆交易日「區間累積淨買賣超」折線圖，5／10／20／60 日累積數值與涵蓋筆數。
- 「我的持股法人追蹤」：在**瀏覽器本機**以股票代號對照市場資料，從總覽表可直接點「法人」。
- 最新資料日期、最後收集時間、上市／上櫃個別日期、累積資料不足、過期／失敗警示。
- 自動更新：GitHub Actions 工作日每日兩次抓取、驗證資料，並**直接重新部署 GitHub Pages**。
- 沿用 v1.2 原本交易、成本、停利停損、價格手動更新、國泰證券 2.8 折試算及 JSON 備份。

### 官方資料與口徑

- [臺灣證券交易所 T86 上市三大法人買賣超日報](https://www.twse.com.tw/zh/trading/foreign/t86.html)
- [櫃買中心上櫃三大法人買賣明細](https://www.tpex.org.tw/zh-tw/mainboard/trading/major-institutional/detail/day.html)
- 上市透過 `https://www.twse.com.tw/rwd/zh/fund/T86?...` 取得指定日期的個股資料。
- 上櫃透過 `https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?...` 取得指定日期的個股資料。
- **單位為股，不是張。** 外資採**不含外資自營商**口徑；自營商合計含自行買賣及避險部位。三大法人合計＝外資（不含外資自營商）＋投信＋自營商。
- 驗證每筆自營商（自行＋避險）和三大法人合計的會計恆等式；不符合則捨棄整批資料並顯示更新失敗，不把欄位錯誤當成真實籌碼。
- 若一個市場歷史資料不足 60 個有效交易日，對應 60 日欄顯示「資料不足」，不拿 30 日充作 60 日。
- 新上市標的即使市場具備 60 個交易日，也會標明該檔股票實際收錄幾日。
- 公開法人資料**不等於持股比例、券商分點、ETF 經理人對成分股的買賣或即時成交價格**。

## 上線教學：沿用 `tony71015-sudo/stock-tracker`

### 1. 先備份交易資料

開啟原站 `https://tony71015-sudo.github.io/stock-tracker/`，點「資料匯入與備份」→「下載完整備份」。確認 JSON 檔案已保存在電腦。不要上傳個人 JSON 備份到公開的 GitHub Repository。

### 2. 將這個 ZIP **解壓縮**後上傳到原 GitHub 專案根目錄

到 [stock-tracker GitHub Repository](https://github.com/tony71015-sudo/stock-tracker)，開啟 `Code` 頁面。

- 更新原本 `index.html`。GitHub 網頁介面可點進 `index.html` → 鉛筆「Edit this file」→ 全選替換新版檔案文字 → `Commit changes`；或以 Git 操作覆寫。
- 新增 `institutional.js`、`institutional.css`。
- 新增 **完整** `.github/workflows/update-institutions.yml`（包含開頭的點 `.` 和完整路徑）。網頁操作可以 `Add file → Create new file`，在檔名欄輸入 `.github/workflows/update-institutions.yml`，GitHub 會自動建立子資料夾。
- 新增 `scripts/update_institutions.py`。
- 新增 `data/institutional/latest.json`（空白初始化版本，不含假行情），以及 `data/institutional/README.md`。
- 其他 `README.md`、`.gitignore` 與 `tests/` 為維護用；不影響網站執行。建議一起上傳。

**注意：** 單純將 ZIP 壓縮檔上傳到 Repository 不會自動變成網站。必須上傳解壓縮後的檔案，並保留子資料夾路徑。

### 3. 必須修改一次 GitHub Pages 發布來源

這版需要 GitHub Actions 直接部署，**不能只沿用原本的「Deploy from a branch」**。前往：

`GitHub → stock-tracker → Settings → Pages → Build and deployment → Source → GitHub Actions`

GitHub 官方文件指出：由 `GITHUB_TOKEN` 自動提交的檔案更新**不會觸發從分支發布的 Pages 建置**。本版改用 `actions/deploy-pages` 在**同一次工作流程**直接發布，因此不需要個人存取權杖或付費主機。

### 4. 第一次初始化至少 60 個交易日

前往 `GitHub → stock-tracker → Actions → 更新三大法人並發布網站 → Run workflow`

- Branch 選 `main`
- Mode 選 `bootstrap`（或選 `auto`，如果之前完全沒有資料會自動回填）
- 點 `Run workflow`
- 待工作流程顯示綠色成功，再到原本站址重新整理。

這個初始化會查詢最近 **112 個日曆日內的工作日**（預計超過 60 個交易日，實際仍取決於休市、來源正常與否）。

若看到「資料不足」、「更新失敗」，到 **Actions 執行紀錄**查看原始警告，過後可再次選 `bootstrap` 重試。請勿自行填入假數據或把不完整歷史當成完整數據。

### 5. 後續自動更新

工作流程排程：臺灣時間週一到週五 **20:35**、**22:35**，兩次更新／重新部署，以提高官方收盤資料可用性。GitHub 排程可能延遲或跳過、官方資料可能尚未更新、休市日沒有資料；並不是即時行情。公開 Repository 長時間無活動也可能使排程被 GitHub 暫停，請定期檢查 Actions 是否正常。

如要立即重跑：前往相同 Actions 頁面手動執行，Mode 選 `daily`，會重新檢查最近 8 個日曆日（未確認資料）。Mode 選 `bootstrap` 則重新檢查最近 112 日並補齊缺漏。

## 網站檔案結構

```text
stock-tracker/
├── index.html                       網站主介面（原 v1.2 全功能保留）
├── institutional.js                三大法人查詢與圖表前端
├── institutional.css               響應式法人查詢樣式
├── scripts/
│   └── update_institutions.py       官方資料抓取／驗證／統計
├── data/
│   └── institutional/
│       ├── latest.json              首次初始化為「尚無資料」
│       ├── history-twse.json        Actions 自動產生
│       ├── history-tpex.json        Actions 自動產生
│       ├── status.json              Actions 自動產生
│       └── days/YYYY-MM-DD.json     Actions 自動產生
└── .github/workflows/
    └── update-institutions.yml      排程抓取並重新部署 GitHub Pages
```

`tests/` 為離線測試程式，使用示範資料驗證解析、排行與畫面，不會以示範資料覆寫正式報表。

## 本機資料與安全

- 使用者自行輸入的買賣紀錄、成本、參考價格、停損參數、國泰券商試算偏好仍由原本的 `localStorage` key `trailing-stop-tw-web-v1` 儲存在**目前瀏覽器／裝置／網站網址**。
- GitHub 儲存與發布的只是網站程式及**官方公開法人資料**；不會自動拿到使用者股票股數、交易成本、JSON 備份。
- 從舊版升級且網址不變，正常情況會沿用原資料；清除網站資料、更換裝置、無痕模式或刪除瀏覽器設定檔則可能遺失，建議至少每月匯出備份。
- **請定期備份，不要定期清除。** 若在公用電腦使用，先確認備份後再清除網站資料。
- 不含券商 API、不含雲端同步、不會自動下單；三大法人資料更新**不會自動更新股價、個人未實現損益或停利停損線**。

## 開發與測試

使用 Python 3.10+（抓取只用標準函式庫）：

```bash
python scripts/update_institutions.py --mode bootstrap
python scripts/update_institutions.py --mode daily
python -m unittest discover -s tests -v
```

`tests/test_browser.py` 需要 Playwright 和 Chromium，屬開發者測試，部署工作流程**不依賴**它。

## 驗證聲明

本版已完成離線單元測試與瀏覽器互動測試（使用與官方欄位規格一致的測試資料）。由於製作環境無法直接連線官方 API，**尚未在真正 GitHub Actions 主機上完成首次對外抓取驗證**；請以部署後 Actions 執行結果、官方報表日與檔案完整度為最終確認依據。最新 JSON 在第一次成功抓取前故意留空，避免冒充真實行情。

## 開放資料／平台參考

- https://www.twse.com.tw/zh/trading/foreign/t86.html
- https://www.tpex.org.tw/zh-tw/mainboard/trading/major-institutional/detail/day.html
- https://www.tpex.org.tw/openapi/
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
