// RF PVP / RF Ranking Monitor connection settings
// 本檔案只放在本機 assets/mods/TOOLS/，不要提交到公開 repository。
(function configureRfBackend() {
  "use strict";

  const PVP_WORKER_ORIGIN = "https://rf-pvp-analyzer-api.chengyen1209.workers.dev";
  const PVP_API_KEY = "PASTE_YOUR_PVP_API_KEY_HERE";
  // 填入 rf-ranking-monitor Worker 的 workers.dev 位址；尚未部署可留空。
  const RANKING_WORKER_ORIGIN = "";
  const RANKING_WRITE_SECRET = "PASTE_YOUR_RANKING_WRITE_SECRET_HERE";

  const pvpEndpoint = `${PVP_WORKER_ORIGIN.replace(/\/$/, "")}/api/pvp/capture`;
  const rankingEndpoint = RANKING_WORKER_ORIGIN
    ? `${RANKING_WORKER_ORIGIN.replace(/\/$/, "")}/api/rankings/capture` : "";
  const pvpKey = PVP_API_KEY === "PASTE_YOUR_PVP_API_KEY_HERE" ? "" : PVP_API_KEY;
  const rankingSecret = RANKING_WRITE_SECRET === "PASTE_YOUR_RANKING_WRITE_SECRET_HERE" ? "" : RANKING_WRITE_SECRET;

  window.STARTUP_BRIDGE_CONFIG = Object.freeze({
    endpoint: pvpEndpoint,
    apiKey: pvpKey,
    rankingEndpoint,
    rankingSecret,
  });
  // 舊版守衛相容欄位；密鑰不會寫入 localStorage、IndexedDB 或診斷輸出。
  window.RF_PVP_BACKEND_ENDPOINT = pvpEndpoint;
  window.RF_PVP_API_KEY = pvpKey;
  window.RF_RANKING_ENDPOINT = rankingEndpoint;
  window.RF_RANKING_WRITE_SECRET = rankingSecret;

  console.log(`[RF backend config] PVP=${pvpEndpoint}; ranking=${rankingEndpoint || "未設定"}; ` +
    `pvpKey=${pvpKey ? "configured" : "not configured"}; rankingSecret=${rankingSecret ? "configured" : "not configured"}`);
})();
