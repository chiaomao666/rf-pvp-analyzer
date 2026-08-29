# Project TODO

- [x] 盤點全部 `assets/mods/` mod，先由 `rf_mod_loader.js` 的載入清單反向定位來源，再整理功能、載入順序、相依性、資料邊界與效能注意事項，產出完整架構表。

- [x] 將 PVP 被動 Socket 觀察器從 `rf_mod_loader.js` 拆為獨立 `assets/mods/` mod，載入器只負責順序載入，守衛維持訂閱同一觀察器。

- [x] 交付獨立 Socket 觀察器、載入器與相容守衛後，已以固定 `assets/mods/` 目錄實機確認 Socket 觀察器、訊框計數與 5v5 擷取恢復。

- [x] 稽核 mod 設定檔、載入器與 PVP 守衛對 `PVP_WRITE_SECRET` 的讀取、傳輸、快取與診斷輸出，確認未外洩後再提出必要修正。

- [x] 澄清帳號頁網站登出只會清除瀏覽器 session，不會撤銷 mod 的 `PVP_WRITE_SECRET` 寫入授權，避免誤認正常心跳為登入殘留。

- [x] 診斷已部署 Worker 回傳 `PVP_ADMIN_PASSWORD must be configured` 的 503 問題，確認 Cloudflare Secret 已綁定至正確 Worker 與部署版本。
- [x] 提供不外洩既有密碼的 Cloudflare Dashboard／Wrangler 管理者密碼重設與安全驗證流程。

- [x] 新增僅限已登入 session 使用者的網站端密碼變更功能，將密碼以雜湊保存於 D1，保留 `PVP_SESSION_SECRET` 與 `PVP_WRITE_SECRET` 的 Cloudflare Secret 隔離。

- [x] 新增與一般網站登入密碼分離的 `PVP_ADMIN_PASSWORD` 驗證，避免知道共用網站密碼的使用者變更全域登入設定。
- [x] 為 D1 管理密碼新增 salt、PBKDF2 verifier 與 revision migration，並讓變更後的既有網站 session 立即失效。
- [x] 在帳號頁已登入狀態下新增管理者密碼變更表單，且不將任何密碼或 token 寫入前端儲存。
- [x] 補齊 Worker、前端與部署說明的密碼管理回歸測試並推送 GitHub。
- [x] 提交並推送網站密碼管理變更到 `github/main`，不得提交 `.notes/` 或任何使用者設定檔。
- [x] 確認 GitHub Actions 先套用 D1 migration，再成功部署 GitHub Pages 與 Cloudflare Worker。

- [x] 讓 Worker `/api/pvp/login` 安全區分 `PVP_SITE_PASSWORD` 或 `PVP_SESSION_SECRET` 缺失的設定錯誤與使用者密碼不符，避免兩者皆誤報 401。
- [x] 在最新 Worker 部署後，以使用者目前的網站密碼重新登入，依 HTTP 503／401／200 結果判定 Cloudflare Secret 缺失、密碼不符或登入成功。

- [ ] 在使用者重建 Cloudflare 的 `PVP_SITE_PASSWORD`、`PVP_SESSION_SECRET`、`PVP_WRITE_SECRET` 後，重新對應網站登入密碼與本機 mod 寫入密鑰，並驗證登入與 heartbeat 恢復。

- [ ] 協助使用者在固定的 `assets/mods/rf_pvp_backend_config.js` 填入有效 `PVP_WRITE_SECRET`，並以 v15 安全診斷確認狀態由 placeholder 改為已設定。

- [x] 將固定本機 mod 根目錄 `assets/mods/` 納入載入器、PVP 守衛、文件與錯誤提示規格；設定檔固定為 `assets/mods/rf_pvp_backend_config.js`，不得再假設或提示 `TOOLS/` 子目錄。
- [ ] 在使用者本機以固定 `assets/mods/` 配置替換載入器、守衛與設定檔後，確認守衛顯示正確的寫入密鑰狀態與 heartbeat。

- [x] 將 PVP 守衛的複製同步診斷整合 bridge 狀態、寫入密鑰安全判讀與最近 heartbeat 結果，不顯示任何密鑰內容。
- [ ] 在遊戲端更新 v15 守衛後，以「複製同步診斷」確認 bridge 寫入密鑰狀態與 heartbeat 回應。

- [x] 修正已填寫的 mod PVP 寫入密鑰仍被守衛判定為未設定的問題，區分設定檔未載入、placeholder、空白值與 Worker 拒絕，且不得顯示密鑰內容。
- [ ] 在遊戲端替換載入器與 PVP 守衛後，確認 v14 回報「已設定」或可判讀的安全設定狀態，並完成一次 5v5 上傳驗證。

- [x] 後續凡要求使用者替換、更新或下載 mod 檔案時，均直接以聊天附件交付對應檔案，不只提供文字說明或 GitHub 連結。

- [x] 修正 PVP 守衛在已收到 WebSocket 訊框時未轉交新訊框、未辨識戰鬥且未同步到 Worker 的問題，驗證 endpoint、寫入密鑰與 hook 生命週期。
- [ ] 在遊戲端更新 PVP 守衛後，完成一次 5v5 並確認 mod health heartbeat、完整戰績上傳與 Worker events 均成功。

- [x] 修正 Cloudflare Worker 登入成功後 session cookie 未被後續 `/api/pvp/session`、`/api/pvp/health` 驗證的 401 問題，並驗證跨 GitHub Pages origin 的 credentialed CORS。
- [ ] 在使用者實際 GitHub Pages 瀏覽器完成一次重新登入後，驗證 `/api/pvp/session` 與 `/api/pvp/health` 不再回傳 401，並確認分割 session cookie 被瀏覽器接受。

