// uw_panel.js - 小工具浮動視窗共用外殼
//
// 三段狀態：
//   展開 ──點 —──▶ 收合(只剩標題列) ──點標題列──▶ 貼邊(直書標籤)
//     ▲                                              │
//     └───────────────── 點標籤 ◀────────────────────┘
//
// 貼邊時整個視窗滑出畫面，只留邊緣一條直書標籤，不會擋到遊戲畫面。
// 同一側的多個標籤會沿著邊緣往下堆疊，不互相遮蔽。
//
// 用法：
//   const panel = UWPanel.create({ id: "uw_hook", title: "[UW] 側錄面板", side: "right" });
//   panel.body.appendChild(myContent);
//
// 這支是共用基礎模組，由 loader.js 的 CORE 清單載入，不可在管理面板關閉。
console.log("[PANEL] 共用面板外殼已載入");

(function () {
    "use strict";

    if (window.UWPanel) return;

    const STORAGE_KEY = "uw_panel_state_v1";
    const VISIBLE_KEY = "uw_panels_visible";   // 臨時覆寫總開關用
    const STATES = ["expanded", "collapsed", "docked"];
    const DRAG_THRESHOLD = 4;   // 位移小於這個距離就當成點擊，不算拖曳
    const TAB_BASE_TOP = 0.15;  // 標籤起始高度（視窗高度比例）
    const TAB_GAP = 6;          // 標籤之間的間距(px)
    const CASCADE = 44;         // 同側面板預設位置的錯開距離(px)

    const panels = [];

    // ---- 狀態保存 ----
    function loadAll() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            return raw && typeof raw === "object" ? raw : {};
        } catch (e) {
            return {};
        }
    }

    function loadOne(id) {
        const saved = loadAll()[id];
        return saved && typeof saved === "object" ? saved : {};
    }

    function saveOne(id, patch) {
        try {
            const all = loadAll();
            all[id] = Object.assign({}, all[id], patch);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch (e) {
            console.warn("[PANEL] 狀態儲存失敗", e);
        }
    }

    // ---- 邊緣標籤堆疊 ----
    // 只在狀態切換／視窗大小改變時重算，不做輪詢，避免無謂的強制重排
    function layoutTabs() {
        ["left", "right"].forEach(function (side) {
            let top = window.innerHeight * TAB_BASE_TOP;
            panels.forEach(function (panel) {
                if (panel.side !== side) return;
                if (panel.state !== "docked") return;
                panel.tab.style.top = top + "px";
                top += panel.tab.offsetHeight + TAB_GAP;
            });
        });
    }

    function clampPosition(root, left, top) {
        const maxLeft = Math.max(0, window.innerWidth - root.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - root.offsetHeight);
        return {
            left: Math.min(maxLeft, Math.max(0, left)),
            top: Math.min(maxTop, Math.max(0, top))
        };
    }

    function stripBrackets(text) {
        return String(text).replace(/^[\[［]|[\]］]$/g, "").trim() || String(text);
    }

    // ---- 浮動視窗總開關 ----
    // 預設值來自 loader.js 的 SHOW_PANELS（透過 window.UW_SHOW_PANELS 傳過來）。
    // localStorage 的 uw_panels_visible 優先，方便在 Console 臨時開關而不用改檔案。
    function isVisible() {
        try {
            const saved = localStorage.getItem(VISIBLE_KEY);
            if (saved === "1") return true;
            if (saved === "0") return false;
        } catch (e) {}
        return window.UW_SHOW_PANELS === true;
    }

    // on = true / false 臨時覆寫，null 或 undefined 則清掉覆寫回到 loader.js 的預設值
    function setVisible(on) {
        try {
            if (on === null || on === undefined) {
                localStorage.removeItem(VISIBLE_KEY);
            } else {
                localStorage.setItem(VISIBLE_KEY, on ? "1" : "0");
            }
        } catch (e) {
            console.warn("[PANEL] 總開關儲存失敗", e);
        }
        console.log("[PANEL] 浮動視窗設定已變更，重新整理頁面後生效（目前：" +
            (isVisible() ? "顯示" : "隱藏") + "）");
    }

    function create(options) {
        const opts = options || {};
        const id = opts.id;
        if (!id) throw new Error("UWPanel.create 需要 id");

        // 總開關關閉時完全不建立 DOM，直接回傳 null。
        // 所有呼叫端都有 `if (!panel) return;`，工具本身的功能不受影響。
        if (!isVisible()) return null;

        const existing = document.getElementById("uw-panel--" + id);
        if (existing) {
            console.warn("[PANEL] 面板已存在：" + id);
            return null;
        }

        const side = opts.side === "left" ? "left" : "right";
        const saved = loadOne(id);

        const root = document.createElement("section");
        root.className = "uw-panel";
        root.id = "uw-panel--" + id;
        root.dataset.uwSide = side;
        root.setAttribute("aria-label", opts.ariaLabel || stripBrackets(opts.title || id));
        if (opts.width) root.style.width = opts.width;

        const head = document.createElement("div");
        head.className = "uw-panel-head";

        const title = document.createElement("b");
        title.className = "uw-panel-title";
        title.textContent = opts.title || id;

        const min = document.createElement("span");
        min.className = "uw-panel-min";
        min.setAttribute("role", "button");
        min.setAttribute("tabindex", "0");

        head.appendChild(title);
        head.appendChild(min);

        const body = document.createElement("div");
        body.className = "uw-panel-body";

        root.appendChild(head);
        root.appendChild(body);

        let hint = null;
        if (opts.hint) {
            hint = document.createElement("div");
            hint.className = "uw-panel-hint";
            hint.textContent = opts.hint;
            root.appendChild(hint);
        }

        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "uw-panel-tab";
        tab.dataset.uwSide = side;
        tab.textContent = opts.tabTitle || stripBrackets(opts.title || id);

        document.body.appendChild(root);
        document.body.appendChild(tab);

        const handle = {
            id: id,
            side: side,
            root: root,
            head: head,
            body: body,
            tab: tab,
            state: "collapsed",
            lastState: "collapsed"
        };
        panels.push(handle);

        // ---- 預設位置：同側面板依序往上錯開，避免一開始就疊在一起 ----
        const sameSideBefore = panels.filter(function (p) {
            return p !== handle && p.side === side;
        }).length;

        if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
            root.style.left = saved.left + "px";
            root.style.top = saved.top + "px";
        } else {
            root.style.bottom = (14 + sameSideBefore * CASCADE) + "px";
            root.style[side] = "14px";
        }

        // ---- 狀態切換 ----
        function applyState(next, persist) {
            const state = STATES.indexOf(next) >= 0 ? next : "collapsed";
            if (state !== "docked") handle.lastState = state;
            handle.state = state;

            root.dataset.uwState = state;
            tab.dataset.uwVisible = state === "docked" ? "1" : "0";

            min.textContent = state === "expanded" ? "—" : "+";
            min.setAttribute("aria-label", state === "expanded" ? "收合" : "展開");
            head.title = state === "collapsed" ? "點一下收到側邊" : "";
            tab.title = "點一下叫回面板";

            if (persist !== false) saveOne(id, { state: state, lastState: handle.lastState });
            layoutTabs();
        }

        min.addEventListener("click", function (event) {
            event.stopPropagation();
            applyState(handle.state === "expanded" ? "collapsed" : "expanded");
        });

        min.addEventListener("keydown", function (event) {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            applyState(handle.state === "expanded" ? "collapsed" : "expanded");
        });

        tab.addEventListener("click", function () {
            applyState(handle.lastState === "expanded" ? "expanded" : "collapsed");
        });

        // ---- 拖曳（拖不動就當成點擊 → 收到側邊）----
        let drag = null;

        head.addEventListener("pointerdown", function (event) {
            if (event.target.closest(".uw-panel-min")) return;
            const rect = root.getBoundingClientRect();
            drag = {
                pointerId: event.pointerId,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
                startX: event.clientX,
                startY: event.clientY,
                moved: false
            };
            head.setPointerCapture(event.pointerId);
            event.preventDefault();
        });

        head.addEventListener("pointermove", function (event) {
            if (!drag || drag.pointerId !== event.pointerId) return;
            if (!drag.moved) {
                const dx = Math.abs(event.clientX - drag.startX);
                const dy = Math.abs(event.clientY - drag.startY);
                if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
                drag.moved = true;
            }
            const next = clampPosition(root, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
            root.style.left = next.left + "px";
            root.style.top = next.top + "px";
            root.style.right = "auto";
            root.style.bottom = "auto";
        });

        function finishDrag(event) {
            if (!drag || drag.pointerId !== event.pointerId) return;
            const wasDrag = drag.moved;
            drag = null;
            if (wasDrag) {
                const rect = root.getBoundingClientRect();
                saveOne(id, { left: rect.left, top: rect.top });
            } else if (handle.state === "collapsed") {
                applyState("docked");
            }
        }

        head.addEventListener("pointerup", finishDrag);
        head.addEventListener("pointercancel", finishDrag);

        applyState(STATES.indexOf(saved.state) >= 0 ? saved.state : (opts.defaultState || "collapsed"), false);
        if (STATES.indexOf(saved.lastState) >= 0 && saved.lastState !== "docked") {
            handle.lastState = saved.lastState;
        }

        handle.getState = function () {
            return handle.state;
        };
        handle.setState = function (state) {
            applyState(state);
        };
        handle.setTitle = function (text) {
            title.textContent = text;
        };
        handle.setTabTitle = function (text) {
            tab.textContent = text;
            layoutTabs();
        };
        handle.remove = function () {
            const index = panels.indexOf(handle);
            if (index >= 0) panels.splice(index, 1);
            root.remove();
            tab.remove();
            layoutTabs();
        };

        return handle;
    }

    // 樣式表可能比第一次 layoutTabs 晚到，載入完成後再排一次
    window.addEventListener("load", layoutTabs);

    window.addEventListener("resize", function () {
        panels.forEach(function (panel) {
            if (panel.root.style.left === "" || panel.root.style.left === "auto") return;
            const next = clampPosition(
                panel.root,
                parseFloat(panel.root.style.left) || 0,
                parseFloat(panel.root.style.top) || 0
            );
            panel.root.style.left = next.left + "px";
            panel.root.style.top = next.top + "px";
        });
        layoutTabs();
    });

    window.UWPanel = {
        version: 2,
        create: create,
        layoutTabs: layoutTabs,
        isVisible: isVisible,
        setVisible: setVisible
    };

    if (!isVisible()) {
        console.log("[PANEL] 浮動視窗總開關為關閉，所有面板不建立。" +
            "要暫時打開請執行 UWPanel.setVisible(true) 後重新整理，" +
            "或改 loader.js 的 SHOW_PANELS。");
    }

    document.dispatchEvent(new CustomEvent("uw-panel-ready"));
})();
