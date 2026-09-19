// uw_sched.js - 共用 DOM 變動排程器（CORE）
//
// 由 loader.js 的 CORE 清單載入，不可在管理面板關閉。
//
// ---- 為什麼需要這支 ----
// 改寫前，每支工具各自 new MutationObserver 並 observe(document.documentElement, {subtree:true})，
// 全站同時掛著 8 個。React 每次 render，這 8 個 callback 全部各跑一遍，成本是相加的；
// 而且工具之間會互相觸發（restore_power_display 插入覆蓋層 → 其他 7 支的 callback 也被叫醒）。
//
// 這支把它們併成一個 observer：
//   1. 只走訪一次 MutationRecord，把新增／移除／屬性變動抽出來
//   2. requestAnimationFrame 合併，每幀最多派發一次
//   3. anchor 閘門：畫面上沒有該工具要處理的東西時，整支跳過（這是最大的省法）
//   4. pauseInBattle：PVP 戰鬥期間暫停非必要工具（戰鬥中 DOM 變動最密集）
//
// ---- 用法 ----
//   const handle = UWSched.register({
//       id: "show_level_cap",
//       anchor: '[class*="Actorcard_actorBox__"]', // 可選，畫面上沒有就整支跳過
//       pauseInBattle: true,                       // 可選，PVP 戰鬥期間暫停
//       attrs: ["aria-hidden"],                    // 可選，要監聽的屬性
//       text: true,                                // 可選，要監聽 characterData
//       onNodes(addedElements) {},                 // 每幀一次，本幀新增的元素節點
//       onRemoved(removedElements) {},             // 每幀一次，本幀移除的元素節點
//       onAttr(changes) {},                        // 每幀一次，[{target, name}]
//       onText(target) {}                          // 同步呼叫，characterData 的父元素
//   });
//   handle.unregister();
//
// 注意：
//   - onNodes 拿到的是「本幀新增的元素節點」，不含它們的子孫。要處理整棵子樹請自己
//     對每個節點做 querySelectorAll（範圍只有那棵子樹，成本很低）。
//   - onRemoved 不受 anchor 閘門影響（元素都被移除了，anchor 往往也跟著消失，
//     若照樣擋掉就沒機會做清理）。
//   - callback 丟出例外只會被記進 console，不會影響其他工具。
console.log("[SCHED] 共用 DOM 變動排程器已載入");

