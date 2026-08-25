# 參考登入流程調查

調查日期：2026-08-25

## 來源

- 介面頁：<https://xiaiyu0028.github.io/RF_site/pages/query.html>
- 共用前端程式：<https://xiaiyu0028.github.io/RF_site/js/app.js>

## 已確認觀測

參考頁提供 Email、密碼、風險確認核取方塊、「登入並查詢」與「使用示範模式」控制項。頁面明確警告第三方輸入密碼、隱私與服務條款風險，並表示因 CORS 限制，瀏覽器直接連接遊戲伺服器可能失敗。

目前可讀取的 `app.js` 僅提供通用 `fetchAPI`、`loadJSON`、`localStorage` 包裝與介面工具；其中沒有帳號登入端點、帳號存在查詢端點、認證權杖處理或戰績歷史載入實作。因此不得據此假定存在可安全使用的公開帳號查詢 API。

## 對本專案的初步意義

本專案不應模仿參考頁要求輸入遊戲密碼。較安全的可行設計是使用「遊戲帳號／角色識別字」作為本機資料工作區的名稱，並只在已確認公開且具 CORS 支援的官方查詢端點存在時，進行無密碼的帳號存在驗證。帳號與 PVP JSON 的綁定可由 IndexedDB 的 `profileId` 完成；這是同一瀏覽器與同一網域內的資料分區，並非官方帳戶同步。

## 原始主程式與端點預檢補充

- 從本機保存的未修改官方主程式讀得登入使用 `POST /api/users/log_in`，請求內容為 `application/x-www-form-urlencoded`；公開前端設定含 `locale=zh_TW`、`app_version=2.28` 與 `key`。成功登入流程會讀取 `user_id` 與 `user_token` 後建立 WebSocket。
- 2026-08-25 的 CLI 預檢回傳 Cloudflare HTTP 403，且沒有 `Access-Control-Allow-Origin`；該請求並未完全模擬官方前端的表單格式，不能單獨用於判定瀏覽器登入可行性。
- 同日從 Pages origin `https://chiaomao666.github.io/rf-pvp-analyzer/` 以官方前端的 `application/x-www-form-urlencoded` 格式與公開 `locale`、`app_version`、`key` 發出**無帳密**瀏覽器 `fetch`。請求可讀取 HTTP `500`／`"Internal Server Error"` 回應，證實該表單格式未被瀏覽器 CORS 阻擋；缺少 Email 與密碼時不得將 500 視為登入成功或帳號不存在。
- 結論：可實作前端登入流程及其明確錯誤提示，但在未由使用者親自輸入認證資料的情況下，不能驗證有效帳號的成功回應。密碼與 `user_token` 必須只存在於當次請求／記憶體中。
- 官方 `doLogin` 在收到 `status: "ok"` 時只取用 `data.user_id` 與短期 `data.user_token`，並在後續個人資料載入使用兩者；登入畫面狀態本身會清除帳號與密碼欄位。帳號工作區應只保存成功回傳的 `user_id`，不得保存密碼或 `user_token`。

## 2026-08-25 實作界線

- 分析站已使用官方回應的 `user_id` 建立 `official:<user_id>` 本機工作區；成功登入後才會選取該工作區。密碼只用於當次 `application/x-www-form-urlencoded` 請求，`user_token` 僅存在執行中記憶體，兩者均不會寫入 IndexedDB、localStorage、完整備份或專案檔案。
- 本機資料庫升級為 profile 分區。戰績、匯入批次、統計、單筆讀取、刪除、備份與還原皆只讀寫目前工作區；直接以其他帳號的詳情 ID 存取會得到不存在結果。
- 舊版未分區資料不會自動歸屬到第一個登入帳號。登入後必須由使用者在帳號頁明確確認，才會將未綁定戰績與匯入歷程轉移到目前帳號。
- 一般 JSON 如含有可辨識的 `user_id`／`userId`／`player_id`／`playerId` 且與目前帳號不同，會拒絕匯入；若 JSON 沒有所有者識別，仍可由使用者選擇綁定到目前工作區，但介面會明示無法證明來源帳號。
- 完整備份新增 `local-backup-v2` 及 profile metadata；v2 只能在相符的帳號工作區還原。舊 `local-backup-v1` 仍可還原，以支援既有備份遷移。
- 尚未發現並驗證可安全呼叫的官方排名戰歷史查詢通道。因此登入功能只確認帳號、建立本機工作區，不會宣稱已載入遠端 PVP 歷史；歷史資料仍由守衛 JSON 或手動建立提供。
- 官方登入成功後可確認連線端點與 player channel 的存在；然而本次沒有以使用者認證資料發送或重放 WebSocket join／握手封包，也沒有把其參數形狀視為已驗證契約。因此本專案不實作 WebSocket 歷史查詢，並將遠端歷史載入保留為未驗證範圍。

