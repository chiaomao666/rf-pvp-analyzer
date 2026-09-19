// show_level_cap.js - 把角色卡片等級顯示從「N」補回「N/上限」
// 做法：畫面 DOM 裡已經沒有 level_cap 這個文字了（main.js 被改過，不渲染上限）
// 所以改成從該元素對應的 React Fiber 往上找，把原始資料物件（含 level / level_cap）撈出來
//
// 2026-08-18 效能改寫：前綴選擇器 + rAF 合併 + getComputedStyle 只呼叫一次
//                      （原版備份在 show_level_cap_20260818.js）
// 2026-08-19 改用共用排程器（改寫前備份在 show_level_cap_20260819.js）
//   - 不再自己 new MutationObserver，改向 UWSched 登記
//   - anchor 閘門：畫面上沒有角色卡片時整支跳過
//   - fiber 走訪改用 RFStore.findData，不再和 restore_power_display.js 各留一份
//
//   註：characterData 監聽**保留**（向 UWSched 申請 text: true）。
//   React 對單一文字子節點的更新走的是 `firstChild.nodeValue = text`（characterData）
//   而不是 childList，拿掉的話等級變動時畫面會停在舊值。
//   它的處理很輕（一次字串比對），排程器也是同步派發，不影響效能。
console.log("[LVCAP] 啟動外部副程式：等級上限還原器已載入");

(function(){
    const CLASS_PREFIX = "Actorcard_actorLv_";
    const TARGET_SELECTOR = '[class*="Actorcard_actorLv_"]'; // 不會誤中 Actorcard_actorLvBar__（Lv 後面接的是 B 不是 _）
    const ANCHOR_SELECTOR = '[class*="Actorcard_actorBox__"]';
    const ALREADY_LEVEL_ONLY = /^\d+$/;          // 目前畫面上：純數字，沒有斜線
    const ALREADY_HAS_CAP = /^\d+\s*\/\s*\d+$/;   // 已經是 N/上限 格式，不用再處理

    // 補回上限後文字會變長，容易蓋到旁邊的位置代號 —— 稍微縮小字體讓總寬度不要超出原本範圍
    // 數字越小代表縮得越多，可以自己微調這個比例
    const CAP_FONT_SCALE = 0.72;

    function hasTargetClass(el){
        return el && el.className && typeof el.className === "string" &&
               el.className.indexOf(CLASS_PREFIX) >= 0 &&   // 先做便宜的字串比對再切字串
               el.className.split(/\s+/).some(c => c.indexOf(CLASS_PREFIX) === 0);
    }

    function isActorData(val){
        return "level" in val && "level_cap" in val;
    }

    function patchNode(el){
        const text = (el.textContent || "").trim();
        if (ALREADY_HAS_CAP.test(text)) return; // 已經補過了
        if (!ALREADY_LEVEL_ONLY.test(text)) return; // 不是單純數字，可能還沒渲染完成或格式不符，跳過

        // hooks: true —— 有些元件把角色資料放在 hook state 而不是 props
        const data = window.RFStore.findData(el, isActorData, { hooks: true });
        if (!data) return;

        const cap = data.level_cap;
        if (cap === undefined || cap === null) return;

        // getComputedStyle 會強制樣式重算，只在還沒記下原始字級時才呼叫一次
        if (!el.dataset.uwOrigFontSize) {
            el.dataset.uwOrigFontSize = parseFloat(window.getComputedStyle(el).fontSize) || 16;
        }
        el.style.fontSize = (parseFloat(el.dataset.uwOrigFontSize) * CAP_FONT_SCALE) + "px";
        el.style.whiteSpace = "nowrap";
        // v3.0 使用 FitText 子元件；保留 React 管理的元素，只改文字節點。
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let textNode;
        while ((textNode = walker.nextNode())) {
            if (ALREADY_LEVEL_ONLY.test(textNode.nodeValue.trim())) {
                textNode.nodeValue = data.level + "/" + cap;
                break;
            }
        }
    }

    // 只在目標節點上動作，不再列舉整棵子樹的所有 div
    function scan(root){
        if (!root || (root.nodeType !== 1 && root.nodeType !== 9)) return;
        if (root.nodeType === 1 && hasTargetClass(root)) patchNode(root);
        if (!root.querySelectorAll) return;
        root.querySelectorAll(TARGET_SELECTOR).forEach(el => {
            if (hasTargetClass(el)) patchNode(el);
        });
    }

    function start(){
        if (!window.RFStore || !window.RFStore.findData) {
            console.warn("[LVCAP] 找不到 RFStore.findData，上限還原停用");
            return;
        }
        if (!window.UWSched) {
            console.warn("[LVCAP] 找不到 UWSched，上限還原停用");
            return;
        }

        window.UWSched.register({
            id: "show_level_cap",
            anchor: ANCHOR_SELECTOR,   // 沒有角色卡片的頁面整支跳過
            text: true,                // 需要 characterData，見檔頭說明

            onNodes: function (nodes) {
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].isConnected) scan(nodes[i]);
                }
            },

            // 文字被 React 就地改寫時，把上限補回去
            onText: function (parent) {
                const target = parent && parent.closest && parent.closest(TARGET_SELECTOR);
                if (target) patchNode(target);
            }
        });

        scan(document);
        console.log("[LVCAP] 上限還原監聽已啟動");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
