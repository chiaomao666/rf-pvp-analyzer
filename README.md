# RF PVP 戰績分析站

此專案是 **Reversed Front 排名戰紀錄與分析網站**。它以 React、Express、tRPC、Drizzle 與 MySQL 建構，提供匿名瀏覽器裝置資料範圍、手動建檔、JSON 匯入、戰績篩選、列表刪除及排名統計。

> **重要：GitHub 是原始碼託管平台，不是此專案可直接使用的執行環境。** 本站有 Express／tRPC 後端與 MySQL 資料庫，因此不能直接部署至 GitHub Pages。請將本專案推送至 GitHub，再連接支援 Node.js 與 MySQL 的主機；目前的 Manus 網站部署不受本 ZIP 影響。

## 技術需求

| 項目 | 需求 |
| --- | --- |
| Node.js | 22 或更新版本 |
| 套件管理器 | pnpm 10 |
| 資料庫 | MySQL 8 或相容的 TiDB／PlanetScale 類服務 |
| 執行環境 | 可執行常駐 Node.js HTTP 服務的主機 |

## 本機啟動

> **不要直接雙擊 `client/index.html`。** 它是 Vite 的 TypeScript／React 原始入口，不是可離線開啟的 HTML 成品；以 `file:///.../client/index.html` 開啟時沒有 Vite、Express、tRPC API 或資料庫，所以瀏覽器只會顯示空白頁。

### Windows 最簡單方式

先安裝 [Node.js 22+](https://nodejs.org/)，在 PowerShell 執行一次 `corepack enable` 以啟用 pnpm。接著在解壓後的專案根目錄**雙擊 `START_WINDOWS.bat`**。

第一次執行會建立並開啟 `.env`。請填入可連線的 MySQL `DATABASE_URL` 與足夠長的 `JWT_SECRET`，存檔後再雙擊 `START_WINDOWS.bat`。它會安裝套件、套用資料庫結構並啟動伺服器；完成後請在瀏覽器開啟 **http://localhost:3000**，不要開啟 `client/index.html`。

### 手動啟動方式

如不使用 Windows 批次檔，先複製環境範本、填入資料庫連線字串，接著安裝相依套件並建立資料表。

```bash
cp env.template .env
pnpm install --frozen-lockfile
pnpm db:push
pnpm dev
```

開發伺服器預設使用 `http://localhost:3000`。匿名模式會在瀏覽器 `localStorage` 建立裝置識別，因此清除瀏覽器網站資料或改用其他瀏覽器後，將無法看見舊裝置的匿名戰績；請先匯出 JSON 備份。

## 正式部署

在目標平台設定本文件下列必要環境變數後，使用以下指令建立與啟動服務：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm start
```

部署平台通常會提供 `PORT`；程式會優先監聽該值。資料庫結構必須先以 `pnpm db:push` 或等效的 Drizzle migration 流程套用。現有 Manus 資料庫資料、帳戶、工作階段及任何平台密鑰**不包含**在此原始碼套件中，也不會自動移轉到新主機。

## 環境變數

| 變數 | 是否必要 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | MySQL 相容資料庫連線字串。 |
| `JWT_SECRET` | 是 | 保護既有帳戶工作階段的隨機密鑰；即使主要使用匿名模式仍應設定。 |
| `PORT` | 否 | 服務監聽埠；多數主機會自動注入。 |
| `VITE_APP_ID` | 僅保留 Manus OAuth 時 | Manus OAuth 應用程式識別。 |
| `OAUTH_SERVER_URL` | 僅保留 Manus OAuth 時 | Manus OAuth 服務端點。 |
| `OWNER_OPEN_ID` | 否 | Manus 平台擁有者識別。 |
| `BUILT_IN_FORGE_API_URL`、`BUILT_IN_FORGE_API_KEY` | 僅使用 Manus Storage Proxy 時 | Manus 儲存服務代理。 |
| `VITE_ANALYTICS_ENDPOINT`、`VITE_ANALYTICS_WEBSITE_ID` | 否 | 前端分析端點設定。 |

請勿將 `.env`、正式資料庫連線字串、JWT 密鑰或平台 API 金鑰提交到 GitHub。

## 推送至 GitHub

解壓 ZIP 後，在專案根目錄執行：

```bash
git init
git add .
git commit -m "Initial import of RF PVP Analyzer"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<你的儲存庫>.git
git push -u origin main
```

`.gitignore` 已排除 `node_modules`、`.env`、資料庫檔案、Manus 執行期紀錄與本機專案設定；請在推送前再次以 `git status` 確認沒有機密檔案。

## 驗證

```bash
pnpm test
pnpm check
```

目前專案的 Vitest 回歸測試涵蓋匿名裝置資料隔離、建立／匯入／列表／刪除、跨裝置存取限制、匯入去重與排名統計。
