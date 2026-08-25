// loader.js - 統一管理所有小工具的載入
// index.html 只需要掛這一支，其他工具都寫在下面的 TOOLS 清單裡集中管理
console.log("[LOADER] 小工具載入器啟動");

(function(){
    // ---- 在這裡集中管理所有小工具 ----
    const TOOLS = [
        // 必須最先載入，讓 pvp_double_match_guard.js 初始化前取得 Worker endpoint 與 API key。
        { id: "RF PVP Worker 連線設定",
            src: "./mods/rf_pvp_backend_config.js",
            css: null,
            enabled: true
        },
        { id: "據點顯示優化",
            src: "./mods/custom_attackmap.js",
            css: "./mods/custom_attackmap.css", 
            enabled: true
        },
        { id: "戰鬥硬體加速",
            src: null,
            css: "./mods/battle_css_accel.css",
            enabled: true
        },
        { id: "動畫加速",
            src: null,
            css: null,
            enabled: false
        },
        { id: "戰鬥等待加速",
            src: "./mods/battle_wait_speed.js",
            css: null,
            enabled: true
        },
        { id: "戰鬥動畫跳過",
            src: "./mods/battle_skip_anim.js",
            css: null,
            enabled: true
        },
        { id: "顯示角色最高等級",
            src: "./mods/show_level_cap.js",
            css: null,
            enabled: true
        },
        { id: "角色戰力個別顯示",
            src: "./mods/restore_power_display.js",
            css: null,
            enabled: true
        },
        { id: "排名戰顯示對手名稱",
            src: "./mods/pvp_opponent_persist.js",
            css: null,
            enabled: true
        },
        { id: "夏夏の小工具",
            src: "./mods/rf_mod.js",
            css: "./mods/rf_mod.css",
            enabled: true
        },
        { id: "夏夏の音量調整工具",
            src: "./mods/rf_audio_panel.js",
            css: null,
            enabled: false
        },
        { id: "圖資缺漏檢查",
            src: "./mods/uw_hook.js",
            css: null,
            enabled: false
        },
        { id: "登入介面帳號管理",
            src: "./mods/rf_account_manager.js",
            css: null,
            enabled: true
        },
        { id: "戰鬥倍率面板",
            src: "./mods/battle_speed_panel.js",
            css: null,
            enabled: true
        },
        { id: "戰鬥狀態與效能診斷",
            src: "./mods/battle_state_diagnostic.js",
            css: null,
            enabled: false
        },
        { id: "戰鬥 FPS 實驗攔截",
            src: "./mods/battle_fps_override_experimental.js",
            css: null,
            enabled: false
        },
        { id: "排名戰重複配對攔截",
            src: "./mods/pvp_double_match_guard.js",
            css: null,
            enabled: true
        },
        { id: "Mod 效能分析器",
            src: "./mods/rf_mod_profiler.js",
            css: null,
            enabled: false
        },
        { id: "據點戰數據監測",
            src: "./mods/battle_stats_monitor.js",
            css: null,
            enabled: false
        },
        { id: "首頁齒輪效能優化",
            src: "./mods/home_gear_blocker.js",
            css: null,
            enabled: true
        },
    ];

    const STORAGE_KEY = "uw_loader_config";

    function loadConfig(){
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function saveConfig(cfg){
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
        } catch (e) {
            console.warn("[LOADER] 設定儲存失敗", e);
        }
    }

    function isEnabled(tool, cfg){
        return Object.prototype.hasOwnProperty.call(cfg, tool.id) ? cfg[tool.id] : tool.enabled;
    }

    // PVP 守衛需要在官方主程式建立 Socket 前開始被動觀察，否則舊連線無法補掛 message listener。
    // 此觀察器不修改、不延遲、也不丟棄任何 WebSocket 封包；它只將排名戰相關的已接收訊框交給守衛。
    function installPvpSocketTap(){
        const existingTap = window.__RF_PVP_SOCKET_TAP__;
        if (existingTap && typeof existingTap.ensure === "function") {
            existingTap.ensure();
            return existingTap;
        }
        if (existingTap) return existingTap;

        const subscribers = new Set();
        const stats = { installedAt: Date.now(), socketCount: 0, receivedMessageCount: 0, forwardedFrameCount: 0, candidateFrameCount: 0, lastCandidate: null, reinstallCount: 0 };
        let ObservedWebSocket = null;

        function decodeFrame(data){
            if (typeof data !== "string") return { raw: String(data), topic: "", event: "", payload: null };
            try {
                const decoded = JSON.parse(data);
                if (Array.isArray(decoded)) {
                    return { raw: decoded, topic: String(decoded[2] || ""), event: String(decoded[3] || ""), payload: decoded[4] ?? null };
                }
                if (decoded && typeof decoded === "object") {
                    return {
                        raw: decoded,
                        topic: String(decoded.topic || decoded.channel || ""),
                        event: String(decoded.event || decoded.type || ""),
                        payload: decoded.payload ?? decoded.data ?? null,
                    };
                }
                return { raw: decoded, topic: "", event: "", payload: null };
            } catch (error) {
                return { raw: data, topic: "", event: "", payload: null };
            }
        }

        function isPvpFrame(frame){
            const signature = `${frame.topic} ${frame.event}`.toLowerCase();
            const isResultPagePlayerFrame = /^player:\d+$/i.test(String(frame.topic || ""))
                && location.hash.toLowerCase().includes("/pvpresult");
            return signature.includes("pvp")
                // 官方結果頁會對 player channel 發出 medals 請求；不同版本的回覆可能是
                // medals、phx_reply 或 update_data。只在 /pvpresult 時保存 player 封包，避免擴大成全站監聽。
                || isResultPagePlayerFrame;
        }

        function summariseCandidate(frame){
            const payload = frame.payload && typeof frame.payload === "object" && !Array.isArray(frame.payload) ? frame.payload : null;
            return {
                diagnosticOnly: true,
                capturedAt: Date.now(),
                topic: String(frame.topic || "").replace(/\d+/g, "#").slice(0, 80) || "(none)",
                event: String(frame.event || "(none)").slice(0, 80),
                payloadKeys: Object.keys(payload || {}).slice(0, 12),
                pageHash: location.hash,
            };
        }

        function publish(data, url){
            const frame = decodeFrame(data);
            stats.receivedMessageCount += 1;
            const pvpFrame = isPvpFrame(frame);
            const battlePage = location.hash.toLowerCase().includes("/pvpbattle");
            if (!pvpFrame && !battlePage) return;
            const entry = pvpFrame
                ? { ...frame, capturedAt: Date.now(), socketUrl: url || "", pageHash: location.hash }
                : summariseCandidate(frame);
            if (pvpFrame) stats.forwardedFrameCount += 1;
            else {
                stats.candidateFrameCount += 1;
                stats.lastCandidate = entry;
            }
            subscribers.forEach((listener) => {
                try { listener(entry); } catch (error) { console.error("[LOADER] PVP Socket 訂閱者失敗：", error); }
            });
        }

        function installObservedConstructor(){
            const NativeWebSocket = window.WebSocket;
            if (NativeWebSocket === ObservedWebSocket) return true;
            if (typeof NativeWebSocket !== "function") {
                console.warn("[LOADER] 無法安裝 PVP Socket 觀察器：WebSocket 不可用。");
                return false;
            }

            function PassiveObservedWebSocket(url, protocols){
                const socket = arguments.length > 1 ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
                stats.socketCount += 1;
                // 僅加上一個 message listener；不修改事件內容、不阻擋事件，也不改變 socket 的傳送流程。
                socket.addEventListener("message", (event) => publish(event.data, socket.url));
                return socket;
            }

            PassiveObservedWebSocket.prototype = NativeWebSocket.prototype;
            Object.setPrototypeOf(PassiveObservedWebSocket, NativeWebSocket);
            ObservedWebSocket = PassiveObservedWebSocket;
            window.WebSocket = ObservedWebSocket;
            stats.reinstallCount += 1;
            return true;
        }

        if (!installObservedConstructor()) return null;
        const tap = {
            subscribe(listener){
                subscribers.add(listener);
                return () => subscribers.delete(listener);
            },
            getStatus(){ return { ...stats, active: window.WebSocket === ObservedWebSocket }; },
            ensure(){ return installObservedConstructor(); },
        };
        window.__RF_PVP_SOCKET_TAP__ = tap;
        // 不使用輪詢或計時器。僅在瀏覽器實際將頁面帶回前景／從 bfcache 還原時，
        // 再確認未來新建的官方 WebSocket 仍會被被動觀察。
        const ensureAfterReturn = () => tap.ensure();
        window.addEventListener("pageshow", ensureAfterReturn);
        window.addEventListener("focus", ensureAfterReturn);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) ensureAfterReturn();
        });
        console.log("[LOADER] PVP Socket 被動觀察器已預先安裝。");
        return tap;
    }

    function injectScript(tool){
        if (!tool.src) return;
        const s = document.createElement("script");
        s.src = tool.src + "?v=" + Date.now();
        s.async = false;
        s.defer = true;
        s.dataset.uwTool = tool.id;
        document.head.appendChild(s);
        console.log("[LOADER] 載入 JS：" + tool.id);
    }

    function injectStyle(tool){
        if (!tool.css) return;
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = tool.css + "?v=" + Date.now();
        l.dataset.uwTool = tool.id;
        document.head.appendChild(l);
        console.log("[LOADER] 載入 CSS：" + tool.id);
    }

    function loadEnabledTools(){
        const cfg = loadConfig();
        TOOLS.forEach(tool => {
            if (!isEnabled(tool, cfg)) return;
            if (tool.css) injectStyle(tool);
            if (tool.src) injectScript(tool);
        });
    }

    function buildPanel(){
        const cfg = loadConfig();
        const style = document.createElement("style");
        style.textContent = `
            #uw-loader-panel{
                position:fixed; left:14px; bottom:14px; z-index:2147483647;
                width:220px; font-family:ui-monospace,Menlo,Consolas,monospace;
                background:#14160f; color:#e8e4d5; border:1px solid #3a3f2c;
                border-radius:4px; box-shadow:0 4px 18px rgba(0,0,0,.5);
                font-size:12px; overflow:hidden;
            }
            #uw-loader-panel .uw-head{
                background:#1c2018; padding:8px 10px; display:flex;
                align-items:center; justify-content:space-between; cursor:move;
                border-bottom:1px solid #3a3f2c;
            }
            #uw-loader-panel .uw-head b{color:#d9a441; font-weight:600; font-size:11.5px;}
            #uw-loader-panel .uw-body{padding:8px 10px; max-height:260px; overflow:auto;}
            #uw-loader-panel .uw-row{
                display:flex; align-items:center; gap:8px; padding:4px 0;
                border-bottom:1px solid #23271a;
            }
            #uw-loader-panel .uw-row:last-child{border-bottom:none;}
            #uw-loader-panel .uw-row span{flex:1; word-break:break-all;}
            #uw-loader-panel .uw-hint{color:#8b9284; font-size:10.5px; padding:6px 10px; border-top:1px solid #3a3f2c;}
            #uw-loader-panel .uw-actions{display:flex; gap:7px;}
            #uw-loader-panel .uw-btn{cursor:pointer; color:#8b9284; font-size:13px; user-select:none;}
        `;
        document.head.appendChild(style);

        const panel = document.createElement("div");
        panel.id = "uw-loader-panel";
        panel.innerHTML = `
            <div class="uw-head" id="uw-loader-drag">
                <b>[小工具管理器]</b>
                <span class="uw-actions">
                    <span class="uw-btn" id="uw-loader-close">×</span>
                    <span class="uw-btn" id="uw-loader-min">—</span>
                </span>
            </div>
            <div class="uw-body" id="uw-loader-body"></div>
            <div class="uw-hint">改動後重新整理頁面才會生效</div>
        `;
        document.body.appendChild(panel);

        const body = panel.querySelector("#uw-loader-body");
        TOOLS.forEach(tool => {
            const row = document.createElement("label");
            row.className = "uw-row";
            const checked = isEnabled(tool, cfg);
            const cssTag = tool.css ? ' <span style="opacity:.5;font-size:10px;">[css]</span>' : "";
            row.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""} data-id="${tool.id}"><span>${tool.id}${cssTag}</span>`;
            body.appendChild(row);
        });

        body.addEventListener("change", function(e){
            if (e.target.matches("input[type=checkbox]")) {
                const id = e.target.dataset.id;
                const newCfg = loadConfig();
                newCfg[id] = e.target.checked;
                saveConfig(newCfg);
            }
        });

        const minBtn = panel.querySelector("#uw-loader-min");
        let collapsed = false;
        minBtn.addEventListener("click", function(){
            collapsed = !collapsed;
            body.style.display = collapsed ? "none" : "block";
            panel.querySelector(".uw-hint").style.display = collapsed ? "none" : "block";
            minBtn.textContent = collapsed ? "+" : "—";
        });

        const closeBtn = panel.querySelector("#uw-loader-close");
        closeBtn.addEventListener("click", function(){
            panel.style.display = "none";
        });

        const dragHandle = panel.querySelector("#uw-loader-drag");
        let dragging = false, offX = 0, offY = 0;
        dragHandle.addEventListener("mousedown", function(e){
            if (e.target.classList.contains("uw-btn")) return;
            dragging = true;
            const rect = panel.getBoundingClientRect();
            offX = e.clientX - rect.left;
            offY = e.clientY - rect.top;
        });
        document.addEventListener("mousemove", function(e){
            if (!dragging) return;
            panel.style.left = (e.clientX - offX) + "px";
            panel.style.top = (e.clientY - offY) + "px";
            panel.style.bottom = "auto";
            panel.style.right = "auto";
        });
        document.addEventListener("mouseup", function(){ dragging = false; });
    }

    const initialConfig = loadConfig();
    const pvpGuardTool = TOOLS.find(tool => tool.id === "排名戰重複配對攔截");
    if (pvpGuardTool && isEnabled(pvpGuardTool, initialConfig)) installPvpSocketTap();
    loadEnabledTools();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildPanel);
    } else {
        buildPanel();
    }
})();
