# Localhost Bridge

RF PVP Analyzer 是 GitHub Pages 純前端網站，因此不能要求遊戲 mod 將資料 POST 到 GitHub Pages 後端。Localhost Bridge 讓獲准的本機 mod 將**已整理的最小戰績摘要**送到同一台電腦上的 loopback 服務，再由開啟中的分析站以游標輪詢方式匯入目前工作區。

> **重要邊界：** bridge 綁定 `127.0.0.1`、只使用記憶體佇列，重啟即清空；它不接受密碼、登入 token、cookie、原始 WebSocket frame 或任意 payload。服務只接受 `type: "match"`，並以白名單保留時間、模式、雙方隊伍、結果、排名／積分及來源鍵。

## 啟動

在專案根目錄執行：

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm bridge
```

Windows 使用者也可以直接雙擊專案根目錄的 `START_BRIDGE_WINDOWS.bat`。啟動檔會依自身位置尋找 `bridge\\rf-bridge.mjs`，不要求目前 PowerShell 工作目錄正好位於專案根目錄；若只把 `.bat` 與 `rf-bridge.mjs` 放在同一資料夾，也可以直接啟動。

成功時會看到 `http://127.0.0.1:8787`。GitHub Pages 網站可以仍然使用遠端網址；bridge 必須在你遊戲與瀏覽器所在的同一台電腦啟動。帳號頁的「本機橋接」卡片預設關閉，確認安全邊界後再手動啟用輪詢。

## 先做連線測試

```powershell
curl.exe http://127.0.0.1:8787/health
```

測試一筆人工摘要：

```powershell
curl.exe -X POST http://127.0.0.1:8787/v1/capture `
  -H "Content-Type: application/json" `
  -d '{"type":"match","data":{"battleAt":1787603139254,"mode":"5v5","outcome":"win","playerTeam":[{"name":"我方1"},{"name":"我方2"},{"name":"我方3"},{"name":"我方4"},{"name":"我方5"}],"opponentTeam":[{"name":"敵方1"},{"name":"敵方2"},{"name":"敵方3"},{"name":"敵方4"},{"name":"敵方5"}],"sourceBattleChannel":"local-test","sourceBattleId":"test-1"}}'
```

開啟分析站、選取目標工作區並在帳號頁啟用 bridge 後，測試摘要會進入該工作區。相同的 `sourceBattleChannel + sourceBattleId` 會更新既有記錄，不會重複建立。

## mod 接線

在獲准的 mod loader 中只需載入 `pvp_double_match_guard.js`；它已內嵌 bridge client，會提供 `window.RFLocalBridge.sendMatch(summary)`。mod 必須自行依照遊戲事件整理出摘要，不應把原始遊戲封包直接交給 bridge：

```js
window.RFLocalBridge?.sendMatch({
  battleAt: Date.now(),
  mode: "5v5",
  outcome: "win", // win | loss | draw | unknown
  playerTeam: [{ name: "角色 A", level: 80, power: 12345 }],
  opponentTeam: [{ name: "對手 A", level: 80, power: 12000 }],
  rankBefore: 120,
  rankAfter: 115,
  scoreBefore: 6500,
  scoreAfter: 6620,
  sourceBattleChannel: "pvp:ranked",
  sourceBattleId: "由 mod 產生的穩定識別鍵"
}).catch((error) => console.warn("[RF bridge] capture rejected", error));
```

這段 client 只會送出白名單欄位；服務端還會再次驗證與清理。若 mod 無法可靠判斷比賽已結束，就不要呼叫 `sendMatch`，避免產生不完整戰績。此專案不包含任何自動攔截、登入或繞過官方驗證的程式。

## 狀態與故障排除

| 畫面狀態 | 意義 | 處理方式 |
| --- | --- | --- |
| `BRIDGE OFF` | 網站沒有輪詢 localhost | 在帳號頁按啟用，或保持關閉 |
| `BRIDGE ONLINE` | health 與事件輪詢成功 | 確認目前工作區與佇列數 |
| `BRIDGE OFFLINE` | bridge 未啟動、port 被占用或被瀏覽器拒絕 | 先執行 `pnpm bridge`，再檢查 `curl.exe /health` |
| `QUEUE` 不下降 | 網站沒有選取工作區，或事件摘要不符合白名單 | 先選取工作區；查看終端機回傳的拒絕原因 |

Bridge 不會把事件轉送到官方伺服器，也不會取代官方登入與 medals-only 查詢。使用前請確認遊戲服務條款、官方授權範圍與你安裝的 mod 行為均允許這種本機資料整理方式。

## Modified mod bundle

The ready-to-copy files are in `bridge/mods/`. The panel loader now loads only `pvp_double_match_guard.js`; its browser-side bridge client is embedded inside that file, so `rf_bridge_client.js` is no longer required. The no-panel loader remains unchanged because it does not install the passive WebSocket tap or load the PVP guard. `rf-bridge.mjs` is intentionally kept as a separate Node process because it binds the localhost port and cannot run inside a browser mod.