- [x] 建立以登入使用者為資料邊界的排名戰資料模型與資料庫遷移。
- [x] 建立受保護的戰績新增、查詢、詳情與刪除 API。
- [x] 實作 JSON 匯入驗證、欄位辨識與未辨識原始資料保留機制。
- [x] 建立排名戰總覽儀表板，顯示總場次、勝率、近期戰績與排名趨勢。
- [x] 建立 1v1／3v3 對戰新增表單，保存雙方隊伍、結果與賽前／賽後排名。
- [x] 建立可依模式、結果與日期篩選的戰績歷史頁與單場詳情頁。
- [x] 以深皇家藍、技術網格、尺寸標記與線框實作藍圖風格視覺系統。
- [x] 實作登入、登出與未登入的安全導引。
- [x] 撰寫並執行 API、資料隔離、匯入與統計的 Vitest 測試。
- [x] 進行桌面與手機版視覺驗證，建立交付前檢查點。
- [x] 擴充 PVP 守衛腳本，將可辨識的對戰資料匯出為分析站相容 JSON，並保留原始封包。
- [x] 驗證守衛匯出的 JSON 可被分析站匯入，且不會虛構未收到的隊伍、結果或排名資料。
- [x] 讓 PVP 守衛面板可由標題列拖曳，並在重新整理後恢復使用者最後位置。
- [x] 修正 PVP 守衛在實際 `#/pvpbattle` 戰鬥頁未記錄封包的問題，並以官方原始 PVP 接收流程驗證。
- [x] 依據實際 PVP 匯出 JSON 的封包欄位，修正戰績辨識與雙方隊伍／勝負／排名正規化規則。
- [x] 將同一 `pvp_battle:<id>` 的配對、初始狀態與 `medals` 結束訊框聚合為單一守衛匯出紀錄，並保留每個來源封包。
- [x] 調整匯入驗證：將 `1v1`／`3v3` 視為 PVP 模式標籤，而非強制角色數量，以接收真實封包中的完整雙方陣容。
- [x] 以去識別化的真實封包形狀建立守衛聚合與網站匯入的回歸測試，確認未知結果與排名不會被推測或偽造。
- [x] 分析 2026-08-24T16-04-52.438Z 實際匯出中已有 102 筆封包但 records 仍為 0 的條件差異，修正後以該檔回歸驗證。
- [x] 修正 PVP 守衛面板只顯示攔截異常日誌、未顯示已跨訊框聚合的最近戰績，避免畫面誤導為無紀錄。
- [x] 提高並安全驗證 PVP JSON 匯入大小上限，使含完整 rawEvents 的 102 封包實際匯出可提交、保存與建立戰績。
- [x] 依結果頁實際封包的積分與排名變動建立保守勝負、賽後排名與變化辨識規則，並以新匯出回歸驗證。
- [x] 結果頁封包未含積分與排名數值時，確認不以血量或 DOM 觀測推測，改採官方 player-channel `medals` 回應作為唯一結果依據。
- [x] 擴充載入器與守衛的結果頁封包過濾，保存 player-channel `medals` 回應並以其前後積分與排名正規化勝負、排名及變化。
- [x] 將守衛下載檔名與分析站可見的戰績時間統一為使用者本機時區格式，同時保留原始 ISO／UTC 時間供追溯。
- [x] 更新分析站戰績列表、詳情與匯入後的時間格式，使其一致依使用者本機時區呈現。
- [x] 為分析站本機時區顯示與原始 UTC 保留新增回歸測試。
- [x] 將完整 PVP 原始封包 JSON 的前端與 API 匯入上限提高至 25MB，保留受控的超限拒絕與大小邊界回歸測試。
- [x] 讓同場次後續匯入的官方結果／排名資料可安全回填既有戰績，避免舊紀錄持續顯示待確認與排名空白。
- [x] 對超過 25MB 的守衛 JSON 實作前端自動分批解析與循序匯入，保留每批結果與失敗提示。
- [x] 在 `/matches` 戰績歷史列表加入可確認的直接刪除按鈕，並保持使用者資料隔離與列表即時更新。
- [x] 以回歸測試驗證同場待確認紀錄在匯入官方結果後只更新既有資料、不重複建立，並回報 created／updated 統計。
- [x] 以超過 25MB 的模擬守衛 JSON 驗證自動分批後每批小於 API 限制、成功總筆數正確且失敗批次有明確提示。
- [x] 以 API 或互動測試驗證歷史列表刪除不觸發列項導覽、成功後刷新清單，且不能刪除其他使用者的資料。
- [x] 新增 `recordPvpImport` 的可重播資料層測試，覆蓋同使用者未知紀錄回填、同結果重匯去重與跨使用者隔離。
- [x] 將分批上傳流程抽為可測試工具，並在中途失敗時回傳已完成批次統計與明確的失敗批次資訊。
- [x] 新增 `/matches` 刪除按鈕互動測試，驗證事件不導覽且成功後刷新列表與儀表板快取。
- [x] 直接測試 `recordPvpImport`：既有待確認紀錄接收同場官方結果後，回傳 createdCount 0／updatedCount 1，且交易不執行新增。
- [x] 直接測試 `recordPvpImport`：重複匯入相同官方結果後，回傳 createdCount 0／updatedCount 0。
- [x] 直接測試 `recordPvpImport`：相同來源鍵的其他使用者紀錄不會被當前使用者的匯入更新。
- [x] 診斷 PVP 守衛在長時間閒置、官方 WebSocket 重建或守衛晚掛載後未再記錄封包的連線生命週期。
- [x] 以完全被動方式支援既有與後續建立的 WebSocket 連線，避免重連後遺漏 PVP 封包且不改寫、延遲或阻擋官方訊框。
- [x] 建立閒置後重連／晚掛載的載入器與守衛回歸模擬，驗證新戰鬥仍能被匯出為紀錄。
- [x] 在守衛加入可複製的 PVP 候選封包摘要診斷，僅統計 topic、event 與安全欄位鍵，避免保存無關原始內容。
- [x] 以使用者實際戰鬥中的診斷摘要辨識尚未涵蓋的官方 PVP 訊息形狀與資料通道；摘要顯示 48 筆已辨識 PVP 封包與 291 筆 locale 候選摘要，未發現新的 PVP 資料通道。
- [x] 依實際摘要維持既有 PVP 過濾器與正規化器；未確認的新形狀不擴大原始資料擷取，並以既有重播驗證匯出紀錄持續增加。
- [x] 收斂候選封包診斷路徑：在 `#/pvpbattle` 下，未確認為 PVP 的候選訊框只保存 topic、event 與安全欄位鍵摘要，不寫入 payload 或 rawFrame。
- [x] 補候選訊框回歸測試，驗證非 PVP 訊框不會完整進入 `EVENT_KEY`，只會出現在安全診斷摘要中。
- [x] 將 PVP 面板的固定快取上限改為明確顯示「最近保留」語意，避免 `160 / 160` 被誤解為停止接收。
- [x] 在面板顯示累計辨識、本頁新增與淘汰數，並與複製安全診斷摘要使用同一組統計。
- [x] 補快取滿載的回歸驗證，確認後續 PVP 封包仍會增加累計數與本頁新增數。
- [x] 檢查 `pvpImportBatches.rawPayload` 在大型 JSON 分批匯入時的資料庫欄位容量與寫入用途，避免重複保存整份巨型資料。
- [x] 將大型匯入批次改為保存受限的追溯摘要，確保個別戰績原始資料仍依既有策略保存且批次插入可成功。
- [x] 將匯入頁的資料庫失敗訊息正規化為短且可讀的說明，禁止顯示完整 SQL 或原始 JSON。
- [x] 補大型 JSON 匯入回歸，驗證批次記錄寫入成功、戰績統計正確，且錯誤訊息不洩露巨型內容。
- [x] 檢視目前 Manus OAuth、受保護路由與 `userId` 資料邊界，定義免登入改造的最小安全範圍。
- [x] 導入匿名瀏覽器識別與伺服器端匿名資料範圍，讓未登入訪客可建立、匯入、查看與刪除自己的戰績。
- [x] 保持既有 Manus 帳戶資料只可由原帳戶存取，避免匿名裝置識別取得既有私人戰績。
- [x] 更新登入導向、導覽與文案，移除一般使用流程對 Manus 登入的要求。
- [x] 補匿名使用者的匯入、查詢、刪除與跨裝置隔離回歸測試。
- [x] 新增匿名 `pvp.create`、`pvp.importJson` 與 `pvp.delete` 路由測試，逐一斷言皆使用匿名 owner id。
- [x] 新增 device A／device B 隔離回歸，確認 B 無法 list、get 或 delete A 建立／匯入的戰績。
- [x] 在未登入瀏覽器進行匿名匯入與刪除互動驗證，確認流程不會導向登入且列表會更新。
- [x] 以未登入真實 UI 完成匿名刪除：點垃圾桶不導覽、開啟確認對話、確認後列表即時移除且不導向登入。
- [x] 將歷史列表刪除從瀏覽器原生確認改為頁內可存取的確認對話，保留取消與刪除中狀態。
- [x] 以未登入真實 UI 驗證頁內確認對話：垃圾桶不導覽、取消不刪除、確認後列表立即更新且不導向登入。
- [x] 整理 GitHub 可用的專案原始碼、部署說明與安全排除規則，並輸出 ZIP 套件。
- [x] 補齊 Windows 本機一鍵啟動說明與啟動腳本，重新封裝並驗證使用者不會直接開啟 Vite 原始入口。
- [x] 在直接開啟 `client/index.html` 時提供明確啟動提示，並驗證不再出現只有空白頁的誤用情境。
- [x] 評估並規劃純前端 GitHub Pages 版本：以瀏覽器本機資料保存取代資料庫，保留匯入、建立、列表、統計、刪除與 JSON 備份／還原。
- [x] 匯出並驗證目前使用者可存取的真實戰績為可攜備份，供純前端版首次還原使用。
- [x] 檢查使用者實際下載的備份 JSON，驗證 format、recordCount 與 records 確實對應可存取戰績。
- [x] 用使用者實際備份檔在 IndexedDB 流程完成一次還原驗證，再確認真實資料遷移完成。
- [x] 新增 IndexedDB 備份還原單元測試，覆蓋自動編號與完整備份資料的建立流程。
- [x] 移除 MySQL、Express、tRPC 與 Manus OAuth 執行期依賴，改以 IndexedDB 實作本機戰績建立、匯入、篩選、統計、詳情與刪除。
- [x] 新增完整資料備份／還原與清除本機資料防呆，明確說明瀏覽器資料儲存限制。
- [x] 新增 GitHub Pages 自動建置工作流程、專案子路徑與 Hash 路由支援。
- [x] 驗證純前端版在本機與 GitHub Pages 建置輸出中可完成備份還原、建立、匯入、列表、統計與刪除。
- [x] 在純前端版本以瀏覽器實測手動新增、列表／統計更新、詳情與頁內確認刪除。
- [x] 在純前端版本以瀏覽器實測一般 PVP JSON 匯入，確認匯入摘要、列表與統計更新正常。
- [x] 以 `vite preview` 的正式靜態輸出驗證列表、統計、備份還原與刪除，不只驗證編譯成功。
- [x] 補齊純前端的 `pnpm preview` 腳本，讓正式靜態輸出可於推送前被獨立驗證。
- [x] 將完成的純前端版本推送至 `chiaomao666/rf-pvp-analyzer`，並交付 GitHub Pages 啟用步驟。
- [x] 修正 GitHub Pages workflow 在 setup-node 設定 pnpm 快取前尚未安裝 pnpm 的首次部署失敗。
- [x] 從 GitHub 提交移除平台執行期專案設定，避免外洩不屬於靜態網站的連線或金鑰資訊。
- [x] 重新盤點工作樹的敏感設定字串與移除項目，保存提交前的最終安全檢查結果。
- [x] 在建立提交前檢查暫存區，確認不含平台設定、舊後端檔案、使用者備份或敏感字串。
- [x] 在移除未使用地圖元件後重新掃描工作樹敏感設定字串，確認無平台整合殘留。
- [x] 在提交前檢查最終 Git 狀態，確認工作樹沒有未暫存或不應提交的檔案。
- [x] 以純前端 localhost 瀏覽器明確記錄手動新增後的列表、詳情與首頁統計變化，以及刪除後的資料與統計回復。
- [x] 以純前端 localhost 瀏覽器明確記錄一般 PVP JSON 匯入摘要、列表與首頁統計變化，並確認清理測試資料後的統計回復。
- [x] 將純前端瀏覽器驗證觀測結果寫入驗證紀錄文件，避免只以操作意圖或 URL 變化判定完成。
- [x] 重新執行 localhost 工作流程並記錄建立、匯入、刪除前後的首頁統計、列表筆數、詳情 id 與實際匯入摘要。
- [x] 以正式 `pnpm preview` 靜態輸出重做備份還原、建立、匯入與刪除，避免自動化中斷並保存可核對結果。
- [x] 讀回並核對 `pure_frontend_verification.md` 的最終內容，確認含有具體可驗證的觀測值。
- [x] 以 `pnpm preview` 的 4173 正式靜態輸出重新驗證備份還原、手動建立、一般 JSON 匯入、列表／統計更新、頁內刪除與清理，並保存前後數值。
- [x] 讀回最終驗證紀錄，核對其中包含 localhost 與 preview 的首頁統計、列表筆數、詳情 id、匯入摘要與刪除後回復狀態。
- [x] 釐清一般 JSON 匯入與完整本機備份還原的入口及保存範圍，避免完整備份的匯入歷程遺漏。
- [x] 在實際 `pnpm preview` 4173 上以「還原本機備份」專用入口還原無敏感 `local-backup-v1` 測試檔，記錄還原、匯入歷程、統計、詳情與清理結果。
- [x] 由擁有儲存庫 Pages 管理權限的帳戶啟用 GitHub Pages 並設定部署來源為 GitHub Actions，再確認 workflow 成功與公開網址。
- [x] 追查戰績僅顯示排名、未顯示對戰分數的原因，確認守衛匯入、IndexedDB 保存與頁面呈現的分數欄位是否完整。
- [x] 補齊對戰分數的保存與顯示，並以包含分數的無敏感測試資料驗證戰績詳情與總覽。
- [x] 以不含真實資料的測試紀錄驗證賽前／賽後積分與分數變化會出現在首頁、歷史列表與詳情頁，並寫入驗證紀錄。
- [x] 讀回總覽、列表、詳情與手動新增頁的分數渲染程式，確認資料欄位與介面呈現一致。
- [x] 以無敏感測試紀錄重新核對首頁目前積分、列表積分變動及詳情賽前／賽後積分，將實際數值寫入驗證紀錄。
- [x] 讀回積分驗證紀錄，確認首頁 1,245、列表 +45、詳情 1,200／1,245 的實測數值已成功保存。
- [x] 檢視參考網站的登入、帳號查詢與資料載入流程，辨識其實際 API、資料欄位與前端互動模式。
- [x] 確認可公開查詢的帳號存在資料來源與跨網域限制，避免純前端對未知或受保護端點做不安全請求。
- [x] 設計每個帳號獨立的 IndexedDB 戰績與匯入批次歸屬，處理既有未綁定資料的遷移策略。
- [x] 實作帳號切換、登入後本機資料載入及 JSON 匯入綁定，並驗證不同帳號資料互不混用。
- [x] 確認參考登入 API 的必要公開設定、回應欄位與 CORS 行為，且不複製或提交第三方程式中的憑證。
- [x] 設計登入後以官方回傳帳號 ID 為鍵的 IndexedDB 工作區，並為既有未綁定戰績提供一次性遷移。
- [x] 實作帳號／密碼登入、帳號存在查詢、目前帳號切換與登入階段錯誤處理，且不持久化密碼或登入 token。
- [x] 將一般 JSON 匯入、完整備份還原與匯入歷程綁定至目前帳號，阻止帳號 ID 不一致的資料誤匯。
- [x] 在登入介面加入使用者提供的帳號安全、隱私、ToS、CORS 與示範模式說明。
- [x] 驗證不同帳號工作區、既有 11 筆資料遷移、匯入歸屬與登出後密碼／token 不殘留。
- [x] 從未修改的官方主程式盤點登入端點、公開組態、app version、回應欄位與可確認的 WebSocket endpoint／player channel；不將未實測的握手參數視為契約，也不提交任何未授權憑證。
- [x] 比對官方主程式與 GitHub Pages origin 的 CORS／Cloudflare 行為，確認直連是否可行或必須使用官方允許的代理。
- [x] 在不污染真實資料的隔離 fake IndexedDB 中，以原始 11 筆 v1 備份驗證未綁定資料遷移、帳號歸屬與第二帳號隔離；一次性測試檔於驗證後移除。
- [x] 依 player channel 的官方 Phoenix 回應，實作僅擷取並保存 `medals` 結果資料的登入後查詢流程。
- [x] 在密碼欄加入無障礙的顯示／隱藏按鈕，確保不改變密碼的持久化規則。
- [x] 為帳號頁每個主要資訊格補上清楚的技術外框，維持既有深藍 HUD 視覺與行動版可用性。
- [x] 為 medals 訊框過濾、密碼顯示控制與帳號頁視覺更新完成回歸測試、靜態建置與 GitHub Pages 部署驗證。
- [x] 將 medals-only、密碼顯示按鈕與帳號頁外框更新提交並推送到 `chiaomao666/rf-pvp-analyzer`，確認新的 GitHub Pages workflow 成功且公開站包含此版面。
- [x] 針對 GitHub Pages 對官方登入 API 的 CORS 阻擋，將登入介面改為立即結束連線狀態並顯示不可重試的明確技術說明。
- [x] 比較官方允許 CORS、使用者自行執行的本機轉送與不保存認證資料的後端轉送三種登入架構，記錄各自安全界線與部署需求。
- [x] 補 CORS／網路失敗測試與實際公開站驗證，確認不會將 CORS 問題誤判為帳密錯誤或留下「連線中」狀態。
- [x] 在帳號頁以可見的 CORS／Cloudflare／逾時狀態文字驗證送出中狀態確實會結束，並保留介面層證據；以 fetch 拒絕測試覆蓋，不使用真實認證觸發遠端登入。
- [x] 將本輪 CORS 修正提交並部署到 GitHub Pages，於公開站以不含真實認證的安全情境確認不會顯示長時間「連線中」。
- [x] 將手動新增排名戰的我方與對手隊伍改為固定五名角色輸入，並使空白欄位與輸入提示清楚對應五人編制。
- [x] 調整手動新增的五人隊伍驗證與保存規則，並保留既有一人或不完整舊紀錄的讀取相容性。
- [x] 為五人隊伍表單新增回歸測試、桌面與手機版面驗證、靜態建置及 GitHub Pages 部署確認。

