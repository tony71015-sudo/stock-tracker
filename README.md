# 投資風控中心 Trade Compass v1.4

**沿用既有 GitHub Pages `https://tony71015-sudo.github.io/stock-tracker/`，不改網址。**

這份網站是以原 v1.3 原始程式碼為底擴充，保留交易紀錄、平均成本、分檔未實現損益、移動停利停損、國泰證券 2.8 折試算、三大法人、JSON 備份與版本說明，新增以下三個分頁。

## 1. v1.4 新增分頁

### ETF 長期獲利試算

- 同時勾選 **0050 元大台灣50、009816 凱基台灣TOP50、006208 富邦台50**；每一檔分別輸入：初期投入本金、初始購入價、每月定期定額金額。
- 可增加多筆 **指定第 N 年額外加碼**，為不同 ETF 各自設定。**第 N 年加碼在第 N 週年末投入**。
- 同時計算 **3% / 7% / 10%** 三種**假設**年化報酬情境，提供第 **0～40 年**逐年表格、3 條資產成長曲線、各 ETF 7% 情境明細及下載 CSV。
- 有「配息自動再投入（複利）」勾選。年配息率預設 2%（**僅為可調整的模型假設，不是官方配息資料**）。勾選時每月股息買入追加股數；未勾選時股息成為未計利息的累積現金，仍計入總資產。價格報酬率按假設年化含息總報酬扣除股息率而得，避免股息重複計入。
- 定期定額在每月月底投入；股數允許小數作為計算模型；未包含手續費、交易稅、實際股票拆併股、通膨、折溢價、除息日、報酬率的波動路徑。**相同總報酬假設和相同金額下，不代表哪一檔 ETF 的實際報酬較高。**
- 試算設定跟原股票記錄存在**相同的本機 JSON 備份資料結構**，可以由「下載完整備份」備份與還原。

### 股票行情查詢

- 上市 **TWSE**／上櫃 **TPEx**，依股票代號查官方最新**盤後快照**：**開盤、最高、最低、收盤、成交股數／金額**。
- **當沖**：若官方來源可正確確認個股當沖成交股數，顯示官方數量與占比；資料缺漏或欄位不合時顯示「—」，**不會用市場整體當沖占比冒充單一股票當沖**。
- **三大法人**：連結現有 v1.3 官方三大法人資料，顯示外資、投信、自營商、合計買賣超及**各自資料日**。如果法人日與行情日不同，會顯示日期不一致警告。
- 最新行情透過 GitHub Actions 定期抓取存成 **`data/market/latest.json`**。TWSE 與 TPEx 當日發布時間可能不同；顯示各市場獨立日期。
- **不是即時報價**；不會把公開快照寫回使用者的交易成本、個股參考價格或移動停損線。

### 主動式 ETF 查詢與持股異動

- 輸入主動式 ETF 代號，查看 ETF 本身的最新盤後行情、成交股數、當沖、三大法人欄位（資料日各自標示）。
- 下載發行投信**官方完整 PCF／持股投資組合**後，整理成 CSV 並在此分頁上傳**兩個不同日期的快照**，比較：**新增、加碼、減碼、清倉、權重上升／下降**。
- 必須確認兩份清單**完整**才計算異動及清倉；若只上傳前十名、資料缺漏、只有一個日期，則顯示資料不足，**絕不把抓取失敗視為清倉**。
- 有「股數」會按股數比較；若只有「權重」而缺股數，僅能辨識權重變化，不推定真實加減碼股數。這是持股快照差異，非基金經理人的實際成交明細。
- **預設沒有接入各投信每天的 PCF 自動來源**：發行投信的 CSV／HTML 格式不一，目前沒有經實際端到端驗證的共通介面，因此本版優先提供**本機 CSV 匯入與比較功能**。可選用 `data/active-etf/sources.json` 設定經人工確認為公開、完整、含日期的官方 CSV 來源，配合 `scripts/update_active_etf.py` 排程抓取；未設定時不會假裝已自動更新。
- 本機匯入的 PCF 快照保存在**目前瀏覽器的另一份 localStorage**（鍵 `trade-compass-active-etf-snapshots-v1`），請使用該分頁「備份持股快照」另外匯出 JSON，換裝置後點「還原快照 JSON」匯入。這一項**不包含**在主網站交易紀錄 JSON 備份之內。更換電腦或清除瀏覽器資料，這些本機快照會遺失；請妥善備份。

## 2. 安裝／升級 GitHub Pages（保留原網站網址）

### 重要！先備份

1. 先登入原網站，在左側「資料匯入與備份」→「下載完整備份」取得交易紀錄 JSON。
2. 若 v1.4 有曾匯入主動 ETF PCF，另至「主動式 ETF 持股異動」→「備份持股快照」匯出第二個 JSON。
3. **不要**將個人交易 JSON 備份與自行整理的私人檔案上傳到公開 GitHub。

