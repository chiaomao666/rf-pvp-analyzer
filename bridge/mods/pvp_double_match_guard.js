(() => {
  "use strict";

  // 瀏覽器側 bridge client 內嵌於本守衛；Node localhost server 仍維持獨立檔案。
  const BRIDGE_ENDPOINT = window.RF_PVP_BACKEND_ENDPOINT || "https://rfpvpanlyz-wgxynphd.manus.space/api/pvp/capture";
  const LOCAL_BRIDGE_ENDPOINT = "http://127.0.0.1:8787/v1/capture";
  const BRIDGE_ALLOWED_KEYS = [
    "battleAt", "mode", "outcome", "playerTeam", "opponentTeam", "playerName", "playerUnion", "opponentName", "opponentUnion",
    "rankBefore", "rankAfter", "scoreBefore", "scoreAfter", "notes",
    "sourceBattleChannel", "sourceBattleId",
  ];

  const BRIDGE_HEARTBEAT_MS = 30_000;
  const BRIDGE_REQUEST_TIMEOUT_MS = 8_000;
  const BRIDGE_MAX_RETRY_MS = 120_000;
  let bridgeStatus = "connecting";
  let bridgeStatusMessage = "正在確認網站後端";
  let bridgeLastHeartbeatAt = 0;
  let bridgeLastSuccessAt = 0;
  let bridgeLastError = "";
  let bridgeConsecutiveFailures = 0;
  let bridgeHeartbeatTimer = null;
  let bridgeHeartbeatInFlight = false;

  function installEmbeddedBridgeClient() {
    if (window.RFLocalBridge?.sendMatch) return;
    const sanitize = (summary) => {
      if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
        throw new Error("match summary must be an object");
      }
      return Object.fromEntries(
        BRIDGE_ALLOWED_KEYS.filter((key) => key in summary).map((key) => [key, summary[key]]),
      );
    };
    const getHealthEndpoint = () => {
      const endpoint = window.RF_PVP_BACKEND_ENDPOINT || BRIDGE_ENDPOINT;
      if (endpoint.endsWith("/capture")) return endpoint.slice(0, -"/capture".length) + "/health";
      if (endpoint.endsWith("/v1/capture")) return endpoint.slice(0, -"/v1/capture".length) + "/health";
      return endpoint.replace(/\/$/, "") + "/health";
    };
    const setStatus = (status, message, error = "") => {
      bridgeStatus = status;
      bridgeStatusMessage = message;
      bridgeLastError = error ? String(error).slice(0, 180) : "";
      if (typeof window.RF_PVP_Debug?.onBridgeStatus === "function") window.RF_PVP_Debug.onBridgeStatus();
    };
    const scheduleHeartbeat = (delay = BRIDGE_HEARTBEAT_MS) => {
      if (bridgeHeartbeatTimer) window.clearTimeout(bridgeHeartbeatTimer);
      bridgeHeartbeatTimer = window.setTimeout(() => { void probeHealth(); }, delay);
    };
    const probeHealth = async () => {
      if (bridgeHeartbeatInFlight) return;
      bridgeHeartbeatInFlight = true;
      setStatus(bridgeConsecutiveFailures ? "reconnecting" : "connecting", bridgeConsecutiveFailures ? "重連中：正在確認網站後端" : "正在確認網站後端");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), BRIDGE_REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(getHealthEndpoint(), { method: "GET", cache: "no-store", signal: controller.signal });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok !== true) throw new Error(result.error || `health HTTP ${response.status}`);
        bridgeLastHeartbeatAt = Date.now();
        bridgeLastSuccessAt = bridgeLastHeartbeatAt;
        bridgeConsecutiveFailures = 0;
        setStatus("online", "已連線：心跳正常");
        scheduleHeartbeat();
      } catch (error) {
        bridgeConsecutiveFailures += 1;
        const retryDelay = Math.min(BRIDGE_MAX_RETRY_MS, BRIDGE_HEARTBEAT_MS * (2 ** Math.min(bridgeConsecutiveFailures - 1, 2)));
        setStatus("reconnecting", `重連中：${retryDelay / 1000} 秒後重試`, error?.name === "AbortError" ? "health timeout" : error?.message || error);
        scheduleHeartbeat(retryDelay);
      } finally {
        window.clearTimeout(timeout);
        bridgeHeartbeatInFlight = false;
        if (typeof window.RF_PVP_Debug?.onBridgeStatus === "function") window.RF_PVP_Debug.onBridgeStatus();
      }
    };
    const sendMatch = async (summary) => {
      const endpoint = window.RF_PVP_BACKEND_ENDPOINT || BRIDGE_ENDPOINT;
      const requestBody = { type: "match", workspaceId: summary.workspaceId, data: sanitize(summary) };
      if (!window.RF_PVP_BACKEND_ENDPOINT && endpoint === LOCAL_BRIDGE_ENDPOINT) delete requestBody.workspaceId;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), BRIDGE_REQUEST_TIMEOUT_MS);
      setStatus("sending", "正在上傳完整戰績");
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(window.RF_PVP_WRITE_SECRET ? { "X-RF-Write-Secret": String(window.RF_PVP_WRITE_SECRET) } : {}),
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.accepted) throw new Error(result.error || `bridge HTTP ${response.status}`);
        bridgeLastSuccessAt = Date.now();
        bridgeConsecutiveFailures = 0;
        setStatus("online", "已連線：戰績已送達");
        scheduleHeartbeat();
        return result;
      } catch (error) {
        bridgeConsecutiveFailures += 1;
        setStatus("reconnecting", "戰績送出失敗：等待重連", error?.name === "AbortError" ? "capture timeout" : error?.message || error);
        scheduleHeartbeat(1_000);
        throw error;
      } finally {
        window.clearTimeout(timeout);
        if (typeof window.RF_PVP_Debug?.onBridgeStatus === "function") window.RF_PVP_Debug.onBridgeStatus();
      }
    };
    const getStatus = () => ({
      endpoint: window.RF_PVP_BACKEND_ENDPOINT || BRIDGE_ENDPOINT,
      healthEndpoint: getHealthEndpoint(),
      status: bridgeStatus,
      message: bridgeStatusMessage,
      lastHeartbeatAt: bridgeLastHeartbeatAt || null,
      lastSuccessAt: bridgeLastSuccessAt || null,
      consecutiveFailures: bridgeConsecutiveFailures,
      lastError: bridgeLastError || null,
    });
    window.RFLocalBridge = Object.freeze({ sendMatch, probeHealth, getStatus, endpoint: BRIDGE_ENDPOINT });
    console.log(`[RF bridge] embedded client ready; status=connecting; endpoint=${BRIDGE_ENDPOINT}`);
    void probeHealth();
  }

  installEmbeddedBridgeClient();

  const MOD_NAME = "PVP Passive Match Monitor";
  const LOG_KEY = "rf_pvp_intercept_logs";
  const EVENT_KEY = "rf_pvp_event_archive";
  const CAPTURE_STATS_KEY = "rf_pvp_capture_stats";
  const PANEL_POSITION_KEY = "rf_pvp_guard_panel_position";
  const MAX_LOGS = 20;
  const MAX_EVENTS = 160;
  const ACTIVE_BATTLE_EVENT_LIMIT = 96;
  const ACTIVE_BATTLE_TTL_MS = 10 * 60 * 1000;
  const MAX_ARCHIVE_CHARS = 1_500_000;

  if (window.__RF_PVP_DOUBLE_MATCH_GUARD_V8__) {
    console.warn(`[${MOD_NAME}] 已載入，略過重複安裝。`);
    return;
  }
  window.__RF_PVP_DOUBLE_MATCH_GUARD_V8__ = true;

  let isMatching = false;
  let lastMatchTime = 0;
  let currentBattleChannel = null;
  let uiPanel = null;
  let transportAttached = false;
  let transportMessage = "等待載入器預先安裝 Socket 觀察器";
  let subscribedTransportTap = null;
  let unsubscribeTransport = null;
  let capturedSinceLoad = 0;
  const bridgeSentKeys = new Map();
  let currentBattleIdentity = { playerName: undefined, playerUnion: undefined, opponentName: undefined, opponentUnion: undefined };
  let identityObserver = null;
  let identityRoot = null;
  let identityDebounce = null;
  const activeBattleEvents = new Map();
  // 身份 DOM 可能在 medals 回覆前卸載；按戰鬥 channel 保存最後一次完整快照，避免只依賴目前畫面。
  const battleIdentityByChannel = new Map();

  function readArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn(`[${MOD_NAME}] 無法讀取 ${key}：`, error);
      return [];
    }
  }

  function writeArray(key, values) {
    try {
      localStorage.setItem(key, JSON.stringify(values));
      return true;
    } catch (error) {
      console.error(`[${MOD_NAME}] 無法儲存 ${key}：`, error);
      return false;
    }
  }

  // localStorage 只保存聚合戰績需要的欄位；完整 rawFrame 不應進入瀏覽器快取。
  function compactArchivePayload(payload, event, topic) {
    const source = asObject(payload) || {};
    const output = {};
    const copy = (key) => { if (source[key] !== undefined) output[key] = redactAndClone(source[key]); };
    for (const key of ["status", "channel", "id", "battle_id", "battle_type", "next_action", "error", "response", "offender", "defender", "round"]) copy(key);
    if (/^player:\\d+$/i.test(String(topic || ""))) {
      for (const key of ["1v1", "3v3", "5v5", "medals", "previous_record"]) copy(key);
    }
    return Object.keys(output).length ? output : redactAndClone(source);
  }

  function writeEventArchive(events) {
    let kept = Array.isArray(events) ? events.slice() : [];
    while (kept.length && JSON.stringify(kept).length > MAX_ARCHIVE_CHARS) kept.splice(0, Math.max(1, Math.ceil(kept.length / 10)));
    while (kept.length) {
      try {
        localStorage.setItem(EVENT_KEY, JSON.stringify(kept));
        return true;
      } catch (error) {
        kept.splice(0, Math.max(1, Math.ceil(kept.length / 10)));
      }
    }
    try {
      localStorage.removeItem(EVENT_KEY);
      return true;
    } catch (error) {
      console.warn(`[${MOD_NAME}] 無法清理 ${EVENT_KEY}：`, error);
      return false;
    }
  }

  // 只保存安全的分類中繼資料；不在診斷統計中重複保存封包內容。
  function summariseTopic(topic) {
    return String(topic || "").replace(/\d+/g, "#").slice(0, 80) || "(none)";
  }

  function readCaptureStats() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CAPTURE_STATS_KEY) || "{}");
      return {
        totalCaptured: Number.isFinite(parsed?.totalCaptured) ? parsed.totalCaptured : 0,
        evictedCount: Number.isFinite(parsed?.evictedCount) ? parsed.evictedCount : 0,
        last: parsed?.last && typeof parsed.last === "object" ? parsed.last : null,
        candidateSummaryCount: Number.isFinite(parsed?.candidateSummaryCount) ? parsed.candidateSummaryCount : 0,
        lastCandidate: parsed?.lastCandidate && typeof parsed.lastCandidate === "object" ? parsed.lastCandidate : null,
      };
    } catch (error) {
      return { totalCaptured: 0, evictedCount: 0, last: null, candidateSummaryCount: 0, lastCandidate: null };
    }
  }

  function writeCaptureStats(stats) {
    try {
      localStorage.setItem(CAPTURE_STATS_KEY, JSON.stringify(stats));
    } catch (error) {
      console.warn(`[${MOD_NAME}] 無法保存封包分類統計：`, error);
    }
  }

  function readPanelPosition() {
    try {
      const value = JSON.parse(localStorage.getItem(PANEL_POSITION_KEY) || "null");
      return Number.isFinite(value?.left) && Number.isFinite(value?.top) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function savePanelPosition(left, top) {
    try {
      localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify({ left: Math.round(left), top: Math.round(top) }));
    } catch (error) {
      console.warn(`[${MOD_NAME}] 無法保存面板位置：`, error);
    }
  }

  function redactAndClone(value, seen = new WeakSet()) {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    if (Array.isArray(value)) return value.map((item) => redactAndClone(item, seen));
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (/token|authorization|password|secret|cookie/i.test(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactAndClone(item, seen);
      }
    }
    return output;
  }

  function recordIntercept(type, data) {
    const logs = readArray(LOG_KEY);
    const entry = {
      capturedAt: Date.now(),
      timestamp: new Date().toLocaleString(),
      type,
      data: redactAndClone(data),
    };
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    writeArray(LOG_KEY, logs);
    updateUIPanel();
    console.warn(`[${MOD_NAME}] 攔截到異常:`, entry);
  }

  function isRelevantPvpEvent(event, payload, topic) {
    const name = String(event || "").toLowerCase();
    const channel = String(topic || "").toLowerCase();
    const response = unwrapPhoenixResponse(payload);
    if (channel.includes("pvp")) return true;
    if (name.includes("pvp")) return true;
    if (/^player:\d+$/i.test(channel) && asObject(response?.medals)) return true;
    // 載入器僅在官方結果頁才轉送 player channel 全部回覆；完整保留以取得版本差異下的 medals 回覆包裝。
    if (/^player:\d+$/i.test(channel) && location.hash.toLowerCase().includes("/pvpresult")) return true;
    if (["battle_result", "team_confirmed", "surrender"].includes(name)) {
      return isMatching || Boolean(currentBattleChannel);
    }
    const status = String(payload?.status || "").toLowerCase();
    return ["matched", "matching", "can_join"].includes(status) && Boolean(payload?.channel);
  }

  function capturePvpCandidateSummary(frame) {
    const stats = readCaptureStats();
    stats.candidateSummaryCount += 1;
    stats.lastCandidate = {
      capturedAt: Number(frame?.capturedAt || Date.now()),
      topic: summariseTopic(frame?.topic),
      event: String(frame?.event || "(none)").slice(0, 80),
      payloadKeys: Array.isArray(frame?.payloadKeys) ? frame.payloadKeys.map((key) => String(key).slice(0, 80)).slice(0, 12) : [],
    };
    writeCaptureStats(stats);
    updateUIPanel();
  }

  function activeBattleChannelForEvent(event, payload, topic) {
    if (isBattleChannel(topic)) return String(topic);
    if (String(event || "").toLowerCase() === "pvp_battle" && isBattleChannel(payload?.channel)) return String(payload.channel);
    if (/^player:\\d+$/i.test(String(topic || "")) && currentBattleChannel) return currentBattleChannel;
    return null;
  }

  function addToActiveBattleBuffer(frame, event, payload, topic) {
    const channel = activeBattleChannelForEvent(event, payload, topic);
    if (!channel) return;
    const now = Number(frame.capturedAt || Date.now());
    for (const [key, value] of activeBattleEvents) {
      if (now - value.lastAt > ACTIVE_BATTLE_TTL_MS) activeBattleEvents.delete(key);
    }
    const entry = activeBattleEvents.get(channel) || { events: [], lastAt: now };
    entry.events.push(frame);
    if (entry.events.length > ACTIVE_BATTLE_EVENT_LIMIT) entry.events.splice(0, entry.events.length - ACTIVE_BATTLE_EVENT_LIMIT);
    entry.lastAt = now;
    activeBattleEvents.set(channel, entry);
  }

  function analyzerEventPool(events) {
    const combined = [...events, ...Array.from(activeBattleEvents.values()).flatMap((entry) => entry.events)];
    const seen = new Set();
    return combined.filter((event) => {
      const key = `${event.capturedAt}|${event.topic}|${event.event}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((left, right) => Number(left.capturedAt || 0) - Number(right.capturedAt || 0));
  }

  /** 保留實際收到的 PVP 封包；不從畫面或 React state 推測資料。 */
  function capturePvpEvent(event, payload, topic, source = "channel", rawFrame) {
    if (!isRelevantPvpEvent(event, payload, topic)) return;
    observePvpState(event, payload, topic);
    const capturedEvent = {
      capturedAt: Date.now(),
      capturedAtIso: new Date().toISOString(),
      event: String(event),
      topic: typeof topic === "string" ? topic : undefined,
      payload: compactArchivePayload(payload, event, topic),
      source,
      ...(location.hash ? { capturedPath: location.hash } : {}),
    };
    addToActiveBattleBuffer(capturedEvent, event, payload, topic);
    const events = readArray(EVENT_KEY);
    events.push(capturedEvent);
    const evicted = Math.max(0, events.length - MAX_EVENTS);
    if (evicted) events.splice(0, evicted);
    writeEventArchive(events);
    const stats = readCaptureStats();
    const payloadObject = asObject(payload);
    stats.totalCaptured += 1;
    stats.evictedCount += evicted;
    stats.last = {
      capturedAt: Date.now(),
      event: String(event || "(none)").slice(0, 80),
      topic: summariseTopic(topic),
      payloadKeys: Object.keys(payloadObject || {}).slice(0, 12),
      source: String(source || "unknown"),
    };
    writeCaptureStats(stats);
    capturedSinceLoad += 1;
    updateUIPanel();
    forwardNewRecordsToBridge(uniqueAnalyzerRecords(analyzerEventPool(events)));
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  /**
   * 只依已接收的被動 WebSocket 訊框更新面板狀態；不呼叫、不覆寫 Phoenix，
   * 也不改寫、延遲或阻擋任何官方封包。
   */
  const ANI_ROOT_PREFIX = "PvpBattle_rootContainer";
  const ANI_IDENTITY_PREFIXES = {
    playerName: "AniDoor_leftTitle1_",
    playerUnion: "AniDoor_leftTitle2_",
    opponentName: "AniDoor_rightTitle1_",
    opponentUnion: "AniDoor_rightTitle2_",
  };

  function hasClassPrefix(element, prefix) {
    return Boolean(element && typeof element.className === "string" && element.className.split(/\s+/).some((name) => name.startsWith(prefix)));
  }

  function findClassPrefixText(root, prefix) {
    if (!root?.querySelectorAll) return "";
    const nodes = [];
    if (root.nodeType === 1 && hasClassPrefix(root, prefix)) nodes.push(root);
    // CSS Modules 的 class 可能是 AniDoor_leftTitle2__hash，也可能在不同建置中改成其他後綴；
    // 同時使用 class prefix 與 class substring，避免只因 hash／分隔符差異而漏抓。
    nodes.push(...root.querySelectorAll("*"));
    const element = nodes.find((node) => hasClassPrefix(node, prefix) || String(node.className || "").split(/\s+/).some((name) => name.includes(prefix.replace(/_$/, ""))));
    return element?.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) || "";
  }

  function rememberBattleIdentity(channel = currentBattleChannel) {
    if (!channel || !isBattleChannel(channel)) return;
    const snapshot = Object.fromEntries(Object.entries(currentBattleIdentity).filter(([, value]) => typeof value === "string" && value.trim()).map(([key, value]) => [key, value.trim().slice(0, 120)]));
    if (Object.keys(snapshot).length) battleIdentityByChannel.set(String(channel), snapshot);
  }

  function identityForBattle(channel) {
    const channelKey = String(channel || "");
    const saved = battleIdentityByChannel.get(channelKey) || {};
    const current = channelKey === String(currentBattleChannel || "")
      ? Object.fromEntries(Object.entries(currentBattleIdentity).filter(([, value]) => typeof value === "string" && value.trim()))
      : {};
    return { ...saved, ...current };
  }

  function readBattleIdentity(root = identityRoot || document) {
    const next = Object.fromEntries(Object.entries(ANI_IDENTITY_PREFIXES).map(([key, prefix]) => [key, findClassPrefixText(root, prefix) || undefined]));
    const changed = Object.keys(ANI_IDENTITY_PREFIXES).some((key) => next[key] !== currentBattleIdentity[key]);
    if (!changed || (!next.playerName && !next.opponentName)) return false;
    currentBattleIdentity = { ...currentBattleIdentity, ...next };
    rememberBattleIdentity();
    console.log(`[${MOD_NAME}] 已擷取 AniDoor 身份：`, currentBattleIdentity);
    updateUIPanel();
    forwardNewRecordsToBridge(uniqueAnalyzerRecords(analyzerEventPool(readArray(EVENT_KEY))));
    return true;
  }

  function scheduleBattleIdentityRead() {
    if (identityDebounce) clearTimeout(identityDebounce);
    identityDebounce = setTimeout(() => { identityDebounce = null; readBattleIdentity(); }, 250);
  }

  function attachIdentityRoot(root) {
    identityObserver?.disconnect();
    identityRoot = root;
    currentBattleIdentity = { playerName: undefined, playerUnion: undefined, opponentName: undefined, opponentUnion: undefined };
    identityObserver = new MutationObserver(scheduleBattleIdentityRead);
    identityObserver.observe(root, { childList: true, subtree: true, characterData: true });
    scheduleBattleIdentityRead();
  }

  function installAniDoorCapture() {
    const findRoot = () => Array.from(document.querySelectorAll("div")).find((element) => hasClassPrefix(element, ANI_ROOT_PREFIX));
    const existing = findRoot();
    if (existing) attachIdentityRoot(existing);
    const rootDiscoveryObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const root = hasClassPrefix(node, ANI_ROOT_PREFIX) ? node : node.querySelector?.("div[class*='PvpBattle_rootContainer']");
          if (root) attachIdentityRoot(root);
        }
        for (const node of mutation.removedNodes) {
          if (node === identityRoot || node.contains?.(identityRoot)) {
            identityObserver?.disconnect(); identityObserver = null; identityRoot = null;
            currentBattleIdentity = { playerName: undefined, playerUnion: undefined, opponentName: undefined, opponentUnion: undefined };
          }
        }
      }
    });
    rootDiscoveryObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.__RF_PVP_ANI_DOOR_CAPTURE__ = { read: () => readBattleIdentity(), stop: () => { rootDiscoveryObserver.disconnect(); identityObserver?.disconnect(); } };
  }

  function observePvpState(event, payload, topic) {
    const status = String(payload?.status || "").toLowerCase();
    const eventName = String(event || "").toLowerCase();
    const isMatchFrame = eventName === "pvp_battle" || String(topic || "").toLowerCase().includes("pvp");
    if (isMatchFrame && status === "matching") isMatching = true;
    if (isMatchFrame && status === "matched" && isBattleChannel(payload?.channel)) {
      isMatching = false;
      currentBattleChannel = payload.channel;
      rememberBattleIdentity(currentBattleChannel);
    }
    if (isMatchFrame && (status === "error" || status === "can_join" || payload?.error)) {
      isMatching = false;
      currentBattleChannel = null;
    }
    const nextAction = String(unwrapPhoenixResponse(payload)?.next_action || payload?.next_action || "").toLowerCase();
    if (["battle_result", "team_confirmed", "surrender"].includes(eventName) || nextAction === "medals") isMatching = false;
  }

  function firstValue(record, keys) {
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null) return record[key];
    }
    return undefined;
  }

  function normaliseOutcome(value) {
    const text = String(value ?? "").trim().toLowerCase();
    if (["win", "won", "victory", "勝", "勝利", "true"].includes(text)) return "win";
    if (["loss", "lose", "lost", "defeat", "敗", "失敗", "false"].includes(text)) return "loss";
    if (["draw", "tie", "平手"].includes(text)) return "draw";
    return "unknown";
  }

  function normaliseMode(value, playerTeam, opponentTeam) {
    const text = String(value ?? "").toLowerCase().replaceAll(" ", "");
    if (text.includes("1v1") || text === "1") return "1v1";
    if (text.includes("3v3") || text === "3") return "3v3";
    if (text.includes("5v5") || text === "5") return "5v5";
    if (Array.isArray(playerTeam) && Array.isArray(opponentTeam) && playerTeam.length === opponentTeam.length) {
      if (playerTeam.length === 1) return "1v1";
      if (playerTeam.length === 3) return "3v3";
      if (playerTeam.length === 5) return "5v5";
    }
    return null;
  }

  function normalisePositiveInt(value) {
    const numberValue = typeof value === "number" ? value : Number(value);
    return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
  }

  /**
   * 相容舊式單一封包。真實 PVP 戰鬥由下方的跨訊框聚合處理。
   */
  function buildSingleFrameAnalyzerRecord(capturedEvent) {
    const payload = asObject(capturedEvent.payload);
    if (!payload) return null;
    const playerTeam = firstValue(payload, ["playerTeam", "player_team", "myTeam", "my_team", "team"]);
    const opponentTeam = firstValue(payload, ["opponentTeam", "opponent_team", "enemyTeam", "enemy_team"]);
    if (!Array.isArray(playerTeam) || !Array.isArray(opponentTeam)) return null;

    const mode = normaliseMode(firstValue(payload, ["mode", "battleMode", "battle_mode", "type"]), playerTeam, opponentTeam);
    const outcome = normaliseOutcome(firstValue(payload, ["outcome", "result", "winner", "status"]));
    if (!mode || playerTeam.length < 1 || opponentTeam.length < 1) return null;

    const record = {
      battleAt: capturedEvent.capturedAt,
      mode,
      outcome,
      playerTeam,
      opponentTeam,
      sourceEvent: capturedEvent.event,
      sourceCapturedAt: capturedEvent.capturedAtIso,
      rawEvent: capturedEvent.payload,
    };
    const opponentName = firstValue(payload, ["opponentName", "opponent_name"]);
    const rankBefore = normalisePositiveInt(firstValue(payload, ["rankBefore", "rank_before", "preRank", "pre_rank"]));
    const rankAfter = normalisePositiveInt(firstValue(payload, ["rankAfter", "rank_after", "postRank", "post_rank"]));
    if (typeof opponentName === "string" && opponentName.trim()) record.opponentName = opponentName.trim();
    if (rankBefore) record.rankBefore = rankBefore;
    if (rankAfter) record.rankAfter = rankAfter;
    return record;
  }

  function unwrapPhoenixResponse(payload) {
    const value = asObject(payload);
    return asObject(value?.response) || value;
  }

  function isBattleChannel(topic) {
    return /^pvp_battle:[^:\s]+$/i.test(String(topic || ""));
  }

  function extractPlayerIdFromTopic(topic) {
    const match = /^player:(\d+)$/i.exec(String(topic || ""));
    return match ? normalisePositiveInt(match[1]) : undefined;
  }

  function numericIdentityEquals(left, right) {
    const normalLeft = normalisePositiveInt(left);
    const normalRight = normalisePositiveInt(right);
    return Boolean(normalLeft && normalRight && normalLeft === normalRight);
  }

  function resolveWarriorName(warrior) {
    const name = warrior?.name;
    if (typeof name === "string" && name.trim()) return name.trim();
    const translations = asObject(name);
    for (const locale of ["zh_TW", "zh_CN", "en", "jp"]) {
      if (typeof translations?.[locale] === "string" && translations[locale].trim()) return translations[locale].trim();
    }
    return "(unknown)";
  }

  function buildTeamFromWarriors(warriors, defender) {
    const collection = Array.isArray(warriors) ? warriors : Object.values(asObject(warriors) || {});
    return collection
      .map(asObject)
      .filter((warrior) => warrior && warrior.defender === defender)
      .sort((left, right) => {
        const positionDiff = Number(left.position || 0) - Number(right.position || 0);
        return positionDiff || Number(left.id || 0) - Number(right.id || 0);
      })
      .map((warrior) => {
        const member = { name: resolveWarriorName(warrior) };
        const level = normalisePositiveInt(warrior.level);
        if (level) member.level = level;
        if (typeof warrior.abbr === "string" && warrior.abbr.trim()) member.role = warrior.abbr.trim();
        member.raw = redactAndClone(warrior);
        return member;
      });
  }

  function findInitialBattleSnapshot(battleEvents) {
    for (const capturedEvent of battleEvents) {
      const payload = unwrapPhoenixResponse(capturedEvent.payload);
      if (asObject(payload?.offender) && asObject(payload?.defender) && (payload?.id || payload?.battle_type)) {
        return { capturedEvent, payload };
      }
    }
    return null;
  }

  function hasWarriors(value) {
    if (Array.isArray(value)) return value.length > 0;
    const warriors = asObject(value);
    return Boolean(warriors && Object.keys(warriors).length > 0);
  }

  function findTerminalBattleSnapshot(battleEvents) {
    for (let index = battleEvents.length - 1; index >= 0; index -= 1) {
      const capturedEvent = battleEvents[index];
      const payload = unwrapPhoenixResponse(capturedEvent.payload);
      const round = asObject(payload?.round);
      if (String(payload?.next_action || "").toLowerCase() === "medals" && hasWarriors(round?.warriors)) {
        return { capturedEvent, payload };
      }
    }
    return null;
  }

  /**
   * 官方結果頁的 player channel medals 回覆目前格式為：
   * { "1v1": { score, rank }, "3v3": {...}, medals: [...], previous_record: { "1v1": {...} } }。
   * 較舊相容格式則可能把模式資料包在 medals 物件中。僅採用這個官方回覆判斷結果。
   */
  function findPlayerMedalsEvents(events) {
    return events
      .map((capturedEvent) => {
        const response = unwrapPhoenixResponse(capturedEvent?.payload);
        const nestedMedals = asObject(response?.medals);
        const hasTopLevelMode = Boolean(asObject(response?.["1v1"]) || asObject(response?.["3v3"]) || asObject(response?.["5v5"]));
        const hasNestedMode = Boolean(asObject(nestedMedals?.["1v1"]) || asObject(nestedMedals?.["3v3"]) || asObject(nestedMedals?.["5v5"]));
        const hasPreviousRecord = Boolean(asObject(response?.previous_record) || asObject(nestedMedals?.previous_record));
        // 某些結果回覆只帶目前 medals 與 score/rank，不帶 previous_record；仍可保存戰績，
        // 但 extractMedalsMetrics 會在缺少前值時保留 unknown／缺少的變化欄位，不做推測。
        const hasCurrentResult = hasTopLevelMode || hasNestedMode;
        if (!/^player:\d+$/i.test(String(capturedEvent?.topic || "")) || !hasCurrentResult) return null;
        return { capturedEvent, response };
      })
      .filter(Boolean)
      .sort((left, right) => Number(left.capturedEvent.capturedAt || 0) - Number(right.capturedEvent.capturedAt || 0));
  }

  function normaliseNonNegativeInt(value) {
    const numberValue = typeof value === "number" ? value : Number(value);
    return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : undefined;
  }

  function extractMedalsMetrics(response, mode) {
    const nestedMedals = asObject(response?.medals);
    const current = asObject(response?.[mode]) || asObject(nestedMedals?.[mode]);
    const previous = asObject(asObject(response?.previous_record)?.[mode]) || asObject(asObject(nestedMedals?.previous_record)?.[mode]);
    if (!current) return null;
    const scoreAfter = normaliseNonNegativeInt(current.score);
    const scoreBefore = normaliseNonNegativeInt(previous?.score);
    const rankAfter = normalisePositiveInt(current.rank);
    const rankBefore = normalisePositiveInt(previous?.rank);
    const scoreChange = scoreAfter !== undefined && scoreBefore !== undefined ? scoreAfter - scoreBefore : undefined;
    const rankChange = rankAfter !== undefined && rankBefore !== undefined ? rankBefore - rankAfter : undefined;
    return {
      scoreBefore,
      scoreAfter,
      scoreChange,
      rankBefore,
      rankAfter,
      rankChange,
      outcome: scoreChange > 0 ? "win" : scoreChange < 0 ? "loss" : "unknown",
    };
  }

  function enrichRecordsWithPlayerMedals(records, events) {
    const resultEvents = findPlayerMedalsEvents(events);
    if (!resultEvents.length || !records.length) return records;

    const enrichments = new Map();
    for (const resultEvent of resultEvents) {
      const resultTime = Number(resultEvent.capturedEvent.capturedAt || 0);
      const candidates = records
        .filter((record) => Number(record.battleAt || 0) <= resultTime && extractMedalsMetrics(resultEvent.response, record.mode))
        .sort((left, right) => Number(right.battleAt || 0) - Number(left.battleAt || 0));
      if (candidates[0]) enrichments.set(candidates[0].sourceBattleChannel || candidates[0].battleAt, resultEvent);
    }

    return records.map((record) => {
      const resultEvent = enrichments.get(record.sourceBattleChannel || record.battleAt);
      if (!resultEvent) return record;
      const metrics = extractMedalsMetrics(resultEvent.response, record.mode);
      if (!metrics) return record;
      return {
        ...record,
        ...(metrics.outcome !== "unknown" ? { outcome: metrics.outcome } : {}),
        ...(metrics.rankBefore ? { rankBefore: metrics.rankBefore } : {}),
        ...(metrics.rankAfter ? { rankAfter: metrics.rankAfter } : {}),
        scoreBefore: metrics.scoreBefore,
        scoreAfter: metrics.scoreAfter,
        scoreChange: metrics.scoreChange,
        rankChange: metrics.rankChange,
        resultEvidence: "official_player_medals",
        sourceResultMedalsTopic: resultEvent.capturedEvent.topic,
        sourceResultMedalsCapturedAt: resultEvent.capturedEvent.capturedAtIso,
        ...(identityForBattle(record.sourceBattleChannel).playerName ? { playerName: identityForBattle(record.sourceBattleChannel).playerName } : {}),
        ...(identityForBattle(record.sourceBattleChannel).playerUnion ? { playerUnion: identityForBattle(record.sourceBattleChannel).playerUnion } : {}),
        ...(identityForBattle(record.sourceBattleChannel).opponentName ? { opponentName: identityForBattle(record.sourceBattleChannel).opponentName } : {}),
        ...(identityForBattle(record.sourceBattleChannel).opponentUnion ? { opponentUnion: identityForBattle(record.sourceBattleChannel).opponentUnion } : {}),
        rawEvent: {
          ...record.rawEvent,
          resultMedals: redactAndClone(resultEvent.response),
        },
      };
    });
  }

  /**
   * 真實 PVP 協定會將配對、玩家身分、戰鬥狀態與最終角色快照分散在多個訊框。
   * 僅在 player:<id> 的 matched 訊框、該戰鬥的雙方初始狀態，以及 medals 終局快照
   * 都存在時建立紀錄。勝負與排名不會從血量、獎牌動畫或畫面推測。
   */
  function aggregatePvpBattleRecords(events) {
    const matchedByChannel = new Map();
    const eventsByChannel = new Map();

    for (const capturedEvent of events) {
      const topic = String(capturedEvent?.topic || "");
      const payload = asObject(capturedEvent?.payload);
      const playerUserId = extractPlayerIdFromTopic(topic);
      if (
        playerUserId
        && capturedEvent?.event === "pvp_battle"
        && String(payload?.status || "").toLowerCase() === "matched"
        && isBattleChannel(payload?.channel)
      ) {
        const existing = matchedByChannel.get(payload.channel);
        if (!existing || Number(capturedEvent.capturedAt || 0) < Number(existing.capturedAt || 0)) {
          matchedByChannel.set(payload.channel, { capturedEvent, playerUserId, payload });
        }
      }
      if (isBattleChannel(topic)) {
        const channelEvents = eventsByChannel.get(topic) || [];
        channelEvents.push(capturedEvent);
        eventsByChannel.set(topic, channelEvents);
      }
    }

    const records = [];
    for (const [channel, matched] of matchedByChannel.entries()) {
      const battleEvents = eventsByChannel.get(channel) || [];
      const initial = findInitialBattleSnapshot(battleEvents);
      const terminal = findTerminalBattleSnapshot(battleEvents);
      if (!initial || !terminal) continue;

      const offender = asObject(initial.payload.offender);
      const defender = asObject(initial.payload.defender);
      const iamDefender = numericIdentityEquals(matched.playerUserId, defender?.user_id);
      const iamOffender = numericIdentityEquals(matched.playerUserId, offender?.user_id);
      if (!iamDefender && !iamOffender) continue;

      const playerTeam = buildTeamFromWarriors(terminal.payload.round.warriors, iamDefender);
      const opponentTeam = buildTeamFromWarriors(terminal.payload.round.warriors, !iamDefender);
      const mode = normaliseMode(initial.payload.battle_type, playerTeam, opponentTeam);
      if (!mode || playerTeam.length < 1 || opponentTeam.length < 1) continue;

      const player = iamDefender ? defender : offender;
      const opponent = iamDefender ? offender : defender;
      const battleId = firstValue(initial.payload, ["id", "battle_id"]) || channel.split(":")[1];
      const battleIdentity = identityForBattle(channel);
      records.push({
        battleAt: Number(matched.capturedEvent.capturedAt || initial.capturedEvent.capturedAt || Date.now()),
        mode,
        outcome: "unknown",
        playerTeam,
        opponentTeam,
        ...(typeof player?.name === "string" && player.name.trim() ? { playerName: player.name.trim() } : {}),
        ...(typeof opponent?.name === "string" && opponent.name.trim() ? { opponentName: opponent.name.trim() } : {}),
        ...(battleIdentity.playerName ? { playerName: battleIdentity.playerName } : {}),
        ...(battleIdentity.playerUnion ? { playerUnion: battleIdentity.playerUnion } : {}),
        ...(battleIdentity.opponentName ? { opponentName: battleIdentity.opponentName } : {}),
        ...(battleIdentity.opponentUnion ? { opponentUnion: battleIdentity.opponentUnion } : {}),
        sourceBattleChannel: channel,
        sourceBattleId: battleId,
        sourcePlayerTopic: matched.capturedEvent.topic,
        sourcePlayerUserId: matched.playerUserId,
        playerSide: iamDefender ? "defender" : "offender",
        terminalAction: "medals",
        sourceEventCount: battleEvents.length,
        sourceEvents: battleEvents.map((event) => ({
          capturedAt: event.capturedAt,
          capturedAtIso: event.capturedAtIso,
          event: event.event,
          topic: event.topic,
        })),
        rawEvent: {
          matched: matched.payload,
          initial: initial.payload,
          terminal: terminal.payload,
          player: player ? redactAndClone(player) : undefined,
          opponent: opponent ? redactAndClone(opponent) : undefined,
        },
      });
    }
    return records;
  }

  function uniqueAnalyzerRecords(events) {
    const found = new Set();
    const records = [
      ...enrichRecordsWithPlayerMedals(aggregatePvpBattleRecords(events), events),
      ...events.map(buildSingleFrameAnalyzerRecord).filter(Boolean),
    ];
    return records.filter((record) => {
      if (!record) return false;
      const key = record.sourceBattleChannel || JSON.stringify([record.battleAt, record.mode, record.outcome, record.playerTeam, record.opponentTeam, record.rankAfter]);
      if (found.has(key)) return false;
      found.add(key);
      return true;
    });
  }

  function safeBridgeTeam(team) {
    return (Array.isArray(team) ? team : []).slice(0, 5).map((member) => {
      const output = {};
      if (typeof member?.name === "string" && member.name.trim()) output.name = member.name.trim().slice(0, 120);
      for (const key of ["level", "power"]) {
        const value = Number(member?.[key]);
        if (Number.isFinite(value) && value >= 0) output[key] = Math.trunc(value);
      }
      for (const key of ["role", "rarity"]) {
        if (typeof member?.[key] === "string" && member[key].trim()) output[key] = member[key].trim().slice(0, 80);
      }
      return output.name ? output : null;
    }).filter(Boolean);
  }

  function bridgeSummary(record) {
    return {
      battleAt: Number(record.battleAt),
      mode: record.mode,
      outcome: ["win", "loss", "draw", "unknown"].includes(record.outcome) ? record.outcome : "unknown",
      playerTeam: safeBridgeTeam(record.playerTeam),
      opponentTeam: safeBridgeTeam(record.opponentTeam),
      workspaceId: String(record.sourcePlayerUserId || "").slice(0, 80),
      ...(typeof record.playerName === "string" ? { playerName: record.playerName.slice(0, 120) } : {}),
      ...(typeof record.playerUnion === "string" ? { playerUnion: record.playerUnion.slice(0, 120) } : {}),
      ...(typeof record.opponentName === "string" ? { opponentName: record.opponentName.slice(0, 120) } : {}),
      ...(typeof record.opponentUnion === "string" ? { opponentUnion: record.opponentUnion.slice(0, 120) } : {}),
      ...(Number.isInteger(record.rankBefore) && record.rankBefore >= 0 ? { rankBefore: record.rankBefore } : {}),
      ...(Number.isInteger(record.rankAfter) && record.rankAfter >= 0 ? { rankAfter: record.rankAfter } : {}),
      ...(Number.isInteger(record.scoreBefore) && record.scoreBefore >= 0 ? { scoreBefore: record.scoreBefore } : {}),
      ...(Number.isInteger(record.scoreAfter) && record.scoreAfter >= 0 ? { scoreAfter: record.scoreAfter } : {}),
      sourceBattleChannel: String(record.sourceBattleChannel || "").slice(0, 500),
      sourceBattleId: String(record.sourceBattleId || record.battleAt).slice(0, 500),
    };
  }

  function forwardNewRecordsToBridge(records) {
    const sendMatch = window.RFLocalBridge?.sendMatch;
    if (typeof sendMatch !== "function") return;
    for (const record of Array.isArray(records) ? records : []) {
      if (record.resultEvidence !== "official_player_medals") continue;
      const key = String(record.sourceBattleChannel || record.sourceBattleId || `${record.battleAt}:${record.mode}`);
      const summary = bridgeSummary(record);
      const identitySignature = [summary.playerName, summary.playerUnion, summary.opponentName, summary.opponentUnion].join("|");
      if (bridgeSentKeys.get(key) === identitySignature) continue;
      if (!summary.playerTeam.length || !summary.opponentTeam.length) continue;
      bridgeSentKeys.set(key, identitySignature);
      Promise.resolve(sendMatch(summary)).then((result) => {
        console.log(`[${MOD_NAME}] 已轉送完整戰績至後端：`, result);
      }).catch((error) => {
        bridgeSentKeys.delete(key);
        console.warn(`[${MOD_NAME}] 後端未接收，保留本機匯出：`, error?.message || error);
      });
    }
  }

  function attachTransportTap(reason = "initial") {
    const tap = window.__RF_PVP_SOCKET_TAP__;
    if (!tap || typeof tap.subscribe !== "function") {
      transportMessage = "未偵測到預先安裝的 Socket 觀察器；請更新載入器並完整重新整理";
      transportAttached = false;
      console.warn(`[${MOD_NAME}] ${transportMessage}`);
      updateUIPanel();
      return false;
    }
    tap.ensure?.();
    if (tap === subscribedTransportTap && transportAttached) {
      const currentStatus = tap.getStatus?.();
      transportMessage = `被動 Socket 觀察已啟用（已建立 ${Number(currentStatus?.socketCount || 0)} 條連線；${currentStatus?.active === false ? "等待載入器重新掛載" : "監聽中"}）`;
      updateUIPanel();
      return true;
    }
    if (unsubscribeTransport) {
      try { unsubscribeTransport(); } catch (error) { console.warn(`[${MOD_NAME}] 舊 Socket 訂閱解除失敗：`, error); }
    }
    unsubscribeTransport = tap.subscribe((frame) => {
      if (frame?.diagnosticOnly) {
        capturePvpCandidateSummary(frame);
        return;
      }
      capturePvpEvent(frame.event || "websocket_message", frame.payload, frame.topic, "websocket", frame.raw);
    });
    subscribedTransportTap = tap;
    transportAttached = true;
    const status = tap.getStatus?.();
    transportMessage = `被動 Socket 觀察已啟用（已建立 ${Number(status?.socketCount || 0)} 條連線；${reason === "initial" ? "初始化" : "回到頁面後已重新確認"}）`;
    updateUIPanel();
    return true;
  }

  function createUIPanel() {
    if (uiPanel) return;
    uiPanel = document.createElement("div");
    uiPanel.id = "rf-pvp-guard-panel";
    uiPanel.style.cssText = "position:fixed;right:20px;top:350px;width:280px;background:rgba(0,0,0,.9);border:1px solid #ff4444;border-radius:8px;color:#fff;font-family:monospace;font-size:12px;z-index:10002;padding:0;box-shadow:0 4px 15px rgba(0,0,0,.5);overflow:hidden;";

    const header = document.createElement("div");
    header.style.cssText = "background:#cc0000;padding:8px 12px;cursor:move;display:flex;justify-content:space-between;align-items:center;font-weight:bold;user-select:none;touch-action:none;";
    header.innerHTML = "<span>PVP 被動監測</span><div><span id='rf-pvp-min-btn' style='margin-right:10px'>[－]</span><span id='rf-pvp-close-btn'>[✕]</span></div>";

    const body = document.createElement("div");
    body.id = "rf-pvp-guard-body";
    body.style.padding = "10px";
    body.innerHTML = "<div id='rf-pvp-status' style='margin-bottom:6px;color:#00ff00'>狀態：待機中</div><div id='rf-pvp-bridge' style='margin-bottom:6px;color:#ffcc00;font-size:10px;line-height:1.35'>後端：連線確認中</div><div id='rf-pvp-transport' style='margin-bottom:6px;color:#ffcc00;font-size:10px;line-height:1.35'>傳輸：初始化中</div><div id='rf-pvp-capture-count' style='margin-bottom:3px;color:#9fc4ff'>PVP 快取：0 / 160</div><div id='rf-pvp-capture-detail' style='margin-bottom:8px;color:#aab;font-size:10px;line-height:1.35'>尚未收到 PVP 候選封包</div><div style='border-top:1px solid #444;padding-top:8px'><div style='margin-bottom:5px;color:#8fd3ff'>已辨識戰績：</div><div id='rf-pvp-record-summary' style='background:#111;padding:5px;font-size:10px;line-height:1.45;border-radius:4px'>尚未收集到完整戰鬥</div></div><div style='border-top:1px solid #444;margin-top:8px;padding-top:8px'><div style='margin-bottom:5px;color:#aaa'>攔截異常日誌：</div><div id='rf-pvp-logs' style='max-height:90px;overflow-y:auto;background:#111;padding:5px;font-size:10px;border-radius:4px'>無記錄</div></div><button id='rf-pvp-copy-btn' style='width:100%;margin-top:10px;padding:5px;background:#444;color:white;border:none;border-radius:4px;cursor:pointer'>複製同步診斷</button>";

    uiPanel.append(header, body);
    document.body.appendChild(uiPanel);
    const savedPosition = readPanelPosition();
    if (savedPosition) {
      uiPanel.style.left = `${Math.min(Math.max(0, savedPosition.left), Math.max(0, window.innerWidth - uiPanel.offsetWidth))}px`;
      uiPanel.style.top = `${Math.min(Math.max(0, savedPosition.top), Math.max(0, window.innerHeight - uiPanel.offsetHeight))}px`;
      uiPanel.style.right = "auto";
    }

    let dragging = false;
    let suppressHeaderClick = false;
    let offsetX = 0;
    let offsetY = 0;
    let startX = 0;
    let startY = 0;
    header.addEventListener("pointerdown", (event) => {
      if (event.target.closest("#rf-pvp-min-btn, #rf-pvp-close-btn")) return;
      const rect = uiPanel.getBoundingClientRect();
      dragging = true;
      suppressHeaderClick = false;
      startX = event.clientX;
      startY = event.clientY;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      header.setPointerCapture?.(event.pointerId);
    });
    header.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const maxLeft = Math.max(0, window.innerWidth - uiPanel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - uiPanel.offsetHeight);
      const left = Math.min(Math.max(0, event.clientX - offsetX), maxLeft);
      const top = Math.min(Math.max(0, event.clientY - offsetY), maxTop);
      if (Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3) suppressHeaderClick = true;
      uiPanel.style.left = `${left}px`;
      uiPanel.style.top = `${top}px`;
      uiPanel.style.right = "auto";
    });
    header.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      dragging = false;
      header.releasePointerCapture?.(event.pointerId);
      const rect = uiPanel.getBoundingClientRect();
      savePanelPosition(rect.left, rect.top);
      if (suppressHeaderClick) window.setTimeout(() => { suppressHeaderClick = false; }, 0);
    });
    header.addEventListener("pointercancel", () => { dragging = false; });

    header.onclick = (event) => {
      if (suppressHeaderClick) return;
      if (event.target.id === "rf-pvp-close-btn") {
        uiPanel.style.display = "none";
        return;
      }
      const isMinimised = body.style.display === "none";
      body.style.display = isMinimised ? "block" : "none";
      document.getElementById("rf-pvp-min-btn").innerText = isMinimised ? "[－]" : "[＋]";
    };
    document.getElementById("rf-pvp-copy-btn").onclick = async () => {
      const diagnostics = {
        guardVersion: 12,
        transport: window.__RF_PVP_SOCKET_TAP__?.getStatus?.() || { attached: false, message: transportMessage },
        captureStats: readCaptureStats(),
        capturedSinceLoad,
        recognisedMatchCount: uniqueAnalyzerRecords(analyzerEventPool(readArray(EVENT_KEY))).length,
        logs: readArray(LOG_KEY),
      };
      const logs = JSON.stringify(diagnostics, null, 2);
      try {
        await navigator.clipboard.writeText(logs);
        console.log(`[${MOD_NAME}] 已複製安全診斷摘要：`, diagnostics);
      } catch (error) {
        console.error(`[${MOD_NAME}] 無法寫入剪貼簿：`, error);
      }
    };
    updateUIPanel();
  }

  function updateUIPanel() {
    if (!uiPanel) return;
    const statusEl = document.getElementById("rf-pvp-status");
    if (statusEl) {
      statusEl.innerText = isMatching ? "狀態：正在配對中…" : "狀態：待機中";
      statusEl.style.color = isMatching ? "#ffcc00" : "#00ff00";
    }
    const capturedEvents = readArray(EVENT_KEY);
    const analyzerRecords = uniqueAnalyzerRecords(capturedEvents);
    const countEl = document.getElementById("rf-pvp-capture-count");
    const captureStats = readCaptureStats();
    if (countEl) countEl.innerText = `PVP 快取：${capturedEvents.length} / ${MAX_EVENTS}（本頁新增 ${capturedSinceLoad}）`;
    const captureDetailEl = document.getElementById("rf-pvp-capture-detail");
    if (captureDetailEl) {
      const last = captureStats.last;
      captureDetailEl.textContent = last
        ? `PVP 累計 ${captureStats.totalCaptured}；循環淘汰 ${captureStats.evictedCount}。最近：${last.topic} / ${last.event}（${new Date(last.capturedAt).toLocaleTimeString()}）${captureStats.lastCandidate ? `；候選摘要 ${captureStats.candidateSummaryCount}，最近 ${captureStats.lastCandidate.topic} / ${captureStats.lastCandidate.event}` : ""}`
        : (captureStats.lastCandidate ? `尚未辨識 PVP；安全候選摘要 ${captureStats.candidateSummaryCount}，最近：${captureStats.lastCandidate.topic} / ${captureStats.lastCandidate.event}` : "尚未收到 PVP 候選封包");
    }
    const bridgeEl = document.getElementById("rf-pvp-bridge");
    if (bridgeEl) {
      const bridge = window.RFLocalBridge?.getStatus?.();
      const statusLabels = { connecting: "連線中", online: "已連線", sending: "上傳中", reconnecting: "重連中" };
      const label = statusLabels[bridge?.status] || "未啟用";
      const heartbeat = bridge?.lastHeartbeatAt ? `；最近心跳 ${new Date(bridge.lastHeartbeatAt).toLocaleTimeString()}` : "";
      const failure = bridge?.consecutiveFailures ? `；失敗 ${bridge.consecutiveFailures} 次` : "";
      bridgeEl.textContent = `後端：${label}｜${bridge?.message || "未初始化"}${heartbeat}${failure}`;
      bridgeEl.style.color = bridge?.status === "online" ? "#7dff9a" : bridge?.status === "reconnecting" ? "#ff8888" : "#ffcc00";
      if (bridge?.lastError) bridgeEl.title = `最近錯誤：${bridge.lastError}`;
    }
    const transportEl = document.getElementById("rf-pvp-transport");
    if (transportEl) {
      const transportStats = window.__RF_PVP_SOCKET_TAP__?.getStatus?.();
      transportEl.innerText = `傳輸：${transportMessage}；本載入器收到 ${Number(transportStats?.receivedMessageCount || 0)} 則訊框，轉送 ${Number(transportStats?.forwardedFrameCount || 0)} 則`;
      transportEl.style.color = transportAttached ? "#7dff9a" : "#ffcc00";
    }
    const recordSummaryEl = document.getElementById("rf-pvp-record-summary");
    if (recordSummaryEl) {
      const latestRecord = analyzerRecords.at(-1);
      if (!latestRecord) {
        recordSummaryEl.textContent = "尚未收集到完整戰鬥；需同時收到 matched、初始狀態與 medals 終局快照。";
      } else {
        const capturedAt = new Date(Number(latestRecord.battleAt)).toLocaleString();
        const resultText = latestRecord.outcome === "win" ? "勝利" : latestRecord.outcome === "loss" ? "敗北" : "待確認";
        const rankText = latestRecord.rankBefore && latestRecord.rankAfter ? `排名 ${latestRecord.rankBefore} → ${latestRecord.rankAfter}` : "排名待確認";
        recordSummaryEl.textContent = `已聚合 ${analyzerRecords.length} 場；最新：${latestRecord.mode}／${latestRecord.playerTeam.length} 對 ${latestRecord.opponentTeam.length}，${resultText}，${rankText}。\n${capturedAt}`;
      }
    }
    const logsEl = document.getElementById("rf-pvp-logs");
    if (logsEl) {
      const logs = readArray(LOG_KEY).slice().reverse();
      logsEl.innerHTML = logs.length
        ? logs.map((log) => `<div style='margin-bottom:5px;border-bottom:1px solid #222;padding-bottom:2px'><span style='color:#888'>[${String(log.timestamp || "").split(" ").at(-1) || ""}]</span> <span style='color:${log.type === "DOUBLE_MATCH" ? "#ff4444" : "#ffcc00"}'>${log.type}</span></div>`).join("")
        : "無記錄";
    }
  }

  window.RF_PVP_Debug = {
    getLogs: () => readArray(LOG_KEY),
    getCapturedEvents: () => readArray(EVENT_KEY),
    getAnalyzerRecords: () => uniqueAnalyzerRecords(analyzerEventPool(readArray(EVENT_KEY))),
    getCaptureDiagnostics: () => ({ captureStats: readCaptureStats(), capturedSinceLoad, transport: window.__RF_PVP_SOCKET_TAP__?.getStatus?.() || null }),
    clearCapturedEvents: () => writeArray(EVENT_KEY, []),
      getTransportStatus: () => window.__RF_PVP_SOCKET_TAP__?.getStatus?.() || { attached: false, message: transportMessage },
    getBridgeStatus: () => window.RFLocalBridge?.getStatus?.() || { status: "unavailable", message: "未安裝 bridge client" },
    onBridgeStatus: updateUIPanel,
  };

  const reattachAfterReturn = () => attachTransportTap("return");
  window.addEventListener("pageshow", reattachAfterReturn);
  window.addEventListener("focus", reattachAfterReturn);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) reattachAfterReturn();
  });
  installAniDoorCapture();
  if (document.readyState === "complete") createUIPanel();
  else window.addEventListener("load", createUIPanel, { once: true });
  attachTransportTap();
  console.log(`[${MOD_NAME}] v12 已載入；後端狀態提供連線中／已連線／上傳中／重連中，並以 30 秒 health 心跳與退避重連維持閒置復原。僅被動保存 PVP 封包及安全分類摘要，不會攔截 Phoenix 或改寫官方訊框。`);
})();