## 2026-08-25 medals-only 擷取界線

- 使用者提供的實際開發者工具畫面顯示，登入後的 `player:<user_id>` Phoenix channel `phx_reply` 會在 `response` 內提供 `medals` 陣列，且同一回覆也可能含有排名、積分、聯盟等其他欄位。
- 分析站僅在本次官方登入成功、`user_token` 仍存在於記憶體時，加入對應 `player:<user_id>` channel 並發出唯一的 `medals` 事件。程式只從成功回覆擷取 `response.medals`，不保存同一回覆的排名、積分、聯盟或其他 player 欄位；取得完成後會關閉連線。
- Token 仍不會寫入 IndexedDB、localStorage、可攜備份或程式碼。重新載入、登出或切換既有工作區均會清除記憶體 token，因此使用者必須重新登入才能重新取得 medals。
- 本輪只以測試訊框模擬驗證連線序列與資料最小化，沒有使用任何真實帳號、密碼或 token 測試遠端 WebSocket；若 Cloudflare、CORS 或網路限制阻斷連線，介面會保留已確認的本機工作區並顯示連線未完成，而不會把它誤判為帳密錯誤。

## 參考頁 `query.html` 第 229 行後的比對結果

- 參考頁的 `attemptLogin` 先以 `httpLogin` 對同一官方 `users/log_in` 端點作瀏覽器 `fetch`；程式未設定不同的 CORS 策略、未使用代理、也沒有伺服器端轉送。因此它**沒有繞過 GitHub Pages 的 CORS 政策**；HTTP 失敗只會回傳「HTTP 請求失敗」並顯示通用錯誤畫面。
- 登入成功後，參考頁才以回傳的 token 建立 `player:<user_id>` Phoenix channel 並送出 `phx_join`。它的通用 `sendApiRequest` 能送任意 player event；後續 `fetchAllData` 依序查詢 `actors`、`backpack` 與 `used_recruit_coupons`，而不是 `medals`。
- 因此參考頁的 player channel 格式可作為既有 medals-only 實作的交叉比對；但其 CORS 處理不可作為修正方案，且其角色／背包／抽獎查詢不會納入本專案，以維持使用者要求的資料最小化。

## CORS 阻擋後的登入架構比較

| 架構 | 是否可讓 GitHub Pages 直接登入 | 認證資料的處理邊界 | 部署與安全前提 | 本專案結論 |
| --- | --- | --- | --- | --- |
| 官方允許指定 Pages origin 的 CORS | 可以 | 密碼只由使用者瀏覽器送往官方；token 只存在頁面記憶體 | 官方必須對 `https://chiaomao666.github.io` 加入正確的 CORS header，並維持正式 HTTPS endpoint | **最適合**；不用增加中介服務，也保有目前的資料最小化設計 |
| 使用者自行執行的本機代理 | 可以，但僅限該使用者的本機環境 | 密碼從瀏覽器送至 `localhost`，再由代理送往官方；代理不得記錄 request body／header／token | 使用者自行安裝、啟動與信任程式；代理需只允許官方固定網域、限制方法與路徑，且禁用日誌 | 可作為個人技術方案；**不能**由靜態 GitHub Pages 自行提供或自動啟動 |
| 不保存認證的受管後端轉送 | 技術上可以 | 密碼仍必須暫時通過後端；不得寫入資料庫、日誌、分析工具或快取，token 也不得回存 | 需有可維運 HTTPS 後端、嚴格 origin allowlist、速率限制、請求內容遮罩與安全稽核；GitHub Pages 本身無法承載 | 不建議在未取得官方書面整合授權與安全審查前啟用；即使不保存，後端仍擴大信任與風險邊界 |

目前公開站已確認官方登入 endpoint 對 Pages origin 缺少允許 header。前端會將 fetch 拒絕與逾時歸類為 CORS／網路／Cloudflare 類錯誤，清空密碼並結束送出狀態；它不能、也不應嘗試以瀏覽器端技巧繞過 CORS。
