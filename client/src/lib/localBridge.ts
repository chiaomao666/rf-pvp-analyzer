export type LocalBridgeEvent = {
  id: number;
  capturedAt: number;
  type: "match";
  data: Record<string, unknown>;
};

export type LocalBridgeStatus = "disabled" | "checking" | "online" | "offline";
export type LocalBridgeHealth = { ok: boolean; queueSize?: number; latestEventId?: number };
export type BridgeMode = "local" | "remote";
const LOCAL_BRIDGE_ORIGIN = "http://127.0.0.1:8787";
export type BridgeSyncSnapshot = { status: LocalBridgeStatus; mode: BridgeMode; origin: string; lastSyncAt?: number; latestEventId?: number; error?: string };
const syncSnapshot: BridgeSyncSnapshot = { status: "disabled", mode: "local", origin: LOCAL_BRIDGE_ORIGIN };
export function getBridgeSyncSnapshot(): BridgeSyncSnapshot { return { ...syncSnapshot, mode: getBridgeMode(), origin: bridgeOrigin(getBridgeMode()) }; }
export function setBridgeSyncSnapshot(next: Partial<BridgeSyncSnapshot>) { Object.assign(syncSnapshot, next); if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("rf-pvp-bridge-status", { detail: getBridgeSyncSnapshot() })); }

function remoteBridgeOrigin() { return String(import.meta.env.VITE_PVP_BACKEND_ORIGIN || "").replace(/\/+$/, ""); }
const ENABLED_KEY = "rf-pvp-bridge-enabled";
const MODE_KEY = "rf-pvp-bridge-mode";
const MODE_EXPLICIT_KEY = "rf-pvp-bridge-mode-explicit";
const CURSOR_KEY = "rf-pvp-bridge-cursor";
const REMOTE_API_KEY = "rf-pvp-remote-api-key";
const REQUEST_TIMEOUT_MS = 1_200;

function storage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

function request(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => globalThis.clearTimeout(timer));
}

export function getBridgeMode(): BridgeMode {
  const saved = storage()?.getItem(MODE_KEY);
  if (saved === "local" || saved === "remote") {
    // 舊版本可能已把 local 寫入 storage，但沒有記錄使用者曾明確選擇。
    // Pages 有 Worker origin 時，這類舊值應遷移到 remote，避免永久輪詢 127.0.0.1。
    if (saved === "local" && remoteBridgeOrigin() && storage()?.getItem(MODE_EXPLICIT_KEY) !== "true") return "remote";
    return saved;
  }
  // Pages 已注入 Worker origin 時，首次使用不能默認輪詢 127.0.0.1。
  return remoteBridgeOrigin() ? "remote" : "local";
}
export function setBridgeMode(mode: BridgeMode) {
  storage()?.setItem(MODE_KEY, mode);
  storage()?.setItem(MODE_EXPLICIT_KEY, "true");
  if (typeof window !== "undefined") window.dispatchEvent(new Event("rf-pvp-bridge-change"));
}
export function bridgeOrigin(mode = getBridgeMode()) { return mode === "remote" ? remoteBridgeOrigin() : LOCAL_BRIDGE_ORIGIN; }
export function isLocalBridgeEnabled() {
  const saved = storage()?.getItem(ENABLED_KEY);
  if (saved === "true") return true;
  // GitHub Pages 不需要本機網站後端；有 Worker origin 且使用者尚未明確關閉時，
  // 預設直接啟用 remote 同步，讓既有 D1 戰績可在登入後讀回。
  return saved === null && Boolean(remoteBridgeOrigin()) && getBridgeMode() === "remote";
}
export function setLocalBridgeEnabled(enabled: boolean) {
  storage()?.setItem(ENABLED_KEY, String(enabled));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("rf-pvp-bridge-change"));
}
export function getRemoteApiKey() { return storage()?.getItem(REMOTE_API_KEY)?.trim() || ""; }
export function setRemoteApiKey(value: string) {
  const key = value.trim();
  if (key) storage()?.setItem(REMOTE_API_KEY, key); else storage()?.removeItem(REMOTE_API_KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("rf-pvp-bridge-key-change"));
}
export function clearRemoteApiKey() { setRemoteApiKey(""); }
function remoteHeaders(mode: BridgeMode) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (mode === "remote") {
    const key = getRemoteApiKey();
    if (key) headers["X-RF-API-Key"] = key;
  }
  return headers;
}
export function getLocalBridgeCursor() {
  const value = Number(storage()?.getItem(CURSOR_KEY) || 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
export function setLocalBridgeCursor(cursor: number) { storage()?.setItem(CURSOR_KEY, String(Math.max(0, Math.trunc(cursor)))); }

export async function checkLocalBridge(): Promise<LocalBridgeHealth> {
  const mode = getBridgeMode();
  setBridgeSyncSnapshot({ mode, origin: bridgeOrigin(mode), status: "checking", error: undefined });
  if (mode === "remote" && !remoteBridgeOrigin()) throw new Error("尚未設定網站後端網址");
  const endpoint = mode === "remote" ? `${bridgeOrigin(mode)}/api/pvp/health` : `${bridgeOrigin(mode)}/health`;
  const response = await request(endpoint, { headers: remoteHeaders(mode) });
  if (!response.ok) throw new Error(`bridge health HTTP ${response.status}`);
  const payload = await response.json() as LocalBridgeHealth;
  if (!payload.ok) throw new Error("bridge health 未確認");
  setBridgeSyncSnapshot({ status: "online", latestEventId: payload.latestEventId, error: undefined });
  return payload;
}

export async function pollLocalBridge(after = getLocalBridgeCursor()): Promise<{ events: LocalBridgeEvent[]; latestEventId: number; queueSize: number }> {
  const mode = getBridgeMode();
  setBridgeSyncSnapshot({ mode, origin: bridgeOrigin(mode), status: "checking", error: undefined });
  if (mode === "remote" && !remoteBridgeOrigin()) throw new Error("尚未設定網站後端網址");
  const endpoint = mode === "remote" ? `${bridgeOrigin(mode)}/api/pvp/events?workspaceId=${encodeURIComponent(getActiveWorkspaceId())}&after=${encodeURIComponent(String(after))}` : `${bridgeOrigin(mode)}/v1/events?after=${encodeURIComponent(String(after))}`;
  const response = await request(endpoint, { headers: remoteHeaders(mode) });
  if (!response.ok) throw new Error(`bridge events HTTP ${response.status}`);
  const payload = await response.json() as { events?: LocalBridgeEvent[]; latestEventId?: number; queueSize?: number };
  const events = Array.isArray(payload.events) ? payload.events.filter(event => event && typeof event.id === "number" && event.type === "match" && event.data && typeof event.data === "object") : [];
  const latestEventId = payload.latestEventId ?? after;
  setBridgeSyncSnapshot({ status: "online", latestEventId, lastSyncAt: Date.now(), error: undefined });
  return { events, latestEventId, queueSize: payload.queueSize ?? 0 };
}

function getActiveWorkspaceId() { return storage()?.getItem("rf-pvp-active-profile-id")?.replace("official:", "") || ""; }
export function localBridgeOrigin() { return bridgeOrigin("local"); }
