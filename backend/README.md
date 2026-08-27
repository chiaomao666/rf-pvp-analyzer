# RF PVP Analyzer 獨立後端

本目錄提供可脫離 Manus 的 **Cloudflare Workers + D1** 後端。GitHub 只保存原始碼並執行部署工作流程；API 由 Cloudflare Worker 執行，戰績事件由 D1 持久化保存。GitHub Pages 不會執行這個後端，也不需要把 `wrangler.toml` 或 API key 提交到 repository。

## API 契約

| 方法 | 路徑 | 用途 | 認證 |
| --- | --- | --- | --- |
| `POST` | `/api/pvp/login` | 網站密碼登入並建立 HttpOnly session | 網站密碼 |
| `POST` | `/api/pvp/logout` | 清除網站 session | session（可重複呼叫） |
| `GET` | `/api/pvp/session` | 查詢目前登入狀態 | HttpOnly session |
| `POST` | `/api/pvp/password` | 變更網站登入密碼並讓既有 session 失效 | HttpOnly session、目前網站密碼與 `PVP_ADMIN_PASSWORD` |
| `GET` | `/api/pvp/health` | Worker／D1 健康檢查 | HttpOnly session |
| `POST` | `/api/pvp/capture` | 接收最小化 5v5 戰績摘要 | `X-RF-Write-Secret` |
| `GET` | `/api/pvp/events?workspaceId=<official-user-id>&after=<cursor>` | 讀取指定工作區的新事件 | HttpOnly session，並依 workspace 隔離 |

後端只接受 `type=match`、官方 `user_id` 工作區與白名單戰績欄位。它不接受或保存遊戲密碼、`user_token`、cookie、完整 WebSocket frame 或任意原始封包。相同來源鍵會去重，事件只會回傳給相同 `workspaceId` 的工作區。

## 第一次 Cloudflare 設定

