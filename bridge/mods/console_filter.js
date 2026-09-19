// console_filter.js - 過濾遊戲主程式的 debug log
//
// 背景（見 docs/rf_mod_v3_performance_analysis.md 發現 1）：
//   v2.28 的 bundle 是 log 已剝除的 production build，只有 21 個 console.* 呼叫；
//   v3.00 / v3.01 是保留完整 debug log 的 build，同一計數方式下有 1169 個。
//   其中好幾處落在高頻路徑上：
//     lib/DCContext.js:1456   每則廣播印出完整 payload
//     lib/DCContext.js:754    每則回應印出完整 payload
//     pages/attacks/Attackmap.js:423  每次 cities 更新，對 271 個城鎮各印一次完整物件
//     pages/unionbattle/Nationbattle.js:268/302  國戰期間高頻
//
//   成本有兩塊：
//     CPU    —— 物件要被序列化準備給 DevTools，開著 DevTools 還要建 console 的 DOM
//     記憶體 —— console 會保留被印出物件的參照，payload 因此無法被 GC。
//               README_PERFORMANCE.txt 第 39-41 行記錄過同一個機制（uw_hook 吃掉數百 MB）。
//               而記憶體壓力會直接變成斷線：Phoenix heartbeat 30 秒沒回應就 abnormalClose。
//
// 這支做什麼：
//   把 console.log / info / debug 換成一個很便宜的過濾函式，只放行「已知 mod 標籤」開頭的訊息。
//   warn / error 一律保留，不受模式影響 —— 排查問題時看得到真正的錯誤。
//
// 這支不做什麼（重要，不要誤解它的效果）：
//   它**消不掉參數求值**。像 Nationbattle.js:302 的 console.log('...', { ...battleData })
//   那個物件展開在呼叫發生前就已經配置出來了，本工具攔不到。
//   它消掉的是序列化、DevTools DOM 與物件參照保留 —— 也就是記憶體那一半，
//   以及 CPU 的大部分。要根治參數求值只能改 bundle。
//
// 載入位置：TOOLS 的第一項。loader.js 保證遊戲主程式排在所有工具之後，
//   所以這裡安裝的過濾器一定早於 bundle 第一行執行。放在 TOOLS 而不是 CORE
//   是為了能從小工具管理器直接開關（CORE 不會出現在面板上）。
//
// Console API：
//   RFConsole.setMode("mods")     只放行 mod 訊息（預設）
//   RFConsole.setMode("all")      全部放行，等於停用過濾
//   RFConsole.setMode("silent")   全部丟棄（warn / error 仍保留）
//   RFConsole.stats()             看放行／丟棄各幾筆
//   RFConsole.raw.log(...)        繞過過濾直接印
//   模式存在 localStorage 的 rf_console_mode，改完立即生效，不必重整。

(function () {
    "use strict";

    var STORAGE_KEY = "rf_console_mode";
    var DEFAULT_MODE = "mods";
    var MODES = { mods: 1, all: 1, silent: 1 };

    // 各工具的 log 標籤，取自 app-release/assets/mods 現有的 console 呼叫。
    // 新增工具時如果用了新標籤，記得加進來，否則它的訊息會在 mods 模式下被吃掉。
    var TAGS = {
        "[LOADER]": 1, "[SCHED]": 1, "[PANEL]": 1, "[STORE]": 1,
        "[ARIA]": 1, "[LVCAP]": 1, "[POWER]": 1, "[PVPINFO]": 1,
        "[REWARD]": 1, "[ACCOUNT]": 1, "[UW]": 1,
        "[RF Audio]": 1, "[Custom System]": 1, "[Custom AttackMap]": 1,
        "[CONSOLE]": 1
    };

    var raw = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        debug: console.debug.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console)
    };

    var mode = DEFAULT_MODE;
    try {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved && MODES[saved]) mode = saved;
    } catch (e) { /* 無痕視窗等情況讀不到，用預設值 */ }

    var kept = 0;
    var dropped = 0;

    // 熱路徑：每一次 console.log 都會走這裡，必須保持極便宜。
    // 只做「型別檢查 → 首字元是不是 '[' → 取到 ']' 為止查表」，不做正規表示式。
    function isModMessage(first) {
        if (typeof first !== "string") return false;
        if (first.charCodeAt(0) !== 91) return false;   // '['
        var end = first.indexOf("]");
        if (end < 1) return false;
        return TAGS[first.slice(0, end + 1)] === 1;
    }

    function make(name) {
        return function () {
            if (mode === "all") {
                kept++;
                raw[name].apply(null, arguments);
                return;
            }
            if (mode === "mods" && arguments.length && isModMessage(arguments[0])) {
                kept++;
                raw[name].apply(null, arguments);
                return;
            }
            dropped++;
        };
    }

    console.log = make("log");
    console.info = make("info");
    console.debug = make("debug");
    // warn / error 刻意不動：排查問題時必須看得到。

    window.RFConsole = {
        raw: raw,
        mode: function () { return mode; },
        setMode: function (m) {
            if (!MODES[m]) {
                raw.warn("[CONSOLE] 未知模式：" + m + "（可用：mods / all / silent）");
                return mode;
            }
            mode = m;
            try { localStorage.setItem(STORAGE_KEY, m); } catch (e) { /* 忽略 */ }
            raw.log("[CONSOLE] 模式改為 " + m);
            return mode;
        },
        stats: function () {
            return { mode: mode, kept: kept, dropped: dropped };
        },
        reset: function () { kept = 0; dropped = 0; }
    };

    raw.log("[CONSOLE] 遊戲 log 過濾已啟動，模式 " + mode +
            "（RFConsole.setMode('all') 可全部放行，RFConsole.stats() 看統計）");
})();