- [x] 評估遊戲 mod 在遊戲進行中被動補抓指定資料的觸發條件、去重與暫存方式。
- [x] 設計本機橋接將資料同步至 GitHub Pages 工作區的安全流程，避免把密碼、user_token 或非必要封包送出。
- [x] 說明純 GitHub Pages 無法直接接收背景 POST 的限制，並比較本機同步、瀏覽器擴充功能與受管後端三種方案。
- [x] 若選定實作方案，補上資料隔離、離線佇列、重試與使用者可停止控制的測試與文件。

- [x] 建立僅監聽 localhost 的本機橋接服務，接受 PVP medals 最小資料、去重並提供離線佇列。
- [x] 讓分析站可連接本機橋接並將符合目前 user_id 的資料寫入 IndexedDB，提供停止／重連狀態。
- [x] 改良帳號工作區選擇 UI，支援搜尋、折疊或摘要顯示，避免工作區清單持續膨脹。
- [x] 點選既有工作區時只切換本機 IndexedDB 範圍，不呼叫官方登入 API，並明確標示未重新驗證。
- [x] 為本機橋接、資料去重、帳號隔離、離線重試與工作區本機切換補測試及文件。

- [x] 建立 loopback-only、記憶體限定的 Localhost Bridge，只接受白名單最小戰績摘要，不接收憑證或原始封包。
- [x] 加入前端 bridge health／游標輪詢、手動開關、離線狀態與目前工作區限定匯入。
- [x] 改善帳號工作區清單：搜尋、官方／示範分組收合與筆數提示；既有工作區切換明確標示不重新驗證且不呼叫官方 API。
- [x] 擴充 5v5 JSON 正規化、完整備份還原與 bridge 來源鍵去重匯入。
- [x] 新增 bridge client、mod 接線範例、Windows／GitHub Pages 使用文件與 curl 健康檢查說明。
- [x] 補上 bridge client、5v5 解析與 bridge 去重的 Vitest 回歸測試，並通過 TypeScript 檢查與正式建置。