先安裝 [Node.js 22+](https://nodejs.org/)，登入 Cloudflare，並在本目錄執行：

```
cd backend
npm install --global wrangler@latest
npx wrangler login
npx wrangler whoami
copy wrangler.toml.example wrangler.toml
```

執行 D1 建立指令：

```
npx wrangler d1 create rf-pvp-analyzer
```

把輸出的 `database_id` 填入本機 `wrangler.toml` 的 `database_id`，並填入 `account_id`。把 `ALLOWED_ORIGINS` 設為完整的 GitHub Pages origin，例如 `https://chiaomao666.github.io`；不要加 repository 子路徑、不要在尾端加斜線 。`wrangler.toml` 已被 `.gitignore` 排除，禁止提交真實 account ID 或其他私密設定。

建立四個 Cloudflare Worker secrets。網站密碼與管理者密碼都由你自行設定；寫入密鑰與 session secret 請使用隨機長字串。四者都不要提交到 GitHub：

```powershell
# 產生隨機寫入密鑰／session secret；網站密碼請自行設定並安全保存
$b=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $k=[Convert]::ToHexString($b).ToLower(); $k
```

```powershell
npx wrangler secret put PVP_SITE_PASSWORD --config wrangler.toml
npx wrangler secret put PVP_ADMIN_PASSWORD --config wrangler.toml
npx wrangler secret put PVP_SESSION_SECRET --config wrangler.toml
npx wrangler secret put PVP_WRITE_SECRET --config wrangler.toml
```

`PVP_SITE_PASSWORD` 是第一次啟用與緊急復原用的網站登入密碼；`PVP_ADMIN_PASSWORD` 是只有網站管理者知道的管理密碼，絕不可分發給一般戰績使用者；`PVP_WRITE_SECRET` 只放在 mod 設定檔；`PVP_SESSION_SECRET` 只放在 Worker，用來簽署 HttpOnly session。

### 日後在網站內變更登入密碼

完成本文件的初次部署後，先用 `PVP_SITE_PASSWORD` 登入 GitHub Pages 的「帳號工作區 → 網站後端」。登入後會出現「變更網站登入密碼」控制區。填入 `PVP_ADMIN_PASSWORD`、目前網站密碼與新網站密碼，即可完成變更；新密碼至少 12 個字元。Worker 會在 D1 寫入每次變更專屬 salt 與 PBKDF2 verifier，不會儲存明文密碼，也不會回傳 verifier。

密碼變更完成後，Worker 會立即讓所有既有網站 session 失效，因此必須以新網站密碼重新登入。此後一般登入會優先驗證 D1 verifier，無須每次都進入 Cloudflare 改 `PVP_SITE_PASSWORD`。請保留 `PVP_SITE_PASSWORD` 作為 D1 資料庫遺失、清空或需要重建密碼設定時的緊急復原憑證；不要在網站 UI、GitHub、mod 或對話中洩露 `PVP_ADMIN_PASSWORD`、`PVP_SESSION_SECRET` 或 `PVP_WRITE_SECRET`。

先在 Cloudflare D1 套用 migration，再部署 Worker：

```
npx wrangler d1 migrations apply rf-pvp-analyzer --remote --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

部署後記下 Worker 網址，通常類似：

```
https://rf-pvp-analyzer-api.<你的-subdomain>.workers.dev
```

驗證網站登入與未登入拒絕：

```powershell
curl.exe -i https://rf-pvp-analyzer-api.<你的-subdomain>.workers.dev/api/pvp/health
curl.exe -i -c cookies.txt -H "Content-Type: application/json" -d "{\"password\":\"<你的網站密碼>\"}" https://rf-pvp-analyzer-api.<你的-subdomain>.workers.dev/api/pvp/login
curl.exe -i -b cookies.txt https://rf-pvp-analyzer-api.<你的-subdomain>.workers.dev/api/pvp/health
```

第一個請求應為 `401`；登入後的請求應看到 `{\"ok\":true,\"durable\":true}`。第一筆 capture 建議使用不含真實帳號的測試資料，確認 D1 migration、寫入密鑰與 CORS 都正常後，再讓 mod 使用。

## GitHub Actions 自動部署

repository 不需要提交 `backend/wrangler.toml`。請在 GitHub repository 的 **Settings → Secrets and variables → Actions** 建立下列設定：

| 類型 | 名稱 | 內容 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare API Token；需具備 Workers 編輯與 D1 編輯權限 |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| Variable | `PVP_D1_DATABASE_ID` | `wrangler d1 create` 回傳的 D1 database ID |
| Variable | `PVP_API_ORIGIN` | Pages origin，例如 `https://chiaomao666.github.io` |

請確認 **Settings → Actions → General** 允許 Actions 執行 。`.github/workflows/deploy-backend.yml` 會在每次 `main` 分支的後端或部署設定變更時：從範本產生暫存 `wrangler.toml`、執行遠端 D1 migrations，再部署 Worker。真實 key 不會被寫入 repository；`PVP_SITE_PASSWORD`、`PVP_ADMIN_PASSWORD`、`PVP_SESSION_SECRET` 與 `PVP_WRITE_SECRET` 必須先以 `wrangler secret put` 設定在 Worker 上。

若 workflow 顯示找不到 D1，通常是 `PVP_D1_DATABASE_ID` 錯誤、database 尚未建立，或 API Token 權限不足。可先用本機 `wrangler whoami`、`wrangler d1 list` 與上方手動 migration 指令逐項檢查。

## GitHub Pages 前端設定

Pages workflow 會讀取 repository variable `PVP_BACKEND_ORIGIN`，並在 `pnpm build` 時注入 `VITE_PVP_BACKEND_ORIGIN`。請建立：

| 類型 | 名稱 | 內容 |
| --- | --- | --- |
| Variable | `PVP_BACKEND_ORIGIN` | Worker origin，例如 `https://rf-pvp-analyzer-api.<你的-subdomain>.workers.dev` |

這個值只填 origin ，不要加 `/api/pvp`，也不要加尾端斜線。重新推送 `main` 或在 Pages workflow 使用 **Run workflow** 後，前端的「Remote Backend」模式才會使用新 Worker。未設定時，前端會明確顯示尚未設定網站後端，不會回退到 Manus 網址。API key 不可放入 `PVP_BACKEND_ORIGIN`、GitHub Actions variable、repository 或 Pages bundle；請在 Pages 的「帳號工作區 → 網站後端」欄位於瀏覽器本機輸入，前端只保存於該瀏覽器的 localStorage。

## mod 設定

請將範本 `bridge/mods/rf_pvp_backend_config.example.js` 複製為 `assets/mods/rf_pvp_backend_config.js`，並只在該**私人的本機設定檔**填入 endpoint 與 `PVP_WRITE_SECRET`。實際檔名已由 `.gitignore` 排除，GitHub 只保留不含真實密鑰的 `.example.js` 範本：

```
const WORKER_ORIGIN = "https://rf-pvp-analyzer-api.<你的-subdomain>.workers.dev";
const WRITE_SECRET = "只放在你自己的瀏覽器 mod 設定";
```

`rf_mod_loader.js` 會先載入 `./mods/rf_pvp_backend_config.js`，再載入 `pvp_double_match_guard.js`；守衛會一次性取用設定並立即移除暫時的全域取用函式。舊版設定檔仍可使用，但守衛會在啟動時清除舊版 `window.RF_PVP_WRITE_SECRET`，讓明文密鑰不會持續暴露在 `window`。這些相對網址由 `assets/index.html` 解析，實際檔案固定在 `assets/mods/`，不需要修改 loader。守衛只有在官方 `player medals` 結果證據存在、5v5 聚合完成且來源鍵尚未傳送時才 POST。health heartbeat 只呼叫 `/api/pvp/health`，不傳送遊戲資料；連線失敗時會退避重連且不阻塞遊戲。完整載入順序與本機 bridge fallback 請參閱 [`../bridge/README.md`](../bridge/README.md)。

## 安全與限制

Worker 現在採 **fail-closed**：網站 session secrets 未設定或 session 無效時，health 與 events 回應 `401`；`PVP_WRITE_SECRET` 未設定或請求沒有完全相同的 `X-RF-Write-Secret` 時，capture 回應 `401`；`ALLOWED_ORIGINS` 未列出的瀏覽器 origin 不會取得可用的 CORS 回應。CORS 只是一層瀏覽器限制，不是 IP 防火牆，因此不要把 API key 視為不可破解的公開服務認證。

網站密碼不會寫入 GitHub 或前端 bundle；登入後只使用 Worker 簽發的 HttpOnly、Secure、SameSite=None、Partitioned session。網站端變更密碼時，前端只在本次 HTTPS 請求記憶體中持有輸入值，請求完成即清除，不寫入 IndexedDB 或 localStorage。由於 GitHub Pages 與 `workers.dev` 屬於跨 site，`Partitioned` 可讓 Chromium 將 cookie 限定給目前 GitHub Pages top-level site，避免一般第三方 cookie 限制導致「登入成功但後續 `/session`、`/health` 仍是 401」。前端仍須維持 `fetch(..., { credentials: "include" })`，而 Worker 的 `ALLOWED_ORIGINS` 必須是精確的 Pages origin。`PVP_ADMIN_PASSWORD` 僅供管理頁變更登入密碼，不能取代網站登入或 mod 寫入驗證。`PVP_WRITE_SECRET` 會出現在 mod 設定檔，因此只應分發給可信任的寫入端，不要把它當成網站登入密碼。多人使用時仍應加入速率限制、密碼輪替，或改用 Cloudflare Access／Zero Trust。Worker 目前不宣稱能依 IP 提供可靠的使用者隔離；若要限制 IP，應在 Cloudflare WAF／防火牆規則另行設定。

D1 是正式持久化資料庫；刪除 database、migration 或 Worker 前請先備份。Cloudflare Worker 及 D1 由使用者自己的 Cloudflare 帳號管理，與 Manus 執行期、Manus OAuth、Manus database 完全無關。

## 參考文件

- [Cloudflare Workers GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

- [Cloudflare API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)

- [GitHub Actions secrets and variables](https://docs.github.com/actions/security-guides/using-secrets-in-github-actions)
