const MAX_BODY_BYTES = 512_000;
const ALLOWED_MODES = new Set(["1v1", "3v3", "5v5"]);
const ALLOWED_OUTCOMES = new Set(["win", "loss", "draw", "unknown"]);
const SESSION_COOKIE = "rf_pvp_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
function safeText(value, max = 200) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined; }
function safeTeam(value) {
  return (Array.isArray(value) ? value : []).slice(0, 5).map((member) => {
    const input = asObject(member); const name = safeText(input?.name, 120); if (!name) return null;
    const output = { name };
    for (const key of ["level", "power"]) { const number = Number(input?.[key]); if (Number.isFinite(number) && number >= 0) output[key] = Math.trunc(number); }
    for (const key of ["role", "rarity"]) { const text = safeText(input?.[key], 80); if (text) output[key] = text; }
    return output;
  }).filter(Boolean);
}
export function normalizeCapture(input) {
  const body = asObject(input); const data = asObject(body?.data) || body;
  const workspaceId = safeText(body?.workspaceId || data?.workspaceId, 80); const mode = safeText(data?.mode, 10); const outcome = safeText(data?.outcome, 10);
  const playerTeam = safeTeam(data?.playerTeam); const opponentTeam = safeTeam(data?.opponentTeam);
  if (!workspaceId || !mode || !ALLOWED_MODES.has(mode) || !outcome || !ALLOWED_OUTCOMES.has(outcome)) return { ok: false, error: "workspaceId、mode 或 outcome 無效" };
  if (!playerTeam.length || !opponentTeam.length) return { ok: false, error: "雙方隊伍不可為空" };
  if (mode === "5v5" && (playerTeam.length !== 5 || opponentTeam.length !== 5)) return { ok: false, error: "5v5 必須包含雙方各 5 名成員" };
  const battleAt = Number(data?.battleAt);
  const normalized = { workspaceId, battleAt: Number.isFinite(battleAt) ? Math.trunc(battleAt) : Date.now(), mode, outcome, playerTeam, opponentTeam };
  for (const key of ["playerName", "playerUnion", "opponentName", "opponentUnion", "sourceBattleChannel", "sourceBattleId"]) {
    const value = safeText(data?.[key], ["playerName", "playerUnion", "opponentName", "opponentUnion"].includes(key) ? 120 : 500); if (value) normalized[key] = value;
  }
  for (const key of ["rankBefore", "rankAfter", "scoreBefore", "scoreAfter"]) { const value = Number(data?.[key]); if (Number.isInteger(value) && value >= 0) normalized[key] = value; }
  const sourceKey = normalized.sourceBattleChannel || normalized.sourceBattleId || `${normalized.battleAt}:${normalized.mode}`;
  return { ok: true, data: normalized, sourceKey: sourceKey.slice(0, 500) };
}
function json(data, status = 200, headers = {}) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } }); }
function cors(request, env) {
  const origin = request.headers.get("Origin") || ""; const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin = origin && allowed.includes(origin) ? origin : "null";
  return { "access-control-allow-origin": allowOrigin, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "Content-Type, Accept, X-RF-Write-Secret", "access-control-allow-credentials": "true", vary: "Origin" };
}
function secretValue(env, name) { return String(env[name] || "").trim(); }
function writeAuthorized(request, env) { const expected = secretValue(env, "PVP_WRITE_SECRET"); const supplied = request.headers.get("X-RF-Write-Secret") || ""; return Boolean(expected) && supplied === expected; }
function cookieValue(request, name) { const header = request.headers.get("Cookie") || ""; const match = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`)); return match ? decodeURIComponent(match.slice(name.length + 1)) : ""; }
function bytesToBase64Url(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function base64UrlToBytes(value) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4); const binary = atob(normalized); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
async function hmac(value, secret) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))); }
async function sameSecret(value, expected, secret) { if (!value || !expected || !secret) return false; const actual = await hmac(value, secret); const target = await hmac(expected, secret); if (actual.length !== target.length) return false; let difference = 0; for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ target[index]; return difference === 0; }
async function createSession(env) { const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }))); const signature = bytesToBase64Url(await hmac(payload, secretValue(env, "PVP_SESSION_SECRET"))); return `${payload}.${signature}`; }
async function hasSiteSession(request, env) {
  const token = cookieValue(request, SESSION_COOKIE); const [payload, signature] = token.split("."); const sessionSecret = secretValue(env, "PVP_SESSION_SECRET"); if (!payload || !signature || !sessionSecret) return false;
  const expected = bytesToBase64Url(await hmac(payload, sessionSecret)); if (!(await sameSecret(signature, expected, sessionSecret))) return false;
  try { return Number(JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))).exp) > Math.floor(Date.now() / 1000); } catch { return false; }
}
// GitHub Pages 與 workers.dev 是跨 site；Partitioned 讓 Chromium 在第三方 Cookie
// 限制下仍能把這顆 host-only session cookie 限定給目前的 Pages top-level site。
function sessionCookie(token) { return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=None; Partitioned`; }
function clearSessionCookie() { return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`; }
async function readBody(request) { const text = await request.text(); if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("request body too large"); try { return text ? JSON.parse(text) : {}; } catch { throw new Error("invalid JSON"); } }
async function health(env) { await env.DB.prepare("SELECT 1 AS ok").first(); return { ok: true, durable: true }; }

export default {
  async fetch(request, env) {
    const headers = cors(request, env); if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url); if (!url.pathname.startsWith("/api/pvp/")) return json({ error: "not found" }, 404, headers);
    try {
      if (request.method === "POST" && url.pathname === "/api/pvp/login") {
        const body = asObject(await readBody(request)); const password = typeof body?.password === "string" ? body.password : "";
        const sitePassword = secretValue(env, "PVP_SITE_PASSWORD"); const sessionSecret = secretValue(env, "PVP_SESSION_SECRET");
        if (!sitePassword || !sessionSecret) return json({ error: "authentication configuration unavailable" }, 503, headers);
        const valid = await sameSecret(password, sitePassword, sessionSecret);
        if (!valid) return json({ error: "unauthorized" }, 401, headers);
        const token = await createSession(env); return json({ authenticated: true }, 200, { ...headers, "set-cookie": sessionCookie(token) });
      }
      if (request.method === "POST" && url.pathname === "/api/pvp/logout") return json({ authenticated: false }, 200, { ...headers, "set-cookie": clearSessionCookie() });
      if (request.method === "GET" && url.pathname === "/api/pvp/session") return (await hasSiteSession(request, env)) ? json({ authenticated: true }, 200, headers) : json({ error: "unauthorized" }, 401, headers);
      if (request.method === "GET" && url.pathname === "/api/pvp/health") {
        const siteAuthorized = await hasSiteSession(request, env);
        if (!siteAuthorized && !writeAuthorized(request, env)) return json({ error: "unauthorized" }, 401, headers);
        return json(await health(env), 200, headers);
      }
      if (request.method === "POST" && url.pathname === "/api/pvp/capture") {
        if (!writeAuthorized(request, env)) return json({ error: "unauthorized" }, 401, headers);
        const normalized = normalizeCapture(await readBody(request)); if (!normalized.ok) return json(normalized, 400, headers);
        const { data, sourceKey } = normalized; const existing = await env.DB.prepare("SELECT id FROM pvp_events WHERE workspace_id = ? AND source_key = ?").bind(data.workspaceId, sourceKey).first();
        if (existing) {
          const existingRow = await env.DB.prepare("SELECT payload_json FROM pvp_events WHERE id = ?").bind(existing.id).first(); let merged = data;
          try { const previous = JSON.parse(existingRow?.payload_json || "{}"); merged = { ...previous, ...data }; for (const key of ["playerName", "playerUnion", "opponentName", "opponentUnion"]) if (!data[key] && previous[key]) merged[key] = previous[key]; } catch {}
          let previousPayload = {}; try { previousPayload = JSON.parse(existingRow?.payload_json || "{}"); } catch {}
          const changedIdentity = ["playerName", "playerUnion", "opponentName", "opponentUnion"].some((key) => data[key] && data[key] !== (previousPayload[key] || ""));
          if (changedIdentity) await env.DB.prepare("UPDATE pvp_events SET payload_json = ?, captured_at = ? WHERE id = ?").bind(JSON.stringify(merged), Date.now(), existing.id).run();
          return json({ accepted: true, duplicate: !changedIdentity, updated: changedIdentity, eventId: Number(existing.id) }, 200, headers);
        }
        const result = await env.DB.prepare("INSERT INTO pvp_events (workspace_id, source_key, payload_json, captured_at) VALUES (?, ?, ?, ?)").bind(data.workspaceId, sourceKey, JSON.stringify(data), Date.now()).run();
        return json({ accepted: true, duplicate: false, eventId: Number(result.meta.last_row_id) }, 202, headers);
      }
      if (request.method === "GET" && url.pathname === "/api/pvp/events") {
        if (!(await hasSiteSession(request, env))) return json({ error: "unauthorized" }, 401, headers);
        const after = Math.max(0, Number.parseInt(url.searchParams.get("after") || "0", 10) || 0); const workspaceId = safeText(url.searchParams.get("workspaceId"), 80);
        if (!workspaceId) return json({ error: "workspaceId is required" }, 400, headers);
        const rows = await env.DB.prepare("SELECT id, captured_at, payload_json FROM pvp_events WHERE workspace_id = ? AND id > ? ORDER BY id ASC LIMIT 160").bind(workspaceId, after).all();
        const events = (rows.results || []).map((row) => ({ id: Number(row.id), capturedAt: Number(row.captured_at), type: "match", data: JSON.parse(row.payload_json) }));
        const latest = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM pvp_events WHERE workspace_id = ?").bind(workspaceId).first();
        return json({ events, latestEventId: Number(latest?.id || 0), durable: true }, 200, headers);
      }
      return json({ error: "not found" }, 404, headers);
    } catch (error) { console.error("PVP worker request failed", error); return json({ error: "server error" }, 500, headers); }
  },
};
