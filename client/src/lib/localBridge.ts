export type LocalBridgeEvent = {
  id: number;
  capturedAt: number;
  type: "match";
  data: Record<string, unknown>;
};

export type LocalBridgeStatus = "disabled" | "checking" | "online" | "offline";
export type LocalBridgeHealth = { ok: boolean; queueSize?: number; latestEventId?: number };

const LOCAL_BRIDGE_ORIGIN = "http://127.0.0.1:8787";
const REMOTE_BRIDGE_ORIGIN = "https://rfpvpanlyz-wgxynphd.manus.space";
const ENABLED_KEY = "rf-pvp-bridge-enabled";
const MODE_KEY = "rf-pvp-bridge-mode";
const CURSOR_KEY = "rf-pvp-bridge-cursor";
const REQUEST_TIMEOUT_MS = 1_200;

function storage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

function request(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => globalThis.clearTimeout(timer));
}

export type BridgeMode = "local" | "remote";
export function getBridgeMode(): BridgeMode { return storage()?.getItem(MODE_KEY) === "remote" ? "remote" : "local"; }
export function setBridgeMode(mode: BridgeMode) { storage()?.setItem(MODE_KEY, mode); if (typeof window !== "undefined") window.dispatchEvent(new Event("rf-pvp-bridge-change")); }
export function bridgeOrigin(mode = getBridgeMode()) { return mode === "remote" ? REMOTE_BRIDGE_ORIGIN : LOCAL_BRIDGE_ORIGIN; }
export function isLocalBridgeEnabled() { return storage()?.getItem(ENABLED_KEY) === "true"; }
export function setLocalBridgeEnabled(enabled: boolean) {
  storage()?.setItem(ENABLED_KEY, String(enabled));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("rf-pvp-bridge-change"));
}
export function getLocalBridgeCursor() {
  const value = Number(storage()?.getItem(CURSOR_KEY) || 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
export function setLocalBridgeCursor(cursor: number) { storage()?.setItem(CURSOR_KEY, String(Math.max(0, Math.trunc(cursor)))); }

export async function checkLocalBridge(): Promise<LocalBridgeHealth> {
  const mode = getBridgeMode();
  const endpoint = mode === "remote" ? `${bridgeOrigin(mode)}/api/pvp/health` : `${bridgeOrigin(mode)}/health`;
  const response = await request(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`bridge health HTTP ${response.status}`);
  const payload = await response.json() as LocalBridgeHealth;
  if (!payload.ok) throw new Error("bridge health 未確認");
  return payload;
}

export async function pollLocalBridge(after = getLocalBridgeCursor()): Promise<{ events: LocalBridgeEvent[]; latestEventId: number; queueSize: number }> {
  const mode = getBridgeMode();
  const endpoint = mode === "remote" ? `${bridgeOrigin(mode)}/api/pvp/events?workspaceId=${encodeURIComponent(getActiveWorkspaceId())}&after=${encodeURIComponent(String(after))}` : `${bridgeOrigin(mode)}/v1/events?after=${encodeURIComponent(String(after))}`;
  const response = await request(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`bridge events HTTP ${response.status}`);
  const payload = await response.json() as { events?: LocalBridgeEvent[]; latestEventId?: number; queueSize?: number };
  const events = Array.isArray(payload.events) ? payload.events.filter(event => event && typeof event.id === "number" && event.type === "match" && event.data && typeof event.data === "object") : [];
  return { events, latestEventId: payload.latestEventId ?? after, queueSize: payload.queueSize ?? 0 };
}

function getActiveWorkspaceId() { return storage()?.getItem("rf-pvp-active-profile-id")?.replace("official:", "") || ""; }
export function localBridgeOrigin() { return bridgeOrigin("local"); }
