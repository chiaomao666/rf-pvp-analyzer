// pvp_opponent_persist.js - PVP 戰鬥開始時雙方名字/組織只顯示幾秒，容易來不及看
// 做法：偵測到開門動畫裡的文字出現時，把文字內容抓出來，
// 用一個簡單的小面板固定顯示在畫面上方，直到這場戰鬥畫面關閉才移除
//
// 2026-08-18 效能改寫（原版備份在 pvp_opponent_persist_20260818.js）
//   舊版每偵測到一個新增元素就排一個 setTimeout，每個 timer 又做 4 次
//   `Array.from(document.querySelectorAll("div"))` 全文件掃描。戰鬥動畫一秒新增
//   數百個元素，等於同時堆著數百個 pending timer 各自掃全 DOM，是「點擊出戰後卡住」
//   的主要來源。
//   三項修正：
//     1. 全域只用一個 debounce timer，不再 per-node 排程
//     2. 查詢範圍限縮在戰鬥根容器內，且改用前綴選擇器直接命中，不再列舉所有 div
//     3. 不在戰鬥畫面時完全不排程、不查詢（用快取的根節點判斷，零 querySelector 成本）
console.log("[PVPINFO] 啟動外部副程式：對手資訊常駐顯示已載入");

(function(){
    const ROOT_PREFIX = "PvpBattle_rootContainer";
    const ROOT_SELECTOR = '[class*="PvpBattle_rootContainer"]';
    // Title1 = 玩家名稱（大字）、Title2 = 組織名稱（小字），左邊自己/右邊對手
    const LEFT_TITLE1 = '[class*="AniDoor_leftTitle1_"]';   // 自己：玩家名稱
    const LEFT_TITLE2 = '[class*="AniDoor_leftTitle2_"]';   // 自己：組織名稱
    const RIGHT_TITLE1 = '[class*="AniDoor_rightTitle1_"]'; // 對手：玩家名稱
    const RIGHT_TITLE2 = '[class*="AniDoor_rightTitle2_"]'; // 對手：組織名稱
    const PERSIST_ID = "uw-pvp-name-persist";
    const CAPTURE_DELAY = 300; // 文字渲染需要一點時間，稍微等一下再抓

    let persistedEl = null;
    let lastKey = "";
    let battleRoot = null;   // 快取目前這場戰鬥的根節點
    let captureTimer = null; // 全域只有這一個，不會累積

    function hasPrefix(el, prefix){
        return el && el.className && typeof el.className === "string" &&
               el.className.split(/\s+/).some(c => c.indexOf(prefix) === 0);
    }

    // 只在戰鬥根容器內找，而且直接用前綴選擇器命中，不列舉所有 div
    function findText(root, selector){
        const el = root.querySelector(selector);
        return el ? el.textContent.trim() : "";
    }

    function removePersisted(){
        if (persistedEl) {
            persistedEl.remove();
            persistedEl = null;
        }
        lastKey = "";
    }

    function makeColumn(orgText, nameText, align){
        const col = document.createElement("div");
        Object.assign(col.style, {
            display: "flex",
            flexDirection: "column",
            alignItems: align === "right" ? "flex-end" : "flex-start",
            lineHeight: "1.25"
        });
        const org = document.createElement("div");
        org.textContent = orgText || "";
        Object.assign(org.style, { fontSize: "11px", opacity: "0.75", fontWeight: "normal" });
        const name = document.createElement("div");
        name.textContent = nameText || "?";
        Object.assign(name.style, { fontSize: "17px", fontWeight: "bold" });
        col.appendChild(org);
        col.appendChild(name);
        return col;
    }

    function ensurePanel(){
        if (persistedEl) return persistedEl;
        const box = document.createElement("div");
        box.id = PERSIST_ID;
        Object.assign(box.style, {
            position: "fixed",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "999999",
            pointerEvents: "none",
            padding: "8px 20px",
            background: "rgba(0,0,0,0.55)",
            borderRadius: "6px",
            color: "#fff",
            fontFamily: "sans-serif",
            textShadow: "0 0 4px #000",
            display: "flex",
            gap: "18px",
            alignItems: "center"
        });
        document.body.appendChild(box);
        persistedEl = box;
        return box;
    }

    function renderNames(leftOrg, leftName, rightOrg, rightName){
        if (!leftName && !rightName) return;
        const key = [leftOrg, leftName, rightOrg, rightName].join("|");
        if (key === lastKey) return; // 沒變化，不用重畫
        lastKey = key;

        const box = ensurePanel();
        box.textContent = "";

        const leftCol = makeColumn(leftOrg, leftName, "left");
        const vs = document.createElement("span");
        vs.textContent = "VS";
        vs.style.opacity = "0.6";
        vs.style.fontSize = "12px";
        const rightCol = makeColumn(rightOrg, rightName, "right");
        rightCol.style.color = "#ffb3b3";

        box.appendChild(leftCol);
        box.appendChild(vs);
        box.appendChild(rightCol);
    }

    function tryCapture(){
        if (!battleRoot || !battleRoot.isConnected) return;
        const leftName = findText(battleRoot, LEFT_TITLE1);
        const leftOrg = findText(battleRoot, LEFT_TITLE2);
        const rightName = findText(battleRoot, RIGHT_TITLE1);
        const rightOrg = findText(battleRoot, RIGHT_TITLE2);
        if (leftName || rightName) {
            renderNames(leftOrg, leftName, rightOrg, rightName);
        }
    }

    // 全域單一 timer：已經排過就不再排，不會隨新增節點數量成長
    function scheduleCapture(){
        if (captureTimer !== null) return;
        captureTimer = setTimeout(function(){
            captureTimer = null;
            tryCapture();
        }, CAPTURE_DELAY);
    }

    function cancelCapture(){
        if (captureTimer === null) return;
        clearTimeout(captureTimer);
        captureTimer = null;
    }

    // 2026-08-19：改向 UWSched 登記，不再自己 new MutationObserver。
    //
    // 這支刻意**不設 anchor**：它的判斷依據就是戰鬥根容器，若拿根容器當 anchor，
    // 戰鬥結束、根容器消失的那一幀會被閘門擋掉，常駐面板就永遠收不掉。
    // 改成由 onRemoved 負責收尾（onRemoved 不受 anchor 與戰鬥閘門影響）。
    // 不在戰鬥畫面時，下面兩個 callback 只是走訪本幀節點做字串比對，成本很低。
    function onRemoved(nodes){
        let rootRemoved = false;
        for (const node of nodes) {
            if (hasPrefix(node, ROOT_PREFIX)) { rootRemoved = true; break; }
        }
        // 根容器被整個祖先帶走時不會自己出現在 removedNodes，靠 isConnected 兜底
        if (!rootRemoved && battleRoot && !battleRoot.isConnected) rootRemoved = true;
        if (!rootRemoved) return;

        battleRoot = null;
        cancelCapture();     // 戰鬥畫面關閉，收掉常駐顯示
        removePersisted();
    }

    function onNodes(nodes){
        for (const node of nodes) {
            if (hasPrefix(node, ROOT_PREFIX)) {
                battleRoot = node;
                removePersisted();   // 新一場戰鬥開始，先清掉上一場殘留的
            }
        }
        if (!battleRoot || !battleRoot.isConnected) return;
        scheduleCapture();
    }

    function start(){
        if (!window.UWSched) {
            console.warn("[PVPINFO] 找不到 UWSched，對手資訊常駐顯示停用");
            return;
        }

        battleRoot = document.querySelector(ROOT_SELECTOR); // 若腳本在戰鬥中才載入

        window.UWSched.register({
            id: "pvp_opponent_persist",
            onNodes: onNodes,
            onRemoved: onRemoved
        });

        if (battleRoot) scheduleCapture();
        console.log("[PVPINFO] 監聽已啟動");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
