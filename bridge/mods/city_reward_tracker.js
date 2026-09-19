// city_reward_tracker.js - 未領取獎勵追蹤
//
// 1. PortalMap：未領取的城鎮加金色光圈，今日已領的加暗綠標記，可從浮動面板分別開關。
// 2. 城鎮詳細（attackmap 右欄）：標出領取狀態。
//
// 判定條件抄自遊戲自己的一鍵領取按鈕（main.94fae2cd.js 內）：
//     filter(cities, { reward: true, reward_collected: false })
// reward=true 代表這座城鎮因為大臣職位／控制聯盟而有可領的援助
// （送出時的 reference_type 是 "Minister and Control Union"）。
//
// 額外排除：
//   - 各陣營 HQ：自國 HQ 的 hq_word 是「中央援助」，走的是另一個領取入口，
//     遊戲的城鎮詳細也是先判 capital 再判 reward，本來就不會顯示地方援助。
//   - 世界之塔(594) 與同類的卡加布列島(589)：番外篇、無陣營城鎮。
//
// 關於「已失守但今天領過」的城鎮：
//   「今天領過」這個資訊在前端只存在於城鎮自己的 reward_collected 欄位，
//   而該欄位只跟著 reward=true 的城鎮走。城鎮一旦不在獎勵清單裡（例如聯盟
//   失去控制），那筆資訊就從資料中消失，前端無從得知。
//   因此這裡自己記一本當日帳（localStorage），把觀察到的領取狀態留下來。
//   顯示時 live 資料優先，帳本只補 live 沒有的部分 —— 城鎮被搶回且可以再領
//   一次時，live 的 reward_collected=false 會蓋掉舊紀錄，不會被誤導。
console.log("[REWARD] 啟動外部副程式：未領取獎勵追蹤已載入");

