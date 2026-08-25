export type LocalBridgeEvent = {
  id: number;
  capturedAt: number;
  type: "match";
  data: Record<string, unknown>;
};

export type LocalBridgeStatus = "disabled" | "checking" | "online" | "offline";
export type LocalBridgeHealth = { ok: boolean; queueSize?: number; latestEventId?: number };

const BRIDGE_ORIGIN = "http://127.0.0.1:8787";
const ENABLED_KEY = "rf-pvp-bridge-enabled";
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
  const response = await request(`${BRIDGE_ORIGIN}/health`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`bridge health HTTP ${response.status}`);
  const payload = await response.json() as LocalBridgeHealth;
  if (!payload.ok) throw new Error("bridge health 未確認");
  return payload;
}

export async function pollLocalBridge(after = getLocalBridgeCursor()): Promise<{ events: LocalBridgeEvent[]; latestEventId: number; queueSize: number }> {
  const response = await request(`${BRIDGE_ORIGIN}/v1/events?after=${encodeURIComponent(String(after))}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`bridge events HTTP ${response.status}`);
  const payload = await response.json() as { events?: LocalBridgeEvent[]; latestEventId?: number; queueSize?: number };
  const events = Array.isArray(payload.events) ? payload.events.filter(event => event && typeof event.id === "number" && event.type === "match" && event.data && typeof event.data === "object") : [];
  return { events, latestEventId: payload.latestEventId ?? after, queueSize: payload.queueSize ?? 0 };
}

export function localBridgeOrigin() { return BRIDGE_ORIGIN; }
