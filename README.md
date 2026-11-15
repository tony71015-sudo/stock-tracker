# Trade Compass 指數型 ETF 持股抓取除錯補丁 v2

## 真正找到的原因

舊版會從三個網站抓取一般 HTML `<table>` 並硬性要求每檔至少 40 檔股票。這會失敗：

1. 006208 富邦投信基金資產頁應優先讀取 `/FubonETF/Trade/Assets.aspx`，明確解析「股票代碼、股數、權重」欄位。部分官方完整基金資產快照可能不到 40 檔，因此只在「006208＋官方完整股票表＋股票權重合計合理」時容許 25 檔以上。
2. 0050 元大官方頁多為 div/JS 呈現，未展開可能只有前五大持股；不能把它當成完整持股。
3. 009816 凱基官網直接可讀的部分持股不代表完整實際基金持股，不能硬湊出 50 檔。

這份更新採用 **官方優先、MoneyDJ 全部持股可選備援**。第三方快照會在 `sourceType` 寫上 `third_party`、`sourceQuality` 寫上 `third_party_full_portfolio_structural_check`；不假裝官方逐筆驗證。只有資料日期、股票股數、完整性及權重通過檢查才保存。

## 安裝（替換一個、新增兩個程式與一個工作流程，共四個檔）

- 覆蓋 `scripts/update_index_etf_holdings.py`
- 新增 `scripts/rebuild_index_etf_indexes.py`
- 新增 `scripts/patch_index_etf_validation.py`
- 覆蓋 `.github/workflows/update-index-etf-holdings.yml`

提交到 main 後到 GitHub Actions 選「更新指數型ETF持股（來源診斷與安全累積版）」並 Run workflow。預設可使用第三方備援；若不希望使用第三方可將 `allow_third_party=false`。

## 重要規則

- GitHub 工作流程即使三檔都抓不到仍可生成 `capture-status`，**綠色成功代表診斷完成，不代表已保存持股**。
- 若抓取成功，GitHub 會新增 `data/index-etf/history/<ETF>/<日期>.json` 和 `data/index-etf/indexes/<ETF>.json`。
- `data/index-etf/capture-status/0050.json`、`006208.json`、`009816.json` 記錄每個來源的詳細錯誤，可在 Actions 下方 summary 查看。
- 兩個不同的實際持股日期才能進行雙日期比較。
- 富邦 006208 可從官方頁面帶入歷史日期 `ddate` 回補最近幾日。其他兩檔歷史日期能否取得仍以來源揭露為準。
- 確保 GitHub Pages 的部署流程包含 `data/index-etf/history`、`data/index-etf/indexes`；不然 GitHub 有資料但網頁仍是「未有資料」。
- 本更新未更動三大法人查詢、主動式 ETF 和報酬試算。
- 代號、股數、權重與來源需再和投信官方核對；持股股數變動可能包含基金申贖，不可直接視為經理人交易。

## 主要來源
- 元大官方：https://www.yuantaetfs.com/product/detail/0050/ratio
- 富邦官方：https://websys.fsit.com.tw/FubonETF/Trade/Assets.aspx?stkId=006208
- 凱基官方：https://www.kgifund.com.tw/Fund/Detail?fundID=J023
- MoneyDJ 全部持股（如使用，標示為第三方）：https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid=0050.TW