(function () {
    "use strict";

    // ---- 設定 ----
    const EXCLUDE_CITY_IDS = [589];          // 卡加布列島（番外篇、無陣營，與世界之塔同類）
    const TOWER_BUILDING = "cathayan_tower"; // 世界之塔專屬的建築圖，用它辨識比寫死 id 穩
    const SETTINGS_KEY = "uw_reward_tracker_v1";
    const JOURNAL_KEY = "uw_reward_journal_v1";
    const JOURNAL_MAX_AGE_MS = 26 * 60 * 60 * 1000; // 抓不到重置訊號時的保險期限
    const RESET_GRACE_MS = 15 * 1000;               // 重置後的緩衝期，等增量推播到齊

    const TEXT = {
        collected: "（已領取）",
        pending: "（未領取）",
        // 已失守的城鎮，這一列顯示的是對方聯盟名稱，
        // 所以文案主詞要落在「今日」而不是那個聯盟。
        collectedLost: "（今日已領）"
    };

    const CLASS_PENDING = "uw-reward-pending";
    const CLASS_COLLECTED = "uw-reward-collected";
    const CLASS_COLLECTED_LOST = "uw-reward-collected-lost";
    const MARKER_CLASSES = [CLASS_PENDING, CLASS_COLLECTED, CLASS_COLLECTED_LOST];
    const TAG_CLASS = "uw-reward-tag";
    const OFF_PENDING_CLASS = "uw-reward-off-pending";
    const OFF_COLLECTED_CLASS = "uw-reward-off-collected";

    const MARKER_SELECTOR = 'div[class*="PortalMap_marker__"], div[class*="PortalMap_markerCapital__"]';
    const DETAIL_BOX_SELECTOR = 'div[class*="Attackmap_cityDataBox__"]';
    const DETAIL_ROW_SELECTOR = 'div[class*="Attackmap_dataRow__"]';
    const DETAIL_NAME_SELECTOR = 'div[class*="Attackmap_cityName__"]';

    // ---- 設定保存 ----
    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
            if (saved && typeof saved === "object") {
                return {
                    showPending: saved.showPending !== false,
                    showCollected: saved.showCollected !== false
                };
            }
        } catch (e) {}
        return { showPending: true, showCollected: true };
    }

    const settings = loadSettings();

    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.warn("[REWARD] 設定儲存失敗", e);
        }
    }

    // ---- 判定 ----
    function isWorldTower(city) {
        return String(city.map_building || "").indexOf(TOWER_BUILDING) >= 0;
    }

    // 這座城鎮算不算「地方援助」標的
    function isRewardTarget(city) {
        if (!city || !city.reward) return false;
        if (city.hq || city.capital) return false;   // 各陣營 HQ
        if (isWorldTower(city)) return false;
        if (EXCLUDE_CITY_IDS.indexOf(city.id) >= 0) return false;
        return true;
    }

    // ---- 當日帳本 ----
    // { epochStartedAt: 毫秒, collected: { "<city_id>": "城鎮名" } }
    function newJournal() {
        return { epochStartedAt: Date.now(), collected: {} };
    }

    function loadJournal() {
        try {
            const saved = JSON.parse(localStorage.getItem(JOURNAL_KEY) || "null");
            if (
                saved &&
                typeof saved === "object" &&
                Number.isFinite(saved.epochStartedAt) &&
                saved.collected &&
                typeof saved.collected === "object" &&
                Date.now() - saved.epochStartedAt <= JOURNAL_MAX_AGE_MS
            ) {
                return saved;
            }
        } catch (e) {}
        return newJournal();
    }

    let journal = loadJournal();
    let lastCollectedState = new Map();  // city_id -> 上一次觀察到的 reward_collected
    let graceUntil = 0;                  // 剛重置完的緩衝期，見 updateJournal

    function saveJournal() {
        try {
            localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
        } catch (e) {
            console.warn("[REWARD] 帳本儲存失敗", e);
        }
    }

    function resetJournal(reason) {
        journal = newJournal();
        saveJournal();
        console.log("[REWARD] 帳本已重置：" + reason);
    }

    function updateJournal(cities) {
        // 跨日偵測：一天之內領過就不會變回未領，所以 reward=true 的城鎮
        // reward_collected 由 true 翻回 false，就是每日重置。
        // 不用猜伺服器的重置時刻，這個訊號自己會校準。
        let resetDetected = false;
        for (const city of cities) {
            if (!isRewardTarget(city)) continue;
            if (lastCollectedState.get(city.id) === true && city.reward_collected === false) {
                resetDetected = true;
                break;
            }
        }

        const inGrace = Date.now() < graceUntil;

        if (resetDetected) {
            // 重置有可能是一座一座增量推過來的。第一座翻回未領時就清帳，
            // 但此時還沒收到更新的城鎮仍然是 collected=true，若照常記帳就會
            // 把舊資料原封不動地寫回新的一天。
            // 因此重置後進入緩衝期，期間只認「由未領翻成已領」的真實領取動作。
            if (!inGrace) resetJournal("偵測到每日重置");
            graceUntil = Date.now() + RESET_GRACE_MS;
        } else if (Date.now() - journal.epochStartedAt > JOURNAL_MAX_AGE_MS) {
            // 重置當下手上剛好一座獎勵城鎮都沒有時沒有訊號可看，用期限兜底
            resetJournal("帳本超過 26 小時");
            graceUntil = Date.now() + RESET_GRACE_MS;
        }

        const guarded = resetDetected || Date.now() < graceUntil;

        let changed = false;
        const previous = lastCollectedState;
        lastCollectedState = new Map();
        cities.forEach(function (city) {
            if (!isRewardTarget(city)) return;
            lastCollectedState.set(city.id, Boolean(city.reward_collected));
            if (!city.reward_collected) return;
            // 緩衝期內只收「上一輪還是未領」的城鎮，其餘視為尚未更新的舊值
            if (guarded && previous.get(city.id) !== false) return;
            if (journal.collected[city.id] !== city.name) {
                journal.collected[city.id] = city.name;
                changed = true;
            }
        });

        if (changed) saveJournal();
    }

    // ---- 城鎮索引 ----
    let citiesById = new Map();
    let citiesByName = new Map();
    let pendingIds = new Set();        // 未領取（live）
    let collectedHeldIds = new Set();  // 已領取，仍在獎勵清單內
    let collectedLostIds = new Set();  // 已領取，只剩帳本知道（已失守）
    let targetCount = 0;
    let signature = "";

    function reindex(cities) {
        citiesById = new Map();
        citiesByName = new Map();
        pendingIds = new Set();
        collectedHeldIds = new Set();
        collectedLostIds = new Set();
        targetCount = 0;

        cities.forEach(function (city) {
            citiesById.set(city.id, city);
            citiesByName.set(city.name, city);
            if (!isRewardTarget(city)) return;
            targetCount += 1;
            if (city.reward_collected) {
                collectedHeldIds.add(city.id);
            } else {
                pendingIds.add(city.id);
            }
        });

        // 帳本補 live 沒有的部分；live 資料一律優先
        Object.keys(journal.collected).forEach(function (key) {
            const id = Number(key);
            if (!Number.isFinite(id)) return;
            if (pendingIds.has(id) || collectedHeldIds.has(id)) return;
            collectedLostIds.add(id);
        });
    }

    function sortedList(set) {
        return Array.from(set).sort(function (a, b) {
            return a - b;
        }).join(",");
    }

    // 三組清單都沒變就不重畫
    function computeSignature() {
        return targetCount + "|" + sortedList(pendingIds) +
            "|" + sortedList(collectedHeldIds) +
            "|" + sortedList(collectedLostIds);
    }

    function markerStateOf(id) {
        if (pendingIds.has(id)) return CLASS_PENDING;
        if (collectedHeldIds.has(id)) return CLASS_COLLECTED;
        if (collectedLostIds.has(id)) return CLASS_COLLECTED_LOST;
        return null;
    }

    // ---- PortalMap 標示 ----
    function markerCityId(el) {
        const fiber = window.RFStore.getFiber(el);
        if (!fiber || typeof fiber.key !== "string") return null;
        // marker 的 React key 是 `${city.id},${sword ? 1 : 0}`
        const id = parseInt(fiber.key.split(",")[0], 10);
        return Number.isFinite(id) ? id : null;
    }

    function paintMarkers() {
        document.querySelectorAll(MARKER_SELECTOR).forEach(function (el) {
            const id = markerCityId(el);
            const wanted = id === null ? null : markerStateOf(id);
            MARKER_CLASSES.forEach(function (cls) {
                const should = cls === wanted;
                if (el.classList.contains(cls) !== should) el.classList.toggle(cls, should);
            });
        });
    }

    function applyDisplaySwitches() {
        const root = document.documentElement;
        root.classList.toggle(OFF_PENDING_CLASS, !settings.showPending);
        root.classList.toggle(OFF_COLLECTED_CLASS, !settings.showCollected);
    }

    // ---- 城鎮詳細標註 ----
    function looksLikeCity(value) {
        return Boolean(
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            "reward_collected" in value &&
            "id" in value &&
            "name" in value
        );
    }

    // 名稱在資料裡是唯一的，所以先用畫面上的城鎮名反查 store；
    // 萬一之後出現同名或名稱被翻譯，再退回 fiber 掃描。
    function resolveDetailCity(box, scope) {
        const nameEl = scope.querySelector(DETAIL_NAME_SELECTOR);
        const name = nameEl ? nameEl.textContent.trim() : "";
        if (name && citiesByName.has(name)) return citiesByName.get(name);

        let node = window.RFStore.getFiber(box);
        for (let i = 0; i < 40 && node; i++) {
            const props = node.memoizedProps;
            if (looksLikeCity(props)) return citiesById.get(props.id) || props;
            if (props && typeof props === "object") {
                for (const key in props) {
                    if (looksLikeCity(props[key])) return citiesById.get(props[key].id) || props[key];
                }
            }
            let hook = node.memoizedState;
            for (let h = 0; hook && h < 60; h++) {
                if (looksLikeCity(hook.memoizedState)) {
                    return citiesById.get(hook.memoizedState.id) || hook.memoizedState;
                }
                hook = hook.next;
            }
            node = node.return;
        }
        return null;
    }

    function applyTag(host, text, collected) {
        if (!host) return null;
        let tag = host.querySelector(":scope > ." + TAG_CLASS);
        if (!tag) {
            tag = document.createElement("span");
            tag.className = TAG_CLASS;
            // 這些列的內容是 React 管的（第三列還是 dangerouslySetInnerHTML），
            // 改它們的內容會被洗掉，所以在後面補一個自己的節點。
            host.appendChild(tag);
        }
        if (tag.textContent !== text) tag.textContent = text;
        if (tag.dataset.uwCollected !== collected) tag.dataset.uwCollected = collected;
        return tag;
    }

    function paintDetail() {
        const box = document.querySelector(DETAIL_BOX_SELECTOR);
        if (!box) return;

        const scope = box.parentElement || box;
        const city = resolveDetailCity(box, scope);
        let keep = null;

        if (city && isRewardTarget(city)) {
            // 還在獎勵清單內：標在最後一列「佔領者（控制聯盟）」後面
            // 三列依序是 主權 / 影響者(國家) / 佔領者(控制聯盟)
            const rows = box.querySelectorAll(DETAIL_ROW_SELECTOR);
            if (rows.length) {
                const collected = Boolean(city.reward_collected);
                keep = applyTag(
                    rows[rows.length - 1],
                    collected ? TEXT.collected : TEXT.pending,
                    collected ? "1" : "0"
                );
            }
        } else if (city && collectedLostIds.has(city.id)) {
            // 已失守：佔領者那一列現在是對方聯盟，標在那裡會讀成對方領了，
            // 改標在城鎮名旁邊。
            keep = applyTag(scope.querySelector(DETAIL_NAME_SELECTOR), TEXT.collectedLost, "lost");
        }

        // 換城鎮或狀態改變時清掉別處殘留的標註
        scope.querySelectorAll("." + TAG_CLASS).forEach(function (tag) {
            if (tag !== keep) tag.remove();
        });
    }

    // ---- 面板 ----
    let statEl = null;

    function renderPanel() {
        if (!statEl) return;

        const pending = pendingIds.size;
        const lost = collectedLostIds.size;
        const collected = collectedHeldIds.size + lost;

        statEl.innerHTML = "";

        const line1 = document.createElement("div");
        const value = document.createElement("b");
        value.textContent = String(pending);
        if (pending === 0) value.className = "uw-reward-zero";
        line1.append(
            document.createTextNode("未領取 "),
            value,
            document.createTextNode(" / 可領 " + targetCount)
        );

        const line2 = document.createElement("div");
        line2.className = "uw-reward-substat";
        line2.textContent = "今日已領 " + collected + (lost ? "（含失守 " + lost + "）" : "");

        statEl.append(line1, line2);
    }

    function makeToggle(labelText, key) {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = settings[key];
        const text = document.createElement("span");
        text.textContent = labelText;
        label.append(checkbox, text);

        checkbox.addEventListener("change", function () {
            settings[key] = checkbox.checked;
            saveSettings();
            applyDisplaySwitches();
        });
        return label;
    }

    function buildPanel() {
        if (!window.UWPanel) {
            console.warn("[REWARD] 找不到 UWPanel，面板略過");
            return;
        }

        const panel = window.UWPanel.create({
            id: "city_reward_tracker",
            title: "[獎勵] 未領取追蹤",
            tabTitle: "獎勵",
            side: "left"
        });
        if (!panel) return;

        statEl = document.createElement("div");
        statEl.className = "uw-reward-stat";

        const note = document.createElement("div");
        note.className = "uw-panel-note";
        note.textContent =
            "只計地方援助；各陣營 HQ（中央援助）與世界之塔一類的番外城鎮不列入。" +
            "已失守城鎮的紀錄來自本機當日帳本，遊戲沒開時領取的不會被記到。";

        panel.body.append(
            statEl,
            makeToggle("標示未領取（金色光圈）", "showPending"),
            makeToggle("標示今日已領（暗綠）", "showCollected"),
            note
        );
        renderPanel();
    }

    // ---- 主流程 ----
    function refresh(force) {
        const next = computeSignature();
        if (!force && next === signature) return;
        signature = next;
        paintMarkers();
        renderPanel();
    }

    function start() {
        if (!window.RFStore) {
            console.warn("[REWARD] 找不到 RFStore，未領取追蹤停用");
            return;
        }

        applyDisplaySwitches();
        buildPanel();

        window.RFStore.subscribe(function (store) {
            updateJournal(store.cities);
            reindex(store.cities);
            refresh(false);
            paintDetail();
        });

        // 換頁／marker 重繪時標示會被 React 洗掉，補畫回來。
        // 只做 class 與 fiber 讀取，不碰版面量測。
        //
        // 2026-08-19：改向 UWSched 登記，不再自己 new MutationObserver。
        //   anchor 設成「PortalMap 的標記」或「攻擊地圖的城鎮詳細框」——
        //   只有這兩個地方需要標示，其餘頁面整支跳過。
        //   （rAF 合併現在由排程器統一負責）
        function repaint(){
            if (!citiesById.size) return;
            paintMarkers();
            paintDetail();
        }

        if (window.UWSched) {
            window.UWSched.register({
                id: "city_reward_tracker",
                anchor: '[class*="PortalMap_marker"], [class*="Attackmap_cityDataBox__"]',
                pauseInBattle: true,
                onFrame: repaint
            });
        } else {
            console.warn("[REWARD] 找不到 UWSched，退回自己的 MutationObserver");
            let scheduled = false;
            const observer = new MutationObserver(function () {
                if (!citiesById.size || scheduled) return;
                scheduled = true;
                requestAnimationFrame(function () {
                    scheduled = false;
                    repaint();
                });
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }

        console.log("[REWARD] 監聽已啟動");
    }

    // Console API：
    //   RFReward.getState()      目前的三組清單
    //   RFReward.getJournal()    當日帳本內容
    //   RFReward.resetJournal()  手動清帳（例如帳本被誤判污染時）
    window.RFReward = Object.freeze({
        isRewardTarget: isRewardTarget,
        getState: function () {
            return {
                targetCount: targetCount,
                pending: Array.from(pendingIds),
                collectedHeld: Array.from(collectedHeldIds),
                collectedLost: Array.from(collectedLostIds)
            };
        },
        getJournal: function () {
            return JSON.parse(JSON.stringify(journal));
        },
        resetJournal: function () {
            resetJournal("手動重置");
            signature = "";
        },
        // 測試與除錯用：直接餵一份 cities 進來跑一輪
        ingest: function (cities) {
            updateJournal(cities);
            reindex(cities);
            return window.RFReward.getState();
        }
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
