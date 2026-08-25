// RF PVP Analyzer - Cloudflare Worker connection settings
// 請只修改下方 RF_PVP_API_KEY；不要把 API key 分享到聊天或提交到公開 repository。
(function configureRfPvpBackend() {
  "use strict";

  const WORKER_ORIGIN = "https://rf-pvp-analyzer-api.chengyen1209.workers.dev";
  const API_KEY = "PASTE_YOUR_PVP_API_KEY_HERE";

  window.RF_PVP_BACKEND_ENDPOINT = `${WORKER_ORIGIN}/api/pvp/capture`;
  window.RF_PVP_API_KEY = API_KEY === "PASTE_YOUR_PVP_API_KEY_HERE" ? "" : API_KEY;

  console.log(
    `[RF PVP config] Worker endpoint ready: ${window.RF_PVP_BACKEND_ENDPOINT}; ` +
    `apiKey=${window.RF_PVP_API_KEY ? "configured" : "not configured"}`,
  );
})();
