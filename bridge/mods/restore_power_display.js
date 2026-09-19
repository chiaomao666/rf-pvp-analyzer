// restore_power_display.js - 在角色卡片上補回「戰力」數字覆蓋層
// main.js 恢復成官方原版（不含戰力覆蓋層）之後，靠這支外掛腳本從外部把它加回來
// 做法：找到角色卡片外框(actorBox)，透過 React Fiber 找到該卡片對應的角色資料，
// 讀出 team.power，動態插入一個顯示用的 div（樣式跟原本寫死在 main.js 裡的版本一致）
//
// 2026-08-18 效能改寫：前綴選擇器 + rAF 合併（原版備份在 restore_power_display_20260818.js）
// 2026-08-19 改用共用排程器（改寫前備份在 restore_power_display_20260819.js）
//   - 不再自己 new MutationObserver，改向 UWSched 登記
//   - anchor 閘門：畫面上沒有角色卡片時整支跳過（大部分頁面都不會有）
//   - fiber 走訪改用 RFStore.findData，不再和 show_level_cap.js 各留一份
console.log("[POWER] 啟動外部副程式：戰力顯示還原器已載入");

(function(){
    const CLASS_PREFIX = "Actorcard_actorBox__";
    const TARGET_SELECTOR = '[class*="Actorcard_actorBox__"]';
    const MARK_ATTR = "uwPowerOverlay";

    function hasTargetClass(el){
        return el && el.className && typeof el.className === "string" &&
               el.className.indexOf(CLASS_PREFIX) >= 0 &&   // 先做便宜的字串比對再切字串
               el.className.split(/\s+/).some(c => c.indexOf(CLASS_PREFIX) === 0);
    }

    // 往上找同時擁有 level 欄位、且帶 team 或 actor_prototype 欄位的資料物件（也就是原始碼裡的 A）
    function isActorData(val){
        return "level" in val && ("team" in val || "actor_prototype" in val);
    }

    function ensureOverlay(actorBoxEl){
        const data = window.RFStore.findData(actorBoxEl, isActorData);
        if (!data) return;

        const power = (data.team && data.team.power !== undefined) ? data.team.power : "0";

        let overlay = actorBoxEl.querySelector(":scope > [data-" + MARK_ATTR.replace(/([A-Z])/g, "-$1").toLowerCase() + "]");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.dataset[MARK_ATTR] = "1";
            Object.assign(overlay.style, {
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                color: "#ffffff",
                fontWeight: "bold",
                fontSize: "20px",
                textShadow: "0 0 6px #000",
                pointerEvents: "none",
                zIndex: "999"
            });
            actorBoxEl.appendChild(overlay);
        }
        overlay.textContent = power;
    }

    // 只在目標節點上動作，不再列舉整棵子樹的所有 div
    function scan(root){
        if (!root || (root.nodeType !== 1 && root.nodeType !== 9)) return;
        if (root.nodeType === 1 && hasTargetClass(root)) ensureOverlay(root);
        if (!root.querySelectorAll) return;
        root.querySelectorAll(TARGET_SELECTOR).forEach(el => {
            if (hasTargetClass(el)) ensureOverlay(el);
        });
    }

    function start(){
        if (!window.RFStore || !window.RFStore.findData) {
            console.warn("[POWER] 找不到 RFStore.findData，戰力顯示停用");
            return;
        }
        if (!window.UWSched) {
            console.warn("[POWER] 找不到 UWSched，戰力顯示停用");
            return;
        }

        window.UWSched.register({
            id: "restore_power_display",
            anchor: TARGET_SELECTOR,   // 沒有角色卡片的頁面整支跳過
            onNodes: function (nodes) {
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].isConnected) scan(nodes[i]);
                }
            }
        });

        scan(document);
        console.log("[POWER] 監聽已啟動");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
