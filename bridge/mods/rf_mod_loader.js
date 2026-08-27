// loader.js - 統一管理所有小工具的載入
// assets/index.html 只需要掛這一支；所有 mod 檔案固定放在 assets/mods/。
console.log("[LOADER] 小工具載入器啟動");

(function(){
    // ---- 在這裡集中管理所有小工具 ----
    const TOOLS = [
        // 固定位置：assets/mods/rf_pvp_backend_config.js；必須最先載入，讓守衛初始化前取得 Worker 設定。
        { id: "RF PVP Worker 連線設定",
            src: "./mods/rf_pvp_backend_config.js",
            css: null,
            enabled: true
        },
        { id: "PVP Socket 被動觀察器",
            src: "./mods/rf_pvp_socket_tap.js",
            css: null,
            enabled: true
        },
        { id: "排名戰重複配對攔截",
            src: "./mods/pvp_double_match_guard.js",
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

    function injectScript(tool){
        if (!tool.src) return Promise.resolve();
        return new Promise((resolve) => {
            const s = document.createElement("script");
            s.src = tool.src + "?v=" + Date.now();
            s.async = false;
            s.dataset.uwTool = tool.id;
            s.onload = () => {
                console.log("[LOADER] 已載入 JS：" + tool.id);
                resolve();
            };
            s.onerror = () => {
                console.error("[LOADER] 載入 JS 失敗：" + tool.id + "（" + s.src + "）");
                resolve();
            };
            document.head.appendChild(s);
            console.log("[LOADER] 載入 JS：" + tool.id);
        });
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

    async function loadEnabledTools(){
        const cfg = loadConfig();
        for (const tool of TOOLS) {
            if (!isEnabled(tool, cfg)) continue;
            if (tool.css) injectStyle(tool);
            if (tool.src) await injectScript(tool);
        }
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

    void loadEnabledTools();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildPanel);
    } else {
        buildPanel();
    }
})();
