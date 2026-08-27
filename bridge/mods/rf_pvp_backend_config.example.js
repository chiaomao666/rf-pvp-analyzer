// RF PVP Analyzer - private Cloudflare Worker connection settings template
// 請複製為 assets/mods/rf_pvp_backend_config.js 後，才在「你自己的電腦」填入 PVP_WRITE_SECRET。
// 真實設定檔已由 .gitignore 排除；不可將它上傳到 GitHub、聊天或公開下載位置。
(function configureRfPvpBackend() {
  "use strict";

  const WORKER_ORIGIN = "https://rf-pvp-analyzer-api.chengyen1209.workers.dev";
  const WRITE_SECRET = "PASTE_YOUR_PVP_WRITE_SECRET_HERE";
  let consumed = false;

  // 守衛只可取用一次；取用後由守衛立刻移除此函式，不把明文密鑰長期掛在 window。
  Object.defineProperty(window, "__RF_PVP_CONSUME_BACKEND_CONFIG__", {
    configurable: true,
    enumerable: false,
    value: () => {
      if (consumed) return null;
      consumed = true;
      return Object.freeze({
        endpoint: `${WORKER_ORIGIN}/api/pvp/capture`,
        writeSecret: WRITE_SECRET === "PASTE_YOUR_PVP_WRITE_SECRET_HERE" ? "" : WRITE_SECRET,
      });
    },
  });

  console.log(
    `[RF PVP config] Worker endpoint ready: ${WORKER_ORIGIN}/api/pvp/capture; ` +
    `writeSecret=${WRITE_SECRET === "PASTE_YOUR_PVP_WRITE_SECRET_HERE" ? "not configured" : "configured"}`,
  );
})();
