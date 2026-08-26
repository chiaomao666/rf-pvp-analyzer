// RF PVP Analyzer - Cloudflare Worker connection settings
// 請只修改下方 RF_PVP_WRITE_SECRET；不要把寫入密鑰分享到聊天或提交到公開 repository。
(function configureRfPvpBackend() {
  "use strict";

  const WORKER_ORIGIN = "https://rf-pvp-analyzer-api.chengyen1209.workers.dev";
  const WRITE_SECRET = "PASTE_YOUR_PVP_WRITE_SECRET_HERE";

  window.RF_PVP_BACKEND_ENDPOINT = `${WORKER_ORIGIN}/api/pvp/capture`;
  window.RF_PVP_WRITE_SECRET = WRITE_SECRET === "PASTE_YOUR_PVP_WRITE_SECRET_HERE" ? "" : WRITE_SECRET;

  console.log(
    `[RF PVP config] Worker endpoint ready: ${window.RF_PVP_BACKEND_ENDPOINT}; ` +
    `writeSecret=${window.RF_PVP_WRITE_SECRET ? "configured" : "not configured"}`,
  );
})();
