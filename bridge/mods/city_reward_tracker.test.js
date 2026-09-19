// 在最小 DOM stub 下實際執行 city_reward_tracker.js，
// 透過它自己的 RFReward.ingest() 驅動情境測試（測的是真的那份程式碼）
const fs = require("fs");
const vm = require("vm");

const store = {};
const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
};

const noopEl = {
    classList: { toggle() {}, contains: () => false },
    querySelector: () => null,
    querySelectorAll: () => [],
    append() {}, appendChild() {}, remove() {},
    dataset: {}, style: {}, textContent: ""
};

const document = {
    readyState: "complete",
    documentElement: noopEl,
    addEventListener() {},
    createElement: () => Object.assign({}, noopEl, { classList: { toggle() {}, contains: () => false } }),
    querySelector: () => null,
    querySelectorAll: () => []
};

const sandbox = {
    console: { log() {}, warn() {} },   // 靜音，只看斷言結果
    localStorage, document,
    MutationObserver: class { observe() {} },
    requestAnimationFrame: () => {},
    setInterval: () => 0,
    Number, Object, Array, Set, Map, JSON, Date, String, Boolean, parseInt
};
sandbox.window = sandbox;
sandbox.RFStore = { getFiber: () => null, subscribe: () => {} };

function loadTracker() {
    const code = fs.readFileSync(require("path").join(__dirname, "city_reward_tracker.js"), "utf8");
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.RFReward;
}

// ---- 測試資料 ----
// 固定情境資料，避免外部帳號快照改變後讓回歸測試失效。
const base = [3, 4, 307, ...Array.from({length:14}, (_,i)=>400+i)].map(id => ({
    id, name: `測試城鎮${id}`, reward: true, reward_collected: true,
    hq: false, capital: false, map_building: "/city.png"
})).concat([
    {id:1, name:"臺北", hq:true, capital:true},
    {id:594, name:"世界之塔", map_building:"/cathayan_tower.png"},
    {id:589, name:"卡加布列島"}
]);
const clone = () => JSON.parse(JSON.stringify(base));

function setCity(cities, id, patch) {
    Object.assign(cities.find(c => c.id === id), patch);
}

let pass = 0, fail = 0;
function check(label, actual, expected) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { pass++; console.log("  PASS  " + label); }
    else { fail++; console.log("  FAIL  " + label + "\n         實際 " + a + "\n         預期 " + e); }
}

const RFReward = loadTracker();

console.log("\n[1] 初始：17 座全部已領（固定情境資料）");
let s = RFReward.ingest(clone());
check("可領標的 17", s.targetCount, 17);
check("未領取 0", s.pending.length, 0);
check("已領(持有) 17", s.collectedHeld.length, 17);
check("已領(失守) 0", s.collectedLost.length, 0);
check("帳本記了 17 座", Object.keys(RFReward.getJournal().collected).length, 17);

console.log("\n[2] 基隆(3) 被搶走：reward 變 false，從獎勵清單消失");
let cities = clone();
setCity(cities, 3, { reward: false, reward_collected: false, controlled: false });
s = RFReward.ingest(cities);
check("可領標的降為 16", s.targetCount, 16);
check("基隆不在 pending", s.pending.includes(3), false);
check("基隆不在 collectedHeld", s.collectedHeld.includes(3), false);
check("基隆落到 collectedLost", s.collectedLost, [3]);

console.log("\n[3] 新北(4) 也被搶走 → 兩座失守都還記得");
setCity(cities, 4, { reward: false, reward_collected: false, controlled: false });
s = RFReward.ingest(cities);
check("collectedLost = [3,4]", s.collectedLost.sort((a, b) => a - b), [3, 4]);
check("可領標的降為 15", s.targetCount, 15);

console.log("\n[4] 基隆搶回來、且伺服器允許再領一次（live 說未領）→ live 要蓋過帳本");
setCity(cities, 3, { reward: true, reward_collected: false, controlled: true });
s = RFReward.ingest(cities);
check("基隆回到 pending", s.pending, [3]);
check("基隆不再算失守", s.collectedLost, [4]);

console.log("\n[5] 桃園(307) 由已領翻回未領 → 判定為每日重置，帳本清空");
setCity(cities, 307, { reward_collected: false });
s = RFReward.ingest(cities);
check("帳本已清空", Object.keys(RFReward.getJournal().collected).length, 0);
check("失守紀錄一併清掉", s.collectedLost, []);
check("未領取變成 2 (基隆+桃園)", s.pending.sort((a, b) => a - b), [3, 307]);

console.log("\n[5b] 緩衝期內：其餘城鎮的舊 collected=true 不可以被寫回帳本");
s = RFReward.ingest(cities);   // 同樣的資料再跑一輪（模擬增量推播還沒到齊）
check("帳本仍然是空的", Object.keys(RFReward.getJournal().collected).length, 0);
check("沒有冒出假的失守紀錄", s.collectedLost, []);

console.log("\n[5c] 緩衝期內真的領取一座（桃園 未領→已領）→ 這筆要記");
setCity(cities, 307, { reward_collected: true });
s = RFReward.ingest(cities);
// 帳本只該有 307；collectedHeld 來自 live 資料，那 14 座在 payload 裡確實
// 還是 reward_collected=true，所以 live 報告它們已領是正確的。
check("帳本只有桃園", Object.keys(RFReward.getJournal().collected).map(Number), [307]);
check("桃園在 collectedHeld 裡", s.collectedHeld.includes(307), true);
check("collectedLost 仍為空（帳本沒被污染）", s.collectedLost, []);

console.log("\n[6] HQ / 世界之塔 / 卡加布列島 即使已領也不進帳本");
const c6 = clone();
[1, 594, 589].forEach(id => setCity(c6, id, { reward: true, reward_collected: true }));
const fresh = loadTracker();          // 用乾淨的 sandbox 重跑
Object.keys(store).forEach(k => delete store[k]);
const s6 = fresh.ingest(c6);
const j6 = Object.keys(fresh.getJournal().collected).map(Number);
check("臺北(1) 不在帳本", j6.includes(1), false);
check("世界之塔(594) 不在帳本", j6.includes(594), false);
check("卡加布列島(589) 不在帳本", j6.includes(589), false);
check("三者都不在任何清單", [1, 594, 589].some(id =>
    s6.pending.includes(id) || s6.collectedHeld.includes(id) || s6.collectedLost.includes(id)), false);

console.log("\n[7] 帳本超過 26 小時 → 作廢重來");
store["uw_reward_journal_v1"] = JSON.stringify({
    epochStartedAt: Date.now() - 27 * 3600 * 1000,
    collected: { "999": "過期城鎮" }
});
const stale = loadTracker();
const s7 = stale.ingest(clone());
check("過期紀錄沒有被沿用", s7.collectedLost.includes(999), false);

console.log("\n" + (fail === 0 ? "全部 " + pass + " 項通過" : pass + " 通過 / " + fail + " 失敗"));
process.exit(fail === 0 ? 0 : 1);
