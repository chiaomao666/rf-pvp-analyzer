// fix_aria_hidden.js - antd 彈窗關閉時，容器被標上 aria-hidden 但裡面還留著焦點／可聚焦元素，
// 瀏覽器會一直吐「Blocked aria-hidden on an element because its descendant retained focus」的警告。
// 這支把那些容器裡的 tabindex="0" 關掉，並把焦點移出去。
//
// 2026-08-19：從 index.html 的內嵌 <script> 外移成獨立工具（原本的 index.html 備份在 index_20260818.html）。
//
//   舊版問題（在 index.html 裡）：
//     observe(document.body, { subtree:true, childList:true, attributes:true })
//     沒有 attributeFilter，React 改任何 style/class 都會觸發；callback 又對整份文件跑
//     querySelectorAll，而且裡面的 setAttribute 會再產生 attribute mutation 餵回自己。
//     動畫期間等於每幀做數十次全文件查詢，是主執行緒最大的負擔來源，
//     而且寫死在 HTML 裡，沒辦法從小工具管理器關掉來排查。
//
//   現在：改用 UWSched 的共用 observer，只申請 aria-hidden 這一個屬性，
//   每幀合併一次，而且只處理「變動到的那個節點」，不再重掃整份文件。
console.log("[ARIA] 啟動外部副程式：aria-hidden 焦點修正已載入");

(function () {
    "use strict";

    // 把單一容器內殘留的可聚焦元素關掉，並把焦點移出去
    function fixOne(el) {
        if (!el || el.nodeType !== 1 || !el.isConnected) return;
        if (el.getAttribute("aria-hidden") !== "true") return;

        if (el.getAttribute("tabindex") === "0") {
            el.setAttribute("tabindex", "-1");
        }
        // 查詢範圍只有這個容器，不是整份文件
        el.querySelectorAll('[tabindex="0"]').forEach(function (child) {
            child.setAttribute("tabindex", "-1");
        });

        const active = document.activeElement;
        if (active && active !== document.body && el.contains(active)) {
            active.blur();
        }
    }

    function start() {
        if (!window.UWSched) {
            console.warn("[ARIA] 找不到 UWSched，aria-hidden 修正停用");
            return;
        }

        window.UWSched.register({
            id: "fix_aria_hidden",
            attrs: ["aria-hidden"],

            // aria-hidden 屬性被改動：只處理那個節點
            onAttr: function (changes) {
                for (let i = 0; i < changes.length; i++) fixOne(changes[i].target);
            },

            // 新增的子樹本身就可能帶著 aria-hidden，查詢範圍只限這棵子樹
            onNodes: function (nodes) {
                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    if (!node.isConnected) continue;
                    if (node.getAttribute("aria-hidden") === "true") fixOne(node);
                    node.querySelectorAll('[aria-hidden="true"]').forEach(fixOne);
                }
            }
        });

        // 啟動時補掃一次，涵蓋這支腳本執行前就已存在的節點
        document.querySelectorAll('[aria-hidden="true"]').forEach(fixOne);

        console.log("[ARIA] 監聽已啟動");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
