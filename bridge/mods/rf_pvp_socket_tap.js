// RF PVP Socket 被動觀察器
// 固定位置：assets/mods/rf_pvp_socket_tap.js
// 只觀察官方 WebSocket 已接收的排名戰相關訊框；不修改、阻擋、重送或延遲遊戲封包。
(function () {
  "use strict";

  const MOD_NAME = "RF PVP Socket 被動觀察器";
  const existingTap = window.__RF_PVP_SOCKET_TAP__;
  if (existingTap && typeof existingTap.ensure === "function") {
    existingTap.ensure();
    console.log(`[${MOD_NAME}] 已使用既有觀察器。`);
    return;
  }
  if (existingTap) {
    console.warn(`[${MOD_NAME}] 偵測到不相容的既有觀察器，未覆寫。`);
    return;
  }

  const subscribers = new Set();
  const stats = {
    installedAt: Date.now(),
    socketCount: 0,
    receivedMessageCount: 0,
    forwardedFrameCount: 0,
    candidateFrameCount: 0,
    lastCandidate: null,
    reinstallCount: 0,
  };
  let ObservedWebSocket = null;

  function decodeFrame(data) {
    if (typeof data !== "string") return { raw: String(data), topic: "", event: "", payload: null };
    try {
      const decoded = JSON.parse(data);
      if (Array.isArray(decoded)) {
        return { raw: decoded, topic: String(decoded[2] || ""), event: String(decoded[3] || ""), payload: decoded[4] ?? null };
      }
      if (decoded && typeof decoded === "object") {
        return {
          raw: decoded,
          topic: String(decoded.topic || decoded.channel || ""),
          event: String(decoded.event || decoded.type || ""),
          payload: decoded.payload ?? decoded.data ?? null,
        };
      }
      return { raw: decoded, topic: "", event: "", payload: null };
    } catch (_) {
      return { raw: data, topic: "", event: "", payload: null };
    }
  }

  function isPvpFrame(frame) {
    const signature = `${frame.topic} ${frame.event}`.toLowerCase();
    const isResultPagePlayerFrame = /^player:\d+$/i.test(String(frame.topic || ""))
      && location.hash.toLowerCase().includes("/pvpresult");
    return signature.includes("pvp") || isResultPagePlayerFrame;
  }

  function summariseCandidate(frame) {
    const payload = frame.payload && typeof frame.payload === "object" && !Array.isArray(frame.payload) ? frame.payload : null;
    return {
      diagnosticOnly: true,
      capturedAt: Date.now(),
      topic: String(frame.topic || "").replace(/\d+/g, "#").slice(0, 80) || "(none)",
      event: String(frame.event || "(none)").slice(0, 80),
      payloadKeys: Object.keys(payload || {}).slice(0, 12),
      pageHash: location.hash,
    };
  }

  function publish(data, url) {
    const frame = decodeFrame(data);
    stats.receivedMessageCount += 1;
    const pvpFrame = isPvpFrame(frame);
    const battlePage = location.hash.toLowerCase().includes("/pvpbattle");
    if (!pvpFrame && !battlePage) return;
    const entry = pvpFrame
      ? { ...frame, capturedAt: Date.now(), socketUrl: url || "", pageHash: location.hash }
      : summariseCandidate(frame);
    if (pvpFrame) stats.forwardedFrameCount += 1;
    else {
      stats.candidateFrameCount += 1;
      stats.lastCandidate = entry;
    }
    subscribers.forEach((listener) => {
      try { listener(entry); } catch (error) { console.error(`[${MOD_NAME}] 訂閱者失敗：`, error); }
    });
  }

  function installObservedConstructor() {
    const NativeWebSocket = window.WebSocket;
    if (NativeWebSocket === ObservedWebSocket) return true;
    if (typeof NativeWebSocket !== "function") {
      console.warn(`[${MOD_NAME}] 無法安裝：WebSocket 不可用。`);
      return false;
    }

    function PassiveObservedWebSocket(url, protocols) {
      const socket = arguments.length > 1 ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
      stats.socketCount += 1;
      socket.addEventListener("message", (event) => publish(event.data, socket.url));
      return socket;
    }

    PassiveObservedWebSocket.prototype = NativeWebSocket.prototype;
    Object.setPrototypeOf(PassiveObservedWebSocket, NativeWebSocket);
    ObservedWebSocket = PassiveObservedWebSocket;
    window.WebSocket = ObservedWebSocket;
    stats.reinstallCount += 1;
    return true;
  }

  if (!installObservedConstructor()) return;
  const tap = {
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    getStatus() { return { ...stats, active: window.WebSocket === ObservedWebSocket }; },
    ensure() { return installObservedConstructor(); },
  };
  window.__RF_PVP_SOCKET_TAP__ = tap;

  const ensureAfterReturn = () => tap.ensure();
  window.addEventListener("pageshow", ensureAfterReturn);
  window.addEventListener("focus", ensureAfterReturn);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) ensureAfterReturn();
  });
  console.log(`[${MOD_NAME}] 已啟用。`);
})();