- [x] 盤點目前 mod 是否已實際呼叫 Localhost Bridge client，確認遊戲資料到 bridge 的接線缺口。
- [x] 以最小白名單方式補上必要的 mod bridge 轉送接線，禁止傳送密碼、user_token、完整 raw frame 或非必要欄位。
- [x] 修復 checkpoint 暴露的部署輸出路徑不一致問題，讓正式建置產物符合部署服務預期。
- [x] 補上 mod 接線與部署輸出路徑回歸測試，重新驗證網站建置及 bridge smoke test。

- [x] 盤點使用者提供的 mod 載入器與 PVP 守衛，確認實際事件聚合與載入順序。
- [x] 以最小白名單摘要把 PVP 結果安全轉送至 Localhost Bridge，禁止傳送憑證、token 與完整原始訊框。
- [x] 為實際 mod bridge 接線補上去敏、去重與失敗不阻塞遊戲的測試。
- [x] 修復受管部署使用 Node 啟動時缺少 dist/index.js 的啟動契約，並重新驗證部署建置。

- [x] 確認並移除未使用的全局記憶體優化器及其載入器／文件引用。
- [x] 設計並實作可直接給 mod 使用的合併 bridge 檔案，同時保留 Node bridge server 的獨立啟動能力。
- [x] 更新 loader、Windows 啟動檔、bridge 文件與 contract 測試以符合合併後結構。
- [x] 重新執行 Vitest、TypeScript、mod 語法檢查、正式建置與 bridge smoke test。