(function () {
    "use strict";

    if (window.UWSched) return;

    // 直通模式：改成 true 之後每支工具會退回自己一個 observer（行為與改寫前相同）。
    // 排程器若出問題可以用它快速排除是不是排程器造成的。
    const PASSTHROUGH = false;

    const BATTLE_SELECTOR = '[class*="PvpBattle_rootContainer"]';
    const PAGE_SELECTOR = '[class*="_rootContainer__"]';

    const subs = [];

    let observer = null;
    let observedText = false;
    let observedAttrs = [];   // 目前 observer 實際掛著的 attributeFilter

    let scheduled = false;
    let addedBuf = [];
    let removedBuf = [];
    let attrBuf = [];

    let frame = 0;            // 幀序號，用來讓同一幀內的查詢只做一次
    let battleFrame = -1;
    let battleActive = false;

    // ---- 每幀只查一次的共用判斷 ----
    function inBattle() {
        if (battleFrame === frame) return battleActive;
        battleFrame = frame;
        battleActive = Boolean(document.querySelector(BATTLE_SELECTOR));
        return battleActive;
    }

    function anchorPresent(sub) {
        if (!sub.anchor) return true;
        if (sub._anchorFrame === frame) return sub._anchorOk;
        sub._anchorFrame = frame;
        sub._anchorOk = Boolean(document.querySelector(sub.anchor));
        return sub._anchorOk;
    }

    // ---- observer 選項union：有工具需要才掛，避免無謂的 mutation 量 ----
    function wantedText() {
        return subs.some(function (s) { return s.text; });
    }

    function wantedAttrs() {
        const set = new Set();
        subs.forEach(function (s) {
            if (s.attrs) s.attrs.forEach(function (a) { set.add(a); });
        });
        return Array.from(set).sort();
    }

    function sameAttrs(a, b) {
        return a.length === b.length && a.every(function (v, i) { return v === b[i]; });
    }

    function collect(list) {
        for (let i = 0; i < list.length; i++) {
            const m = list[i];
            if (m.type === "attributes") {
                attrBuf.push({ target: m.target, name: m.attributeName });
                continue;
            }
            if (m.type === "characterData") {
                // characterData 的處理很輕（只有 parentElement + 字串比對），
                // 直接同步派發，不必等到下一幀，也避免文字節點被換掉後拿不到 parent
                const parent = m.target.parentElement;
                if (!parent) continue;
                for (let s = 0; s < subs.length; s++) {
                    const sub = subs[s];
                    if (!sub.onText) continue;
                    try { sub.onText(parent); }
                    catch (e) { console.warn("[SCHED] " + sub.id + " onText 發生錯誤", e); }
                }
                continue;
            }
            // childList
            for (let j = 0; j < m.addedNodes.length; j++) {
                const node = m.addedNodes[j];
                if (node.nodeType === 1) addedBuf.push(node);
            }
            for (let j = 0; j < m.removedNodes.length; j++) {
                const node = m.removedNodes[j];
                if (node.nodeType === 1) removedBuf.push(node);
            }
        }
    }

    function dispatch(added, removed, attrs) {
        frame++;
        for (let i = 0; i < subs.length; i++) {
            const sub = subs[i];
            try {
                // 移除通知不受 anchor / 戰鬥閘門影響，否則工具沒機會做清理
                if (sub.onRemoved && removed.length) sub.onRemoved(removed);

                if (sub.pauseInBattle && inBattle()) continue;
                if (!anchorPresent(sub)) continue;

                if (sub.onNodes && added.length) sub.onNodes(added);
                if (sub.onAttr && attrs.length) {
                    const mine = sub.attrs
                        ? attrs.filter(function (c) { return sub.attrs.indexOf(c.name) >= 0; })
                        : attrs;
                    if (mine.length) sub.onAttr(mine);
                }
                if (sub.onFrame) sub.onFrame();
            } catch (e) {
                console.warn("[SCHED] " + sub.id + " 發生錯誤", e);
            }
        }
    }

    function flush() {
        scheduled = false;
        const added = addedBuf;
        const removed = removedBuf;
        const attrs = attrBuf;
        addedBuf = [];
        removedBuf = [];
        attrBuf = [];
        if (!added.length && !removed.length && !attrs.length) return;
        dispatch(added, removed, attrs);
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(flush);
    }

    function ensureObserver() {
        const text = wantedText();
        const attrs = wantedAttrs();

        if (observer && text === observedText && sameAttrs(attrs, observedAttrs)) return;

        if (observer) observer.disconnect();
        observedText = text;
        observedAttrs = attrs;

        observer = new MutationObserver(function (list) {
            collect(list);
            if (addedBuf.length || removedBuf.length || attrBuf.length) schedule();
        });

        const options = { childList: true, subtree: true };
        if (text) options.characterData = true;
        if (attrs.length) {
            options.attributes = true;
            options.attributeFilter = attrs;
        }
        observer.observe(document.documentElement, options);
    }

    // ---- 直通模式：每支工具一個 observer，行為與改寫前相同 ----
    function registerPassthrough(sub) {
        let ptScheduled = false;
        let ptAdded = [];
        let ptRemoved = [];
        let ptAttrs = [];

        const ptObserver = new MutationObserver(function (list) {
            for (let i = 0; i < list.length; i++) {
                const m = list[i];
                if (m.type === "attributes") { ptAttrs.push({ target: m.target, name: m.attributeName }); continue; }
                if (m.type === "characterData") {
                    const parent = m.target.parentElement;
                    if (parent && sub.onText) {
                        try { sub.onText(parent); } catch (e) { console.warn("[SCHED] " + sub.id + " onText 發生錯誤", e); }
                    }
                    continue;
                }
                for (let j = 0; j < m.addedNodes.length; j++) if (m.addedNodes[j].nodeType === 1) ptAdded.push(m.addedNodes[j]);
                for (let j = 0; j < m.removedNodes.length; j++) if (m.removedNodes[j].nodeType === 1) ptRemoved.push(m.removedNodes[j]);
            }
            if (ptScheduled) return;
            ptScheduled = true;
            requestAnimationFrame(function () {
                ptScheduled = false;
                const a = ptAdded, r = ptRemoved, t = ptAttrs;
                ptAdded = []; ptRemoved = []; ptAttrs = [];
                frame++;
                try {
                    if (sub.onRemoved && r.length) sub.onRemoved(r);
                    if (sub.pauseInBattle && inBattle()) return;
                    if (!anchorPresent(sub)) return;
                    if (sub.onNodes && a.length) sub.onNodes(a);
                    if (sub.onAttr && t.length) sub.onAttr(t);
                    if (sub.onFrame) sub.onFrame();
                } catch (e) {
                    console.warn("[SCHED] " + sub.id + " 發生錯誤", e);
                }
            });
        });

        const options = { childList: true, subtree: true };
        if (sub.text) options.characterData = true;
        if (sub.attrs && sub.attrs.length) { options.attributes = true; options.attributeFilter = sub.attrs; }
        ptObserver.observe(document.documentElement, options);

        return { id: sub.id, unregister: function () { ptObserver.disconnect(); } };
    }

    function register(spec) {
        if (!spec || !spec.id) throw new Error("UWSched.register 需要 id");

        const sub = {
            id: spec.id,
            anchor: spec.anchor || null,
            pauseInBattle: Boolean(spec.pauseInBattle),
            attrs: spec.attrs || null,
            text: Boolean(spec.text),
            onNodes: spec.onNodes || null,
            onRemoved: spec.onRemoved || null,
            onAttr: spec.onAttr || null,
            onText: spec.onText || null,
            onFrame: spec.onFrame || null
        };

        if (PASSTHROUGH) return registerPassthrough(sub);

        subs.push(sub);
        ensureObserver();
        console.log("[SCHED] 已登記：" + sub.id + (sub.anchor ? "（anchor: " + sub.anchor + "）" : ""));

        return {
            id: sub.id,
            unregister: function () {
                const index = subs.indexOf(sub);
                if (index >= 0) subs.splice(index, 1);
                ensureObserver();
            }
        };
    }

    // 目前掛在畫面上的頁面名稱（取自 <頁面名>_rootContainer__<hash>）
    // 主要給 console 除錯用；工具要判斷頁面請直接用 anchor，那個是每幀快取過的。
    function currentPage() {
        const el = document.querySelector(PAGE_SELECTOR);
        if (!el || typeof el.className !== "string") return null;
        const hit = el.className.split(/\s+/).find(function (c) {
            return c.indexOf("_rootContainer__") > 0;
        });
        return hit ? hit.split("_rootContainer__")[0] : null;
    }

    window.UWSched = {
        version: 1,
        passthrough: PASSTHROUGH,
        register: register,
        currentPage: currentPage,
        inBattle: function () { frame++; return inBattle(); },
        // 除錯用：目前登記了哪些工具
        list: function () {
            return subs.map(function (s) {
                return { id: s.id, anchor: s.anchor, pauseInBattle: s.pauseInBattle };
            });
        }
    };
})();
