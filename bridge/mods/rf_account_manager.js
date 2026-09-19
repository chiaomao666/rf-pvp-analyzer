(() => {
    "use strict";

    const STORAGE_KEY = "savedAccounts";
    const LAST_USED_KEY = "lastUsedEmail";

    // ---- 每頁筆數：依視窗大小動態計算 ----
    // .rf-account-list 是 2 欄 grid（760px 以下變 1 欄），所以每頁筆數 = 可容納列數 × 欄數。
    // 量不到尺寸時（例如 rf_mod.css 沒載入、清單還沒渲染）就退回 PAGE_SIZE_FALLBACK。
    //
    // 量測遵守 CLAUDE.md 的效能慣例：只在掛載時與 window resize 時做，
    // 不放進任何輪詢迴圈（getBoundingClientRect 會強制重排）。
    // 想讓一頁放更多／更少，調 ROWS_MAX 即可（它是列數上限，實際筆數還要乘上欄數）。
    // 登入卡片是 top:0/right:0 定位在畫面右上角，下方到視窗底部都是可用空間，
    // 所以用視窗底部當界線是合理的；上限設保守一點，避免在很高的螢幕上長得太誇張。
    const PAGE_SIZE_FALLBACK = 4;   // 量不到尺寸時沿用原本的行為
    const ROWS_MIN = 1;
    const ROWS_MAX = 6;
    // 底部保留給分頁列與邊界的空間，用跟 rf_mod.css 同一個視窗基準表示。
    // 刻意用固定值而不是量分頁列本身 —— 分頁列的有無取決於頁數，
    // 而頁數又取決於每頁筆數，量它會形成回饋迴圈。
    const RESERVE_RATIO = 90 / 1600;

    function viewportBase() {
        return Math.min(window.innerWidth * 0.57, window.innerHeight);
    }

    // 從實際渲染結果推算一頁放得下幾筆
    function measurePageSize(list, current) {
        const row = list.querySelector(".rf-account-row");
        if (!row) return current;                    // 還沒有任何一列可以量

        const rowHeight = row.getBoundingClientRect().height;
        if (!rowHeight) return current;              // 尚未布局完成

        const styles = window.getComputedStyle(list);
        // 沒有套用 grid 時 gridTemplateColumns 會是 "none"，此時視為單欄
        const tracks = String(styles.gridTemplateColumns || "").trim();
        const columns = (!tracks || tracks === "none")
            ? 1
            : tracks.split(/\s+/).filter(Boolean).length;
        const gap = parseFloat(styles.rowGap) || 0;

        // 清單上緣的位置不受它自己有幾列影響，所以這個量測不會來回震盪
        const listTop = list.getBoundingClientRect().top;
        const available = window.innerHeight - listTop - viewportBase() * RESERVE_RATIO;

        const rows = Math.floor((available + gap) / (rowHeight + gap));
        const clamped = Math.max(ROWS_MIN, Math.min(ROWS_MAX, rows));
        return clamped * columns;
    }
    const mountedForms = new WeakSet();
    const AUTO_FILL_LAST_ACCOUNT = false;

    function readAccounts() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            if (!Array.isArray(value)) return [];
            return value
                .filter(account => account && typeof account.email === "string")
                .map(account => ({
                    email: account.email,
                    password: typeof account.password === "string" ? account.password : "",
                    lastUsed: Number(account.lastUsed) || 0
                }))
                .sort((a, b) => b.lastUsed - a.lastUsed);
        } catch {
            return [];
        }
    }

    function writeAccounts(accounts) {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(accounts.slice().sort((a, b) => b.lastUsed - a.lastUsed))
        );
    }

    function setReactInputValue(input, value) {
        if (!input) return;
        const descriptor = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        );
        if (descriptor && descriptor.set) {
            descriptor.set.call(input, value);
        } else {
            input.value = value;
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function makeButton(text, className) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = text;
        return button;
    }

    function resolveInputs(form) {
        const inputs = Array.from(form.querySelectorAll("input"));
        const password = inputs.find(input =>
            input.type === "password" ||
            /password/i.test(input.id || "") ||
            Boolean(input.closest(".ant-input-password"))
        );
        const email = inputs.find(input =>
            input !== password &&
            (/email/i.test(input.id || "") || input.type === "email")
        ) || inputs.find(input =>
            input !== password &&
            (input.type === "text" || !input.type)
        );
        return { email, password };
    }

    function findLoginForms() {
        return Array.from(document.querySelectorAll("form")).filter(form => {
            if (!form.closest('[class*="Login_loginFormBox__"]')) return false;
            const { email, password } = resolveInputs(form);
            return Boolean(email && password);
        });
    }

    function mount(form) {
        if (mountedForms.has(form)) return;

        const { email, password } = resolveInputs(form);
        if (!email || !password) return;
        mountedForms.add(form);

        const panel = document.createElement("section");
        panel.className = "rf-account-manager";
        panel.setAttribute("aria-label", "已儲存帳號");

        const toolbar = document.createElement("div");
        toolbar.className = "rf-account-toolbar";

        const title = document.createElement("strong");
        title.className = "rf-account-title";
        title.textContent = "快速選擇帳號";

        const rememberLabel = document.createElement("label");
        rememberLabel.className = "rf-account-remember";

        const remember = document.createElement("input");
        remember.type = "checkbox";
        remember.name = "rfRememberAccount";

        const rememberText = document.createElement("span");
        rememberText.textContent = "記住帳號";

        rememberLabel.append(remember, rememberText);
        toolbar.append(title, rememberLabel);

        const list = document.createElement("div");
        list.className = "rf-account-list";

        const pager = document.createElement("div");
        pager.className = "rf-account-pager";

        panel.append(toolbar, list, pager);
        form.appendChild(panel);

        let currentPage = 0;
        let pageSize = PAGE_SIZE_FALLBACK;

        function selectAccount(account) {
            setReactInputValue(email, account.email);
            setReactInputValue(password, account.password || "");
            remember.checked = true;
            localStorage.setItem(LAST_USED_KEY, account.email);
        }

        function removeAccount(accountEmail) {
            const accounts = readAccounts().filter(
                account => account.email !== accountEmail
            );
            writeAccounts(accounts);

            if (localStorage.getItem(LAST_USED_KEY) === accountEmail) {
                if (accounts.length) {
                    localStorage.setItem(LAST_USED_KEY, accounts[0].email);
                } else {
                    localStorage.removeItem(LAST_USED_KEY);
                }
            }

            currentPage = Math.min(
                currentPage,
                Math.max(1, Math.ceil(accounts.length / pageSize)) - 1
            );
            render();
        }

        function render() {
            const accounts = readAccounts();
            const totalPages = Math.max(1, Math.ceil(accounts.length / pageSize));
            currentPage = Math.min(currentPage, totalPages - 1);

            list.replaceChildren();
            pager.replaceChildren();

            if (!accounts.length) {
                const empty = document.createElement("div");
                empty.className = "rf-account-empty";
                empty.textContent = "尚未儲存帳號";
                list.appendChild(empty);
                return;
            }

            const start = currentPage * pageSize;
            for (const account of accounts.slice(start, start + pageSize)) {
                const row = document.createElement("div");
                row.className = "rf-account-row";

                const select = makeButton(account.email, "rf-account-select");
                select.title = account.email;
                select.addEventListener("click", () => selectAccount(account));

                const remove = makeButton("刪除", "rf-account-delete");
                remove.setAttribute("aria-label", `刪除 ${account.email}`);
                remove.addEventListener("click", () => removeAccount(account.email));

                row.append(select, remove);
                list.appendChild(row);
            }

            if (totalPages > 1) {
                const previous = makeButton("◀", "rf-account-page-button");
                previous.disabled = currentPage === 0;
                previous.addEventListener("click", () => {
                    if (currentPage > 0) {
                        currentPage -= 1;
                        render();
                    }
                });

                const status = document.createElement("span");
                status.className = "rf-account-page-status";
                status.textContent = `${currentPage + 1} / ${totalPages}`;

                const next = makeButton("▶", "rf-account-page-button");
                next.disabled = currentPage >= totalPages - 1;
                next.addEventListener("click", () => {
                    if (currentPage < totalPages - 1) {
                        currentPage += 1;
                        render();
                    }
                });

                pager.append(previous, status, next);
            }
        }

        function persistCurrentAccount() {
            const accountEmail = email.value.trim();
            const accountPassword = password.value;
            if (!accountEmail) return;

            let accounts = readAccounts();

            if (remember.checked && accountPassword) {
                const record = {
                    email: accountEmail,
                    password: accountPassword,
                    lastUsed: Date.now()
                };
                const index = accounts.findIndex(
                    account => account.email === accountEmail
                );
                if (index >= 0) {
                    accounts[index] = record;
                } else {
                    accounts.push(record);
                }
                writeAccounts(accounts);
                localStorage.setItem(LAST_USED_KEY, accountEmail);
            } else if (!remember.checked) {
                accounts = accounts.filter(
                    account => account.email !== accountEmail
                );
                writeAccounts(accounts);
                if (localStorage.getItem(LAST_USED_KEY) === accountEmail) {
                    if (accounts.length) {
                        localStorage.setItem(LAST_USED_KEY, accounts[0].email);
                    } else {
                        localStorage.removeItem(LAST_USED_KEY);
                    }
                }
            }

            render();
        }

        form.addEventListener("submit", persistCurrentAccount, true);

        const loginBox = form.closest('[class*="Login_loginFormBox__"]');
        if (loginBox) {
            loginBox.addEventListener("click", event => {
                const confirmButton = event.target.closest(
                    '[class*="Login_formBtn__"].ClickEffect'
                );
                if (confirmButton && loginBox.contains(confirmButton)) {
                    persistCurrentAccount();
                }
            }, true);
        }

        email.addEventListener("change", () => {
            const account = readAccounts().find(
                item => item.email === email.value.trim()
            );
            if (account) {
                setReactInputValue(password, account.password || "");
                remember.checked = true;
            }
        });

        render();

        // ---- 依視窗大小調整每頁筆數 ----
        // 必須先 render 一次才有列可以量；量完若筆數有變就重畫一次。
        // 清單上緣的位置不受列數影響，所以重畫之後再量會得到同樣的結果，不會來回震盪。
        function syncPageSize() {
            const next = measurePageSize(list, pageSize);
            if (next === pageSize) return;
            pageSize = next;
            currentPage = 0;   // 每頁筆數變了，頁碼重來比較不會跳到空頁
            render();
        }

        syncPageSize();

        // resize 用 rAF 合併，避免拖曳視窗時每個事件都做一次強制重排
        let resizeScheduled = false;
        function onResize() {
            // 登入完成後表單會被移除，順手把監聽收掉，不要留著參照已卸載的 DOM
            if (!panel.isConnected) {
                window.removeEventListener("resize", onResize);
                return;
            }
            if (resizeScheduled) return;
            resizeScheduled = true;
            requestAnimationFrame(function () {
                resizeScheduled = false;
                if (!panel.isConnected) {
                    window.removeEventListener("resize", onResize);
                    return;
                }
                syncPageSize();
            });
        }
        window.addEventListener("resize", onResize);

        if (AUTO_FILL_LAST_ACCOUNT) {
            const lastUsedEmail = localStorage.getItem(LAST_USED_KEY);
            const lastAccount = readAccounts().find(
                account => account.email === lastUsedEmail
            );

            if (lastAccount) {
                queueMicrotask(() => selectAccount(lastAccount));
            }
        }
    }

    function scan() {
        findLoginForms().forEach(mount);
    }

    // 2026-08-19：改向 UWSched 登記，不再自己 new MutationObserver。
    //   舊版在登入之後仍然永久掛著全文件監聽，每次 mutation 都跑
    //   document.querySelectorAll("form") 再逐一查 input。
    //   anchor 設成登入表單容器，登入後這支就完全不再動作。
    function start() {
        scan();

        if (!window.UWSched) {
            console.warn("[ACCOUNT] 找不到 UWSched，退回自己的 MutationObserver");
            const observer = new MutationObserver(scan);
            observer.observe(document.body, { childList: true, subtree: true });
            return;
        }

        window.UWSched.register({
            id: "rf_account_manager",
            anchor: '[class*="Login_loginFormBox__"]',
            onFrame: scan
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