- [x] 修正 START_BRIDGE_WINDOWS.bat 從任意工作目錄啟動時找不到 package.json 的問題。
- [x] 補充 bridge Windows 啟動檔的專案位置與錯誤提示，並驗證檔案內容與正式建置不受影響。

- [x] 評估純前端 GitHub Pages 與受管後端部署是否能共存，確認不破壞既有 IndexedDB 模式。
- [x] 設計後端 PVP 摘要接收 API 的驗證、來源去重、資料隔離與 CORS 邊界。
- [x] 實作可選後端接收流程，讓 mod 能直接 POST 最小 5v5 結果摘要。
- [x] 加入前端後端模式設定與錯誤狀態，並保留本機 bridge 作為離線方案。
- [x] 補上後端 API、mod、資料隔離與部署契約測試。

- [x] 核對目前 mod 直接後端模式的 endpoint、workspaceId、載入順序與 fallback 行為。
- [x] 整理所有曾修改的 mod 檔案，區分必要、選用、未使用與已淘汰檔案。
- [x] 為每個可交付 mod 檔案準備直接下載附件與正確安裝說明。

- [x] 為 pvp_double_match_guard.js 加入明確後端連線狀態與最近心跳時間顯示。
- [x] 為直接後端模式加入低頻 health 心跳、逾時判定與指數退避重連，且不傳送遊戲資料。
- [x] 補上狀態機、心跳、重連與閒置恢復的 contract／後端回歸測試。
- [x] 更新 mod 檔案與使用說明，重新驗證語法、測試與 bridge／backend smoke。