### 上傳完整檔案（不是只上傳 index.html）

將本 ZIP 解壓縮，依照目錄結構上傳至既有 GitHub Repository：

- **原始專案**：[GitHub stock-tracker](https://github.com/tony71015-sudo/stock-tracker)
- **保留路徑**：`index.html`、`institutional.js`、`institutional.css`、`etf_simulator.js`、`market.js`、`active_etf.js`、`tools.css`、`scripts/`、`data/`、`.github/workflows/update-institutions.yml`。
- 可使用 GitHub Desktop `Clone repository → 將解壓縮後的檔案複製到專案資料夾 → Commit → Push origin`；或 GitHub 網頁上傳，各檔案與隱藏資料夾 `.github/` 必須保留正確路徑。
- **不要**在專案裡再包一層 `Trade_Compass_v1.4/` 目錄。`index.html` 必須在 Repo 最上層。

### GitHub Pages 設定

進入 `Settings → Pages → Build and deployment → Source`，選擇 **GitHub Actions**（如 v1.3 已設好不用重設）。

至 `Actions → 更新三大法人、股票行情並發布網站 → Run workflow`，第一次選 `bootstrap`；等工作流程完成，再開原網址：

**https://tony71015-sudo.github.io/stock-tracker/**

GitHub Actions 在週一至週五臺灣時間 **20:35、22:35** 嘗試更新並重新部署。排程可能延遲、停跑，官方來源也可能暫停服務或變更欄位。

- 上市上櫃盤後報價來源會收集**最新一個已公開交易日**，不是任意歷史日期。若需逐日歷史紀錄，需另擴充回補機制。
- 三大法人 5／10／20／60 日資料由 v1.3 的歷史日報機制提供；當交易日資料不足時，網站會如實標示。
- 首次部署之前 `data/market/latest.json` 和 `data/active-etf/latest.json` 刻意為**空值**，不是示例行情；若 Action 讀取官方 API 失敗，頁面會顯示資料不足與警告。
- 官方網頁／OpenAPI 可能對 GitHub Runner 來源 IP 或連線頻率限制，請以 Actions 執行記錄為最後確認；**本製作環境沒有對官方資料 API 的實際網路測試能力**。

## 3. GitHub Pages 檔案配置

```text
stock-tracker/
├── index.html                      原本完整應用（v1.4）
├── institutional.js               原有法人模組
├── institutional.css
├── etf_simulator.js                ETF 0～40 年投資試算與圖表
├── market.js                       官方盤後個股查詢
├── active_etf.js                   主動 ETF 快照匯入／異動比較
├── tools.css                       三個新分頁的樣式
├── scripts/
│   ├── update_institutions.py      v1.3 三大法人資料收集
│   ├── update_market.py            v1.4 開高低收、當沖資料
│   └── update_active_etf.py        v1.4 可選：已配置的官方 CSV PCF
├── data/
│   ├── institutional/              法人資料（GitHub Actions 自動增補）
│   ├── market/latest.json          最新市場盤後行情
│   └── active-etf/
│       ├── latest.json             可選：公開基金持股快照
│       └── sources.json            官方 CSV 來源配置，預設空
├── .github/workflows/
│   └── update-institutions.yml     整合官方資料抓取＋發布
└── tests/                          離線測試
```

## 4. 官方來源與口徑

- 臺灣證券交易所 [官方 OpenAPI](https://openapi.twse.com.tw/)：`/v1/exchangeReport/STOCK_DAY_ALL`、上市當沖報表 `/exchangeReport/TWTB4U`
- [櫃買中心官方 OpenAPI](https://www.tpex.org.tw/openapi/)：`/v1/tpex_mainboard_daily_close_quotes`、`/v1/tpex_intraday_trading_statistics`
- [臺灣證券交易所三大法人](https://www.twse.com.tw/zh/trading/foreign/t86.html)、[櫃買中心三大法人](https://www.tpex.org.tw/zh-tw/mainboard/trading/major-institutional/detail/day.html)
- ETF PCF：以**各投信官網**每日完整投資組合（申購買回清單）為準；證交所 [ETF商品資訊](https://www.twse.com.tw/zh/products/securities/etf/news.html) 可協助尋找來源。

**本版已完成本機單元與瀏覽器交互測試；未在使用者 GitHub 帳號直接部署，也尚未在 GitHub Actions 主機實測全部官方端點**。如官方欄位變更，抓取程式會保留缺值而不填假數字，需要依官方最新欄位規格調整。

## 5. 開發者測試

```bash
python -m unittest discover -s tests -v
python scripts/update_institutions.py --mode bootstrap
python scripts/update_market.py
python scripts/update_active_etf.py
```

測試腳本使用人工夾具資料驗證解析，正式部署 ZIP 的公開 JSON 不含虛構報價。JS 模組不需要 npm，也不需要付費主機或後端資料庫。
