# RF PVP 戰績分析站

此專案是 **Reversed Front 排名戰紀錄與分析網站**的純前端版本。網站由 React 與 Vite 建置，所有戰績、匯入批次與統計資料都只保存於目前瀏覽器的 **IndexedDB**；不需要帳戶、伺服器、MySQL 或任何環境變數，因此可直接部署到 GitHub Pages。

> **資料保存原則：** 資料只屬於「目前瀏覽器 + 目前網站網域」。清除該網站的瀏覽器資料、使用無痕模式、換用其他瀏覽器或改用其他網域，都不會看見原有戰績。每次重要匯入後，請在「匯入資料」頁下載完整 JSON 備份。

## 功能

| 功能 | 純前端行為 |
| --- | --- |
| 手動建立戰績 | 直接寫入本機 IndexedDB。 |
| PVP 守衛 JSON 匯入 | 由瀏覽器解析，支援來源識別去重與更新。 |
| 歷史、篩選、詳情、排名統計 | 全部由本機資料即時計算，不發出資料 API 請求。 |
| 刪除戰績 | 使用頁內確認對話刪除目前瀏覽器的本機資料。 |
| 完整備份／還原 | 匯出所有本機戰績與匯入摘要；可在另一台裝置或 GitHub Pages 網域還原。 |

## 本機啟動

需要 [Node.js 22 或更新版本](https://nodejs.org/) 與 pnpm 10。Windows 使用者先在 PowerShell 執行一次：

```powershell
corepack enable
corepack prepare pnpm@10.4.1 --activate
```

之後解壓專案並雙擊根目錄的 `START_WINDOWS.bat`。它會在首次執行時安裝相依套件並啟動 Vite；請依終端畫面顯示的網址開啟網站，通常是 `http://localhost:5173`。

也可以手動執行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

> **不要直接雙擊 `client/index.html`。** 它是 Vite 的原始入口，不是已建置的網站。若意外以 `file:///.../client/index.html` 開啟，頁面會顯示正確的啟動指引；請改用上方的本機伺服器網址。

## 備份與還原

在舊版網站下載的 `rf-pvp-backup-*.json` 可直接在純前端版的「匯入資料」頁選擇「還原完整備份」。還原前可選擇清除目前本機資料。成功後，請到「戰績歷史」及「總覽」確認筆數、勝敗與排名摘要。

此專案不會把備份上傳至 GitHub、Manus 或第三方服務。備份檔可能含隊伍、對手、排名與原始封包內容，請自行保存並避免公開分享。

## 部署至 GitHub Pages

本專案已包含 `.github/workflows/deploy-pages.yml`。目前預設對應 GitHub 儲存庫名稱 **`rf-pvp-analyzer`**；若你使用不同的儲存庫名稱，請先把 `vite.config.ts` 的 `base` 改為 `/<儲存庫名稱>/`。

建立或使用 GitHub 儲存庫後，在專案根目錄執行：

```powershell
git add .
git commit -m "Convert to static IndexedDB GitHub Pages app"
git push -u origin main
```

接著在 GitHub 儲存庫開啟 **Settings → Pages**，於 **Build and deployment** 將 Source 設成 **GitHub Actions**。推送至 `main` 後，GitHub Actions 會安裝 pnpm、執行 `pnpm build`，並發布 `dist/`。部署完成後，網址通常是：

```text
https://chiaomao666.github.io/rf-pvp-analyzer/
```

網站採用 Hash 路由，因此重新整理 `#/matches`、`#/record` 或 `#/import` 時不會觸發 GitHub Pages 的檔案路徑 404。

## 驗證

```bash
pnpm test
pnpm check
pnpm build
```

目前單元測試涵蓋 PVP JSON 正規化、分批匯入工具、刪除互動與 IndexedDB 完整備份還原（含本機自動編號）。