- [x] 選定並記錄 GitHub 程式碼庫加外部執行平台的獨立後端方案，說明 GitHub Pages 不執行後端的限制。
- [x] 抽離 PVP API 為獨立服務，加入持久化資料、CORS、API 金鑰與 workspace 隔離。
- [x] 建立 GitHub Actions／部署設定與非機密環境變數範本。
- [x] 更新 mod 與 GitHub Pages 前端使用獨立 API endpoint。
- [x] 執行測試並推送到 GitHub，整理完整部署與驗證步驟。

- [x] 移除前端與 mod 中所有 Manus 預設 endpoint，改用自建 Worker 設定。
- [x] 完成 Cloudflare Worker／D1 部署文件與 GitHub Pages 設定說明。
- [x] 執行完整測試、建置與 Manus reference audit。
- [x] 推送獨立後端與前端部署設定至使用者 GitHub repository，並驗證 Actions workflow。
- [x] 交付 mod 檔案與 Cloudflare 設定步驟。
- [x] 修正 mod contract 測試對固定 `api/pvp/capture` 字串的過時斷言，改驗證可配置 Worker endpoint 與 localhost fallback。
- [x] 在 GitHub repository 設定 `CLOUDFLARE_API_TOKEN` secret 與 `CLOUDFLARE_ACCOUNT_ID`、`PVP_D1_DATABASE_ID`、`PVP_API_ORIGIN`、`PVP_BACKEND_ORIGIN` variables 後重跑並驗證 Actions。
- [x] 修正 backend workflow 以真正換行寫入 `account_id`，避免產生含字面 `\\n` 的非法 TOML。
- [x] 將 Worker `compatibility_date` 從會被 runner 判定為未來的日期改成固定過去日期，重新部署並驗證。
- [x] 釐清 Worker health 路徑：公開 Worker 使用 `/api/pvp/health`；前端與 mod 契約已一致，並完成公開 200 回應驗證。
- [x] 核對並整理 mod 直傳 Worker 的 endpoint、API key 與測試方法。
- [x] 核對 Pages 到 Worker 的 CORS 設定與實際 origin。
- [x] 查詢 D1 目前的事件筆數與最新寫入狀態。
- [x] 新增獨立的 `rf_pvp_backend_config.js` 設定檔，並讓 loader 在 PVP 守衛前穩定載入它。
- [x] 更新 mod contract 測試與文件，說明設定檔位置、endpoint、API key 與測試指令。
- [x] 排查 mod 顯示已擷取但未送達分析網站的轉送、Worker 寫入與 workspace 查詢鏈路；確認 5v5 medals 辨識條件漏掉 5v5，且前端輪詢原先只在帳號頁執行。
- [x] 補上 5v5 官方結果辨識回歸斷言與全站背景同步；已通過 45 項 Vitest、TypeScript、mod 語法檢查與正式 Vite build。
- [x] 修正 GitHub Pages 公開頁面仍選用 local bridge、反覆呼叫 127.0.0.1 而未呼叫 Worker 的模式設定：有注入 Worker origin 且未保存模式時預設 remote，仍可明確切回 local。
- [x] 修正受管部署啟動命令尋找 dist/index.js 但正式建置只產生 dist/public 的不一致：build 後產生 dist/index.js runtime entry。
- [x] 補上公開 Remote Backend 模式與部署啟動契約回歸驗證；已通過 46 項 Vitest、TypeScript 與正式 Vite build。
- [x] 核對最新 remote backend 修正是否已提交並推送到使用者的 GitHub repository：commit `c5d08a0` 已推送至 `github/main`。
- [x] 確認 GitHub Pages workflow 重新建置並公開最新 bundle：Pages 與 Worker workflow 均成功完成；公開 bundle 已包含 Worker origin 與舊 local 模式遷移邏輯。
- [x] 將 `rf_pvp_backend_config.js` 改放到 `TOOLS` 資料夾，並由 loader 以相對路徑 `./mods/TOOLS/rf_pvp_backend_config.js` 載入。
- [x] 更新 mod 契約測試、README 與交付檔案結構，確認不需把設定寫死在 loader；已通過 47 項 Vitest、TypeScript 與 3 個 mod Node 語法檢查。
- [x] 移除網站 JSON 匯入／匯出按鈕、頁面入口與相關操作 UI；已清理首頁、帳號頁、歷史頁與新增紀錄頁。
- [x] 移除不再使用的 JSON 匯入／匯出頁、拆批上傳模組與專用測試，保留 Worker/D1 同步、事件 parser 及既有 IndexedDB 戰績；已通過 41 項 Vitest、正式建置與殘留引用搜尋。
- [x] 將已完成的 JSON 匯入／匯出移除變更提交並推送到 `chiaomao666/rf-pvp-analyzer`：commit `5652ef4` 已推送至 `main`。
- [x] 確認 GitHub Pages workflow 成功完成，並驗證公開網站已更新至無 JSON 入口版本；公開 workflow 成功，bundle 搜尋不到 JSON 匯入／匯出入口。
- [x] 在網站底部顯示版本號與最後更新時間；使用公開 build metadata 呈現。
- [x] 在介面顯示 Worker 同步狀態與最後同步時間；狀態來自實際 health／events 輪詢，不使用模擬值。
- [x] 清理移除 JSON 後殘留的舊功能按鈕或區塊；完成全域搜尋與首頁／新增紀錄頁清理。
- [x] 將帳號工作區移到新增紀錄旁邊，並以遊戲內玩家名稱取代帳號編號／帳號名稱顯示。
- [x] 在我方與對手隊伍區塊顯示玩家名稱與組織名稱，移除原本不明顯位置的對手名稱顯示；保留舊資料安全回退。
- [x] 將版本頁尾、Worker 同步提示、導覽與玩家／組織名稱顯示的介面修改提交並推送到 `chiaomao666/rf-pvp-analyzer`。
- [x] 確認 GitHub Pages workflow 成功完成，並驗證公開站載入最新介面。
- [x] 解析使用者提供的 `pvp_opponent_persist.js`，確認 WebSocket 組織名稱欄位路徑。
- [x] 將我方／對手組織名稱接入 mod、Worker payload、IndexedDB 與戰績詳情顯示。
- [x] 補上組織名稱解析與舊資料回退測試，並驗證公開同步資料流。

