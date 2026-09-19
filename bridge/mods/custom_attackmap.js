/**
 * 我的專屬系統注入腳本 (My Custom System Injection Script) - 混合效能版（無影子鏡像）
 *
 * 設計原則：
 * - 文字格式化（清空小時／攻守標記）：高頻輪詢，因為只動 nodeValue/attribute，成本很低。
 * - 位置位移（把分數容器移到左側旗幟）：改成事件驅動，只在真正需要時才重新量測與計算，
 *   避免固定頻率的 getBoundingClientRect 造成不必要的強制重排（reflow）。
 *   觸發時機：
 *     1. 元素第一次被找到時
 *     2. window resize（視窗大小改變）
 *     3. ResizeObserver 偵測到旗幟或分數容器本身尺寸變化（例如響應式版面切換）
 * - 全程只操作「原始的唯一節點」，不建立分身、不複製文字內容。
 */

(function() {
    console.log("%c[Custom System] 混合效能版（無影子鏡像）已啟動", "color: #008080; font-weight: bold; border: 2px solid #008080; padding: 4px;");

    const SELECTORS = {
        markerIconContainer: 'div[class*="Attackmap_markerCityIcon__"]',
        markerTextContainer: 'div[class*="Attackmap_markerCityName__"]',
        scoreAndTimeContainer: 'div[class*="nation_battle_close_roll_call_at"]',
        flagContainer: 'div[class*="Attackmap_flagLeft__P-F-D"]',
        flagImage: 'img[class*="Attackmap_flag__91wA5"]'
    };

    let scoreEl = null;
    let flagContainer = null;
    let resizeObserver = null;
    let isApplyingTextPatch = false; // 防遞迴鎖定（文字處理用）

    // --- 有雙刀的城鎮補回城鎮名稱 ---
    //
    // bundle 裡是二選一：`t.sword ? <img 雙刀/> : t.name`
    // 有雙刀的時候城鎮名稱根本沒有進 DOM，純 CSS 救不回來，只能從外面補。
    //
    // 城鎮 id 從同一個 marker 內的 [data-sensor-city-id] 拿（那是 bundle 自己放的），
    // 再用 RFStore 的城鎮清單查名字。
    //
    // 注意：attackmap 的 marker 是 divIcon 的靜態 HTML（renderToString 產生後交給 Leaflet），
    // 上面**沒有 React fiber**，所以不能用 fiber 查資料，只能靠這個 data 屬性。
    const SWORD_IMG_SELECTOR = 'img[class*="Attackmap_marker2swords__"]';
    const MARKER_BOX_SELECTOR = 'div[class*="Attackmap_markerCityBox__"]';
    const SENSOR_SELECTOR = '[data-sensor-city-id]';
    const LABEL_SELECTOR = '[data-uw-sword-label]';

    let cityNames = new Map();   // id(字串) -> 城鎮名
    let lastLookup = 0;
    const LOOKUP_COOLDOWN_MS = 1000; // store 還沒好的時候，最多每秒重試一次

    function cityNameOf(id) {
        if (cityNames.has(id)) return cityNames.get(id);

        const now = Date.now();
        if (now - lastLookup < LOOKUP_COOLDOWN_MS) return '';
        lastLookup = now;

        if (!window.RFStore || typeof window.RFStore.getCities !== 'function') return '';
        const cities = window.RFStore.getCities();
        if (!cities || !cities.length) return '';

        const map = new Map();
        cities.forEach(c => map.set(String(c.id), c.name));
        cityNames = map;
        return cityNames.get(id) || '';
    }

    // 每個名稱容器只處理一次（處理成功才蓋章）。
    // marker 重繪時 Leaflet 會整個換掉 DOM 節點，新節點沒有章，自然會重跑。
    function ensureSwordCityName(nameEl) {
        if (nameEl.dataset.uwSwordChecked === '1') return;

        const sword = nameEl.querySelector(SWORD_IMG_SELECTOR);
        if (!sword) {
            nameEl.dataset.uwSwordChecked = '1'; // 沒有雙刀，本來就會顯示名稱
            return;
        }

        const box = nameEl.closest(MARKER_BOX_SELECTOR);
        if (!box) return;
        const sensor = box.querySelector(SENSOR_SELECTOR);
        if (!sensor) return;

        const name = cityNameOf(sensor.dataset.sensorCityId);
        if (!name) return; // store 還沒好，下一輪再試（不蓋章）

        let label = nameEl.querySelector(LABEL_SELECTOR);
        if (!label) {
            label = document.createElement('span');
            label.dataset.uwSwordLabel = '1';
            nameEl.appendChild(label);
        }
        label.textContent = name;
        nameEl.dataset.uwSwordChecked = '1';
    }

    // --- 標記文字：只需套一次，不用高頻率重跑 ---
    function applyMarkerTextPatch() {
        document.querySelectorAll(SELECTORS.markerTextContainer).forEach(el => {
            if (el.style.display !== 'block') {
                el.style.setProperty('display', 'block', 'important');
                el.style.setProperty('visibility', 'visible', 'important');
                el.style.setProperty('opacity', '1', 'important');
            }
            ensureSwordCityName(el);
        });
    }

    // --- 文字格式化：高頻執行，只動 nodeValue / attribute，不碰版面 ---
    function updateScoreText() {
        if (isApplyingTextPatch) return;
        if (!scoreEl || !scoreEl.isConnected) return; // 節點已被移除，等待重新偵測
        isApplyingTextPatch = true;

        try {
            const textNodes = [];
            const walker = document.createTreeWalker(scoreEl, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) textNodes.push(node);

            const combinedText = textNodes.map(n => n.nodeValue.trim()).join('');
            const isTimeFormat = /^(\d{1,2}:)?\d{2}:\d{2}$/.test(combinedText);
            const isScoreFormat = /^\d+(:\d+)?$/.test(combinedText) && !isTimeFormat;

            if (isTimeFormat) {
                if (scoreEl.getAttribute('data-custom-type') !== 'time') {
                    scoreEl.setAttribute('data-custom-type', 'time');
                    scoreEl.removeAttribute('data-is-score');
                }
                // 只有真的含兩個冒號（代表有小時段）才清空小時部分
                const colonCount = (combinedText.match(/:/g) || []).length;
                if (colonCount === 2) {
                    const firstColonIndex = textNodes.findIndex(n => n.nodeValue.includes(':'));
                    if (firstColonIndex > -1) {
                        for (let i = 0; i <= firstColonIndex; i++) {
                            if (textNodes[i].nodeValue !== '') textNodes[i].nodeValue = '';
                        }
                    }
                }
            } else if (isScoreFormat) {
                if (scoreEl.getAttribute('data-is-score') !== 'true') {
                    scoreEl.setAttribute('data-is-score', 'true');
                    scoreEl.removeAttribute('data-custom-type');
                }
            } else {
                scoreEl.removeAttribute('data-is-score');
                scoreEl.removeAttribute('data-custom-type');
            }
        } finally {
            isApplyingTextPatch = false;
        }
    }

    // --- 位置位移：只在被呼叫時才量測與計算，不主動輪詢 ---
    function repositionScore() {
        if (!scoreEl || !flagContainer || !scoreEl.isConnected || !flagContainer.isConnected) return;

        // compute center of the flag container (viewport coordinates)
        const flagRect = flagContainer.getBoundingClientRect();
        const centerX = flagRect.left + flagRect.width / 2;
        const centerY = flagRect.top + flagRect.height / 2;

        // Use fixed positioning so React's DOM operations won't error when nodes are reparented
        scoreEl.style.setProperty('position', 'fixed', 'important');
        scoreEl.style.setProperty('left', `${centerX}px`, 'important');
        scoreEl.style.setProperty('top', `${centerY}px`, 'important');
        scoreEl.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
        scoreEl.style.setProperty('text-align', 'center', 'important');
        scoreEl.style.setProperty('z-index', '9999', 'important');
    }

    // --- 確保拿到最新的元素引用，並在拿到新引用時掛上對應的觀察者 ---
    function ensureElementsAndObservers() {
        const newScoreEl = document.querySelector(SELECTORS.scoreAndTimeContainer);
        let newFlagContainer = document.querySelector(SELECTORS.flagContainer);
        if (!newFlagContainer) {
            const flagImg = document.querySelector(SELECTORS.flagImage);
            newFlagContainer = flagImg ? flagImg.parentElement : null;
        }

        let changed = false;
        if (newScoreEl && newScoreEl !== scoreEl) {
            scoreEl = newScoreEl;
            changed = true;
        }
        if (newFlagContainer && newFlagContainer !== flagContainer) {
            flagContainer = newFlagContainer;
            changed = true;
        }

        if (changed && scoreEl && flagContainer) {
            // 重新掛上 ResizeObserver，監控這兩個元素本身的尺寸變化
            if (resizeObserver) resizeObserver.disconnect();
            resizeObserver = new ResizeObserver(() => repositionScore());
            resizeObserver.observe(scoreEl);
            resizeObserver.observe(flagContainer);

            repositionScore(); // 立即算一次初始位置
        }
    }

    // 視窗大小改變時，重新計算位移
    window.addEventListener('resize', () => repositionScore());

    // 偵測初始標記文字補丁 + 元素是否需要重新抓取
    //
    // 2026-08-18：加上 requestAnimationFrame 合併。applyMarkerTextPatch 會走訪畫面上
    //             全部 271 個城鎮標記，原本每一批 mutation 都跑一次。
    // 2026-08-19：改向 UWSched 登記，不再自己 new MutationObserver。
    //             anchor 設成攻擊地圖的根容器 —— 不在這個頁面時整支跳過，
    //             也順帶讓它在 PVP 戰鬥期間完全不動作。
    if (window.UWSched) {
        window.UWSched.register({
            id: "custom_attackmap",
            anchor: '[class*="Attackmap_rootContainer__"]',
            pauseInBattle: true,
            onFrame: function () {
                applyMarkerTextPatch();
                ensureElementsAndObservers();
            }
        });
    } else {
        console.warn("[Custom System] 找不到 UWSched，退回自己的 MutationObserver");
        let structureScheduled = false;
        const structureObserver = new MutationObserver(() => {
            if (structureScheduled) return;
            structureScheduled = true;
            requestAnimationFrame(() => {
                structureScheduled = false;
                applyMarkerTextPatch();
                ensureElementsAndObservers();
            });
        });
        structureObserver.observe(document.body, { childList: true, subtree: true });
    }

    // 文字內容高頻輪詢（成本低：只讀/改 nodeValue 和 attribute）
    setInterval(updateScoreText, 200);

    // --- CSS 補丁 ---
    const style = document.createElement('style');
    style.innerHTML = `
        /* 城市標記圖示過濾：只顯示包含 '/control/' 路徑的圖片 */
        div[class*="Attackmap_markerCityIcon__"] img:not([src*="/control/"]) {
            display: none !important;
        }
        div[class*="Attackmap_markerCityIcon__"] img[src*="/control/"] {
            display: block !important;
        }

        /* 強制顯示標記名稱 */
        div[class*="Attackmap_markerCityName__"] {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
        }

        /* 利用 CSS 虛擬元素注入「攻/守」文字，直接套在原始節點上，不需要分身 */
        div[class*="nation_battle_close_roll_call_at"][data-is-score="true"]::before {
            content: "攻";
            margin-right: 2px;
        }
        div[class*="nation_battle_close_roll_call_at"][data-is-score="true"]::after {
            content: "守";
            margin-left: 2px;
        }
    `;
    document.head.appendChild(style);

    // 初次立即執行
    applyMarkerTextPatch();
    ensureElementsAndObservers();
})();
