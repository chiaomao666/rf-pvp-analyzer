// 請複製為 assets/mods/rf_pvp_backend_config.js，再填入你自己的密鑰。
(function () {
  "use strict";
  const PVP_WORKER_ORIGIN = "https://你的-pvp-worker.workers.dev";
  const PVP_API_KEY = "PASTE_NEW_PVP_API_KEY_HERE";
  const RANKING_WORKER_ORIGIN = "https://你的-ranking-worker.workers.dev";
  const RANKING_WRITE_SECRET = "PASTE_NEW_RANKING_WRITE_SECRET_HERE";
  const pvpEndpoint = `${PVP_WORKER_ORIGIN.replace(/\/$/, "")}/api/pvp/capture`;
  const rankingEndpoint = `${RANKING_WORKER_ORIGIN.replace(/\/$/, "")}/api/rankings/capture`;
  const pvpKey = PVP_API_KEY === "PASTE_NEW_PVP_API_KEY_HERE" ? "" : PVP_API_KEY;
  const rankingSecret = RANKING_WRITE_SECRET === "PASTE_NEW_RANKING_WRITE_SECRET_HERE" ? "" : RANKING_WRITE_SECRET;
  window.STARTUP_BRIDGE_CONFIG = Object.freeze({ endpoint: pvpEndpoint, apiKey: pvpKey, rankingEndpoint, rankingSecret });
  window.RF_PVP_BACKEND_ENDPOINT = pvpEndpoint;
  window.RF_PVP_API_KEY = pvpKey;
  window.RF_RANKING_ENDPOINT = rankingEndpoint;
  window.RF_RANKING_WRITE_SECRET = rankingSecret;
})();