- [x] 完成 AniDoor DOM 玩家／組織名稱擷取並串接至 5v5 守衛戰績。
- [x] 更新 Worker 與 IndexedDB parser 的玩家／組織欄位及晚到身份更新。
- [x] 以回歸測試、正式建置與端到端 smoke test 驗證身份同步，並推送 GitHub。

- [x] 核對 a48ec5f5 是否已推送至 chiaomao666/rf-pvp-analyzer，若未推送則完成提交與推送並驗證 Actions。

- [x] 將 GitHub Pages 戰績讀取統一為 Cloudflare Worker／D1，明確區分瀏覽器本機資料與雲端資料。
- [x] 在不依賴 Manus 本機網站後端的前提下，移除網站啟動與 API runtime 接線，保留遊戲 bridge 與 Cloudflare Worker 部署檔。
- [x] 為跨來源舊資料提供安全且可說明的恢復／遷移提示，並避免登入後誤顯示空白工作區。
- [x] 驗證公開站登入、Worker 事件讀回、5v5 身份資料與 GitHub Pages／Worker 部署。

- [x] 核對本機 PVP 監視器顯示的連線、快取、封包與完整戰績狀態，判斷是否真的故障。
- [x] 修復受管部署仍尋找 dist/index.js 的啟動設定，避免純前端版本發布後網站不可用。
- [x] 核對 GitHub Pages 最近更新時間、最新 commit 與 workflow，區分快取／部署時間／程式版本。

- [x] 為受管預覽環境補上僅服務 dist/public 的靜態檔案啟動入口，不恢復任何 Manus／本機資料 API。

- [x] 重現並定位剛完成 PVP 卻未建立戰績的漏記問題。
- [x] 驗證結束封包、5v5 medals、去重鍵、Worker capture 與前端 events 讀回各階段。
- [x] 修正漏記流程並新增對應回歸測試與公開版本驗證。

- [x] 提供更新後的 `bridge/mods/pvp_double_match_guard.js` 檔案給使用者。
- [x] 將 fc75d7a0 後的 PVP 漏記修正提交並推送至 `chiaomao666/rf-pvp-analyzer` main。
- [x] 核對 GitHub main commit 與 Pages／Worker workflow 狀態。

- [x] 核對 PVP 守衛面板中的擷取異常日誌、JSON 下載與診斷摘要按鈕是否仍有實際用途。
- [x] 移除無效的 JSON／舊日誌入口，保留必要的錯誤診斷與同步狀態資訊。
- [x] 測試並將面板清理修正推送至 GitHub。

