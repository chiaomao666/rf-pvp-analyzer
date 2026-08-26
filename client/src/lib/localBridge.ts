export type LocalBridgeEvent = {
  id: number;
  capturedAt: number;
  type: "match";
  data: Record<string, unknown>;
};

export type LocalBridgeStatus = "disabled" | "checking" | "online" | "offline";
export type LocalBridgeHealth = { ok: boolean; durable?: boolean };
export type BridgeMode = "local" | "remote";
export type BridgeSyncSnapshot = { status: LocalBridgeStatus; mode: BridgeMode; origin: string; lastSyncAt?: number; latestEventId?: number; error?: string };
const syncSnapshot: BridgeSyncSnapshot = { status: "disabled", mode: "local", origin: "http://127.0.0.1:8787" };
export function getBridgeSyncSnapshot(): BridgeSyncSnapshot { return { ...syncSnapshot, mode: getBridgeMode(), origin: bridgeOrigin(getBridgeMode()) }; }
export function setBridgeSyncSnapshot(next: Partial<BridgeSyncSnapshot>) { Object.assign(syncSnapshot, next); if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("rf-pvp-bridge-status", { detail: getBridgeSyncSnapshot() })); }

function remoteBridgeOrigin() { return String(import.meta.env.VITE_PVP_BACKEND_ORIGIN || "").replace(/\/+$/, ""); }
const ENABLED_KEY = "rf-pvp-bridge-enabled";
const MODE_KEY = "rf-pvp-bridge-mode";
const MODE_EXPLICIT_KEY = "rf-pvp-bridge-mode-explicit";
const CURSOR_KEY = "rf-pvp-bridge-cursor";
const SITE_SESSION_KEY = "rf-pvp-site-session-active";
const REQUEST_TIMEOUT_MS = 3_000;

function storage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}
function request(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, credentials: "include", signal: controller.signal }).finally(() => globalThis.clearTimeout(timer));
}
function remoteHeaders() { return { Accept: "application/json" }; }
function remoteEndpoint(path: string) { return `${remoteBridgeOrigin()}${path}`; }

export function getBridgeMode(): BridgeMode {
  const saved = storage()?.getItem(MODE_KEY);
  if (saved === "local" || saved === "remote") {
    if (saved === "local" && remoteBridgeOrigin() && storage()?.getItem(MODE_EXPLICIT_KEY) !== "true") return "remote";
    return saved;
  }
  return remoteBridgeOrigin() ? "remote" : "local";
}
export function setBridgeMode(mode: BridgeMode) {
  storage()?.setItem(MODE_KEY, mode); storage()?.setItem(MODE_EXPLICIT_KEY, "true");
  if (typeof window !== "undefined") window.dispatchEvent(new Event("rf-pvp-bridge-change"));
}
export function bridgeOrigin(mode = getBridgeMode()) { return mode === "remote" ? remoteBridgeOrigin() : "http://127.0.0.1:8787"; }
export function isLocalBridgeEnabled() {
  const saved = storage()?.getItem(ENABLED_KEY);
  if (saved === "true") return true;
  return saved === null && Boolean(remoteBridgeOrigin()) && getBridgeMode() === "remote";
}
export function setLocalBridgeEnabled(enabled: boolean) {
  storage()?.setItem(ENABLED_KEY, String(enabled));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("rf-pvp-bridge-change"));
}
export function isRemoteSiteSessionActive() { return storage()?.getItem(SITE_SESSION_KEY) === "true"; }
function setRemoteSiteSessionActive(active: boolean) {
  if (active) storage()?.setItem(SITE_SESSION_KEY, "true"); else storage()?.removeItem(SITE_SESSION_KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("rf-pvp-site-session-change"));
}
export async function loginRemoteSite(password: string) {
  if (!remoteBridgeOrigin()) throw new Error("尚未設定網站後端網址");
  const response = await request(remoteEndpoint("/api/pvp/login"), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ password }) });
  if (!response.ok) throw new Error(response.status === 401 ? "網站密碼錯誤" : `網站登入 HTTP ${response.status}`);
  setRemoteSiteSessionActive(true);
  return true;
}
export async function logoutRemoteSite() {
  if (remoteBridgeOrigin()) await request(remoteEndpoint("/api/pvp/logout"), { method: "POST", headers: remoteHeaders() }).catch(() => undefined);
  setRemoteSiteSessionActive(false);
}
export async function checkRemoteSiteSession() {
  if (!remoteBridgeOrigin()) return false;
  const response = await request(remoteEndpoint("/api/pvp/session"), { headers: remoteHeaders() });
  const active = response.ok;
  setRemoteSiteSessionActive(active);
  return active;
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
  const endpoint = mode === "remote" ? remoteEndpoint("/api/pvp/health") : `${bridgeOrigin(mode)}/health`;
  const response = await request(endpoint, { headers: remoteHeaders() });
  if (!response.ok) throw new Error(response.status === 401 ? "網站尚未登入或登入已過期" : `bridge health HTTP ${response.status}`);
  const payload = await response.json() as LocalBridgeHealth;
  if (!payload.ok) throw new Error("bridge health 未確認");
  setBridgeSyncSnapshot({ status: "online", error: undefined });
  return payload;
}

export async function pollLocalBridge(after = getLocalBridgeCursor()): Promise<{ events: LocalBridgeEvent[]; latestEventId: number; queueSize: number }> {
  const mode = getBridgeMode();
  setBridgeSyncSnapshot({ mode, origin: bridgeOrigin(mode), status: "checking", error: undefined });
  if (mode === "remote" && !remoteBridgeOrigin()) throw new Error("尚未設定網站後端網址");
  const endpoint = mode === "remote" ? `${remoteEndpoint("/api/pvp/events")}?workspaceId=${encodeURIComponent(getActiveWorkspaceId())}&after=${encodeURIComponent(String(after))}` : `${bridgeOrigin(mode)}/v1/events?after=${encodeURIComponent(String(after))}`;
  const response = await request(endpoint, { headers: remoteHeaders() });
  if (!response.ok) throw new Error(response.status === 401 ? "網站尚未登入或登入已過期" : `bridge events HTTP ${response.status}`);
  const payload = await response.json() as { events?: LocalBridgeEvent[]; latestEventId?: number; queueSize?: number };
  const events = Array.isArray(payload.events) ? payload.events.filter(event => event && typeof event.id === "number" && event.type === "match" && event.data && typeof event.data === "object") : [];
  const latestEventId = payload.latestEventId ?? after;
  setBridgeSyncSnapshot({ status: "online", latestEventId, lastSyncAt: Date.now(), error: undefined });
  return { events, latestEventId, queueSize: payload.queueSize ?? 0 };
}
function getActiveWorkspaceId() { return storage()?.getItem("rf-pvp-active-profile-id")?.replace("official:", "") || ""; }
export function localBridgeOrigin() { return bridgeOrigin("local"); }
