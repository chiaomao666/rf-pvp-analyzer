# RF PVP Analyzer 獨立後端

本目錄提供可脫離 Manus 的 **Cloudflare Workers + D1** 後端。GitHub 只保存原始碼並執行部署工作流程；API 由 Cloudflare Worker 執行，戰績事件由 D1 持久化保存。GitHub Pages 不會執行這個後端，也不需要把 `wrangler.toml` 或 API key 提交到 repository。

## API 契約

| 方法 | 路徑 | 用途 | 認證 |
| --- | --- | --- | --- |
| `GET` | `/api/pvp/health` | Worker／D1 健康檢查 | 不需要 |
| `POST` | `/api/pvp/capture` | 接收最小化 5v5 戰績摘要 | `X-RF-API-Key` |
| `GET` | `/api/pvp/events?workspaceId=<official-user-id>&after=<cursor>` | 讀取指定工作區的新事件 | 目前為公開讀取，依 workspace 隔離 |

後端只接受 `type=match`、官方 `user_id` 工作區與白名單戰績欄位。它不接受或保存遊戲密碼、`user_token`、cookie、完整 WebSocket frame 或任意原始封包。相同來源鍵會去重，事件只會回傳給相同 `workspaceId` 的工作區。

## 第一次 Cloudflare 設定

先安裝 [Node.js 22+](https://nodejs.org/)，登入 Cloudflare，並在本目錄執行：

```powershell
cd backend
npm install --global wrangler@latest
npx wrangler login
npx wrangler whoami
copy wrangler.toml.example wrangler.toml
```

執行 D1 建立指令：

```powershell
npx wrangler d1 create rf-pvp-analyzer
```

把輸出的 `database_id` 填入本機 `wrangler.toml` 的 `database_id`，並填入 `account_id`。把 `ALLOWED_ORIGINS` 設為完整的 GitHub Pages origin，例如 `https://chiaomao666.github.io`；不要加 repository 子路徑、不要在尾端加斜線。`wrangler.toml` 已被 `.gitignore` 排除，禁止提交真實 account ID 或其他私密設定。

建立 Worker API key。請使用隨機長字串，並只保存於 Cloudflare secret 與你自己的本機 mod 設定：

```powershell
$key = [Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
$key | npx wrangler secret put PVP_API_KEY --config wrangler.toml
```

先在 Cloudflare D1 套用 migration，再部署 Worker：

```powershell
npx wrangler d1 migrations apply rf-pvp-analyzer --remote --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

部署後記下 Worker 網址，通常類似：

```text
https://rf-pvp-analyzer-api.<你的-subdomain>.workers.dev
```

驗證健康檢查：

```powershell
curl.exe https://rf-pvp-analyzer-api.<你的-subdomain>.workers.dev/api/pvp/health
```

應看到 `ok: true`。第一筆 capture 建議使用不含真實帳號的測試資料，確認 D1 migration、API key 與 CORS 都正常後，再讓 mod 使用。

## GitHub Actions 自動部署

repository 不需要提交 `backend/wrangler.toml`。請在 GitHub repository 的 **Settings → Secrets and variables → Actions** 建立下列設定：

| 類型 | 名稱 | 內容 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare API Token；需具備 Workers 編輯與 D1 編輯權限 |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| Variable | `PVP_D1_DATABASE_ID` | `wrangler d1 create` 回傳的 D1 database ID |
| Variable | `PVP_API_ORIGIN` | Pages origin，例如 `https://chiaomao666.github.io` |

請確認 **Settings → Actions → General** 允許 Actions 執行。`.github/workflows/deploy-backend.yml` 會在每次 `main` 分支的後端或部署設定變更時：從範本產生暫存 `wrangler.toml`、執行遠端 D1 migrations，再部署 Worker。真實 key 不會被寫入 repository；`PVP_API_KEY` 必須先以 `wrangler secret put` 設定在 Worker 上。

若 workflow 顯示找不到 D1，通常是 `PVP_D1_DATABASE_ID` 錯誤、database 尚未建立，或 API Token 權限不足。可先用本機 `wrangler whoami`、`wrangler d1 list` 與上方手動 migration 指令逐項檢查。

## GitHub Pages 前端設定

Pages workflow 會讀取 repository variable `PVP_BACKEND_ORIGIN`，並在 `pnpm build` 時注入 `VITE_PVP_BACKEND_ORIGIN`。請建立：

| 類型 | 名稱 | 內容 |
| --- | --- | --- |
| Variable | `PVP_BACKEND_ORIGIN` | Worker origin，例如 `https://rf-pvp-analyzer-api.<你的-subdomain>.workers.dev` |

這個值只填 origin，不要加 `/api/pvp`，也不要加尾端斜線。重新推送 `main` 或在 Pages workflow 使用 **Run workflow** 後，前端的「Remote Backend」模式才會使用新 Worker。未設定時，前端會明確顯示尚未設定網站後端，不會回退到 Manus 網址。

## mod 設定

請將 `mods/TOOLS/rf_pvp_backend_config.js` 放在 loader 同層的 `TOOLS/` 資料夾，並只在該檔案設定 endpoint 與 API key：

```js
window.RF_PVP_BACKEND_ENDPOINT = "https://rf-pvp-analyzer-api.<你的-subdomain>.workers.dev/api/pvp/capture";
window.RF_PVP_API_KEY = "只放在你自己的瀏覽器 mod 設定";
```

`rf_mod_loader.js` 會先載入 `./mods/TOOLS/rf_pvp_backend_config.js`，再載入 `pvp_double_match_guard.js`，不需要修改 loader。守衛只有在官方 `player medals` 結果證據存在、5v5 聚合完成且來源鍵尚未傳送時才 POST。health heartbeat 只呼叫 `/api/pvp/health`，不傳送遊戲資料；連線失敗時會退避重連且不阻塞遊戲。完整載入順序與本機 bridge fallback 請參閱 [`../bridge/README.md`](../bridge/README.md)。

## 安全與限制

API key 放在 mod 端代表使用者可在瀏覽器中查看它，因此它適合個人或小範圍自用，不應視為不可破解的公開服務認證。不要把 key 寫入 GitHub、截圖或公開網站。若要多人使用，應改用每裝置短期 token、受信任的本機代理，或另行加入更嚴格的認證與速率限制。

D1 是正式持久化資料庫；刪除 database、migration 或 Worker 前請先備份。Cloudflare Worker 及 D1 由使用者自己的 Cloudflare 帳號管理，與 Manus 執行期、Manus OAuth、Manus database 完全無關。

## 參考文件

- [Cloudflare Workers GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [GitHub Actions secrets and variables](https://docs.github.com/actions/security-guides/using-secrets-in-github-actions)