- [x] 移除 PVP 守衛面板的 JSON 下載按鈕，將診斷摘要按鈕改名為「複製同步診斷」。
- [x] 核對並修復 Worker endpoint、API key、CORS 或重連設定造成的無法連線問題。
- [x] 測試、推送並附上更新後的 `pvp_double_match_guard.js` 檔案。

- [x] 移除 PVP 守衛面板的「下載分析站 JSON」按鈕。
- [x] 將「複製安全診斷摘要」改名為「複製同步診斷」。
- [x] 從戰鬥畫面第一張角色圖片上方名稱擷取我方／對手組織名稱並補送戰績。
- [x] 新增組織名稱與面板按鈕的回歸測試，提供 mod 檔案並推送 GitHub。

- [ ] 將目前最新版本 ada5495d 的面板與組織名稱修改推送至 GitHub main，確認 GitHub Pages 更新；完成後停止本專案後續更新。

- [ ] 最後一次只推送 GitHub Pages；完成後不再保存 checkpoint、不再發布或更新 Manus 受管網站。
- [x] 修正最新 GitHub Pages 使用的 PVP mod 組織名稱仍未同步問題，確認實際 DOM 選擇器、payload 與晚到補送流程；只推送 GitHub，不更新 Manus 受管網站。
- [x] 修正 PVP 守衛 `rf_pvp_event_archive` 因 rawFrame 造成 localStorage QuotaExceededError 的問題，保留戰績聚合所需欄位並只推送 GitHub Pages。
- [ ] 稽核 Worker／D1 儲存的玩家資料、CORS Origin 白名單、API key、回應暴露與請求限制；必要修正只推送 GitHub，不更新 Manus 受管網站。
- [x] 實作 A 強安全模式：capture／events 必須 API key、health 移除資料量 metadata、GitHub Pages 以瀏覽器本機設定 API key，金鑰不得進入 repository 或 bundle。
- [ ] 修正 GitHub Pages 遠端 Worker API key 輸入欄位不可見或未送出造成 401 的問題，確認 header 正確傳送；只推送 GitHub，不更新 Manus 受管網站。
- [ ] 整理公開讀取模式下 Pages／Worker 的檔案與設定變更，並比較 Cloudflare Access 與 Worker 端密碼登入的 workspace 保護方案；目前不修改或推送。
- [x] 恢復 A 強安全模式：health／capture／events 全部要求 API key，確認 CORS 與最小 health 回應維持不變；只推送 GitHub。
- [x] 將網站登入改為自訂密碼 session，將 mod 寫入驗證改為獨立 `PVP_WRITE_SECRET`，依登入身分隔離 workspace；只推送 GitHub，不更新 Manus 受管網站。
- [x] 整理本機 `PVP_WRITE_SECRET` 設定範本，稽核並修正 GitHub Pages 網站密碼登入／session 流程；實際 secret 不進 repository，只推送 GitHub。
- [ ] 測試 GitHub Pages 登入、Worker session 與 mod 戰績寫入流程；不新增假戰績、不更新 Manus 受管網站。

- [ ] 在 GitHub Pages 登入成功／session 建立時加入安全 console.log 診斷訊息，不輸出密碼、cookie、secret 或完整戰績；只推送 GitHub。

- [x] 詳細分析 5 個未被現行 `rf_mod_loader.js` 載入的 legacy 檔案，檢查殘留引用、全域副作用、相依性與是否需要封存或徹底清除。

- [x] 只在 GitHub Pages 專案右下角加入「網站擁有者&管理者：俏貓」，完成響應式版面、測試與建置驗證；不更新 Manus 受管網站。

- [x] 只調整 GitHub Pages 手機版 UI，參考 RF_site 的緊湊比例縮小導覽、內容卡片與間距，完成桌面／手機驗證並推送 GitHub；不更新 Manus 受管網站。

- [ ] 將每個帳號專屬玩家 ID 加入我方／對手聯盟名稱顯示，並同步支援新寫入、後端載入、晚到更新與舊資料相容。

- [ ] 分析官方登入 API 的 `origin: null` CORS 與 `504 Gateway Timeout` 錯誤，改善 GitHub Pages 登入錯誤處理或確認安全替代流程；不得要求使用者貼出帳密。

- [x] 將所有「遊戲玩家工作區」改為玩家名稱＋聯盟名稱＋玩家 ID，格式比照隊伍身分顯示，並完成 GitHub Pages 響應式驗證。

- [x] 根據登入／WebSocket player profile 資料補抓玩家名稱、聯盟名稱與玩家 ID，修正登入後工作區顯示「未提供玩家名稱／聯盟名稱」的問題，並完成前後端相容測試。

- [ ] 檢查已部署 GitHub Pages 的官方登入請求與 profile 解析；若登入 API 仍為 CORS／504，明確改善錯誤提示並區分外部服務故障，不要求使用者提供帳密。
- [x] 修復登入後工作區保存玩家名稱、聯盟名稱與玩家 ID 的流程
- [x] 修復官方 player channel profile／medals 回覆的欄位解析與合併更新
- [x] 補上登入後工作區資料更新的回歸測試並驗證 GitHub Pages 建置
- [x] 確認 MEDALS SNAPSHOT 的保存邊界是否阻止玩家名稱、聯盟名稱與玩家 ID 更新
- [x] 用實際工作區保存資料與回歸測試驗證 profile 是否獨立於 medals 陣列
- [x] 查明 GitHub Pages 實際 bundle 與工作區讀取後仍缺少玩家名稱、聯盟名稱與 ID 的原因
- [x] 核對官方 login／player channel 的真實身份欄位與事件順序，避免只依猜測擴充 parser
- [x] 修復並測試仍未顯示身份資料的實際缺口
