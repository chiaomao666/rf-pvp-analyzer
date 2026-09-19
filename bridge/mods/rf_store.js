// rf_store.js - 取得遊戲的 React context store
//
// 遊戲用一個 React context 當全域 store（原始碼裡的 Pd() 就是 useContext(Id)），
// value 裡面有 cities / setCities / rawNations / myUnion / playSound ... 等等。
// Provider 位在元件樹很上層，所以從畫面上任何一個節點的 fiber 往上走就會經過它。
//
// 直接讀 store 比逐一從卡片節點往上撈資料穩：
//   - 只找一次，全站共用
//   - store 是 WebSocket 推播套用後的結果，不用自己追增量更新
//
// context value 每次 render 都是新物件，所以這裡不快取 value 本身，每次重新走訪。
// 走訪成本很低（純讀 fiber 欄位，不碰版面），1 秒一次的輪詢完全吃得消。
console.log("[STORE] 遊戲 store 存取模組已載入");

(function () {
    "use strict";

    if (window.RFStore) return;

    const MAX_HOPS = 300;      // 往上找 Provider 的最大層數
    const TICK_MS = 1000;      // 訂閱者的輪詢間隔
    const subscribers = new Set();

    let anchor = null;         // 用來起算的 DOM 節點
    let timer = null;
    let readyCallbacks = [];
    let announced = false;

    function getFiber(el) {
        if (!el) return null;
        const key = Object.keys(el).find(function (k) {
            return k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$");
        });
        return key ? el[key] : null;
    }

    // 從一個 DOM 節點（或直接給 fiber）往上走，找出第一個符合 predicate 的資料物件。
    //
    // show_level_cap.js 與 restore_power_display.js 原本各自帶著一份幾乎一樣的
    // findActorData（CLAUDE.md 也標註「兩份要保持同步」），2026-08-19 抽到這裡共用。
    //   predicate(value) 回傳 true 就採用
    //   opts.maxHops   往上找幾層（預設 20）
    //   opts.hooks     是否連 hook state 一起掃（show_level_cap 需要，預設 false）
    //   opts.hookHops  hook 鏈往後掃幾個（預設 6）
    function findData(source, predicate, opts) {
        const options = opts || {};
        const maxHops = options.maxHops || 20;
        const hookHops = options.hookHops || 6;

        let node = (source && source.nodeType === 1) ? getFiber(source) : source;

        for (let i = 0; i < maxHops && node; i++) {
            const props = node.memoizedProps;
            if (props && typeof props === "object") {
                for (const key in props) {
                    const val = props[key];
                    if (val && typeof val === "object" && predicate(val)) return val;
                }
            }
            if (options.hooks) {
                // 有些元件會把資料放在 hook state 裡，順著 next 掃幾個
                let s = node.memoizedState;
                let hops = 0;
                while (s && typeof s === "object" && hops < hookHops) {
                    if (s.memoizedState && typeof s.memoizedState === "object" &&
                        predicate(s.memoizedState)) {
                        return s.memoizedState;
                    }
                    s = s.next;
                    hops++;
                }
            }
            node = node.return;
        }
        return null;
    }

    function isStoreValue(value) {
        return Boolean(
            value &&
            typeof value === "object" &&
            Array.isArray(value.cities) &&
            typeof value.setCities === "function"
        );
    }

    // 找一個掛得到 fiber 的節點當起點。
    // #root 的第一層子節點在整個 app 的生命週期裡都很穩定，先試它；
    // 真的找不到才退回全域掃描。
    function findAnchor() {
        if (anchor && anchor.isConnected && getFiber(anchor)) return anchor;

        const root = document.getElementById("root");
        if (!root) return null;

        const first = root.firstElementChild;
        if (first && getFiber(first)) {
            anchor = first;
            return anchor;
        }

        const candidates = root.querySelectorAll("div, section, span, img");
        for (let i = 0; i < candidates.length && i < 200; i++) {
            if (getFiber(candidates[i])) {
                anchor = candidates[i];
                return anchor;
            }
        }
        anchor = null;
        return null;
    }

    function get() {
        const el = findAnchor();
        if (!el) return null;

        let node = getFiber(el);
        for (let i = 0; i < MAX_HOPS && node; i++) {
            const props = node.memoizedProps;
            if (props && isStoreValue(props.value)) return props.value;
            node = node.return;
        }
        return null;
    }

    function getCities() {
        const store = get();
        return store ? store.cities : null;
    }

    function tick() {
        if (!subscribers.size && !readyCallbacks.length) return;
        const store = get();
        if (!store) return;

        if (!announced) {
            announced = true;
            console.log("[STORE] 已連上遊戲 store，cities 共 " + store.cities.length + " 筆");
            const callbacks = readyCallbacks;
            readyCallbacks = [];
            callbacks.forEach(function (fn) {
                try {
                    fn(store);
                } catch (e) {
                    console.warn("[STORE] ready callback 發生錯誤", e);
                }
            });
        }

        subscribers.forEach(function (fn) {
            try {
                fn(store);
            } catch (e) {
                console.warn("[STORE] 訂閱者發生錯誤", e);
            }
        });
    }

    function ensureTimer() {
        if (timer !== null) return;
        timer = setInterval(tick, TICK_MS);
    }

    // 訂閱者每 tick 都會被呼叫一次，要不要重畫請自己比對
    function subscribe(fn) {
        if (typeof fn !== "function") return function () {};
        subscribers.add(fn);
        ensureTimer();
        return function () {
            subscribers.delete(fn);
        };
    }

    function ready(fn) {
        if (typeof fn !== "function") return;
        if (announced) {
            const store = get();
            if (store) {
                fn(store);
                return;
            }
            announced = false;
        }
        readyCallbacks.push(fn);
        ensureTimer();
    }

    window.RFStore = {
        version: 2,
        get: get,
        getCities: getCities,
        getFiber: getFiber,
        findData: findData,
        subscribe: subscribe,
        ready: ready
    };
})();
