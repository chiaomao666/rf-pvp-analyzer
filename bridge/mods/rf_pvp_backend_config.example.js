// 請複製為 assets/mods/rf_pvp_backend_config.js，再填入你自己的密鑰。
// 守衛會一次性取用設定，之後立即刪除 window 上的取用函式。
(function configureRfBackend() {
  "use strict";
  const PVP_WORKER_ORIGIN = "https://你的-pvp-worker.workers.dev";
  const PVP_WRITE_SECRET = "PASTE_NEW_PVP_WRITE_SECRET_HERE";
  const RANKING_WORKER_ORIGIN = "https://你的-ranking-worker.workers.dev";
  const RANKING_WRITE_SECRET = "PASTE_NEW_RANKING_WRITE_SECRET_HERE";
  const endpoint = `${PVP_WORKER_ORIGIN.replace(/\/$/, "")}/api/pvp/capture`;
  const rankingEndpoint = `${RANKING_WORKER_ORIGIN.replace(/\/$/, "")}/api/rankings/capture`;
  const writeSecret = PVP_WRITE_SECRET === "PASTE_NEW_PVP_WRITE_SECRET_HERE" ? "" : PVP_WRITE_SECRET;
  const rankingSecret = RANKING_WRITE_SECRET === "PASTE_NEW_RANKING_WRITE_SECRET_HERE" ? "" : RANKING_WRITE_SECRET;
  window.__RF_PVP_CONSUME_BACKEND_CONFIG__ = () => ({
    loaded: true,
    endpoint,
    writeSecret,
    rankingEndpoint,
    rankingSecret,
  });
})();
