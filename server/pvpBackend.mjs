const MAX_BODY_BYTES = 512_000;
const MAX_EVENTS = 512;
const ALLOWED_MODES = new Set(["1v1", "3v3", "5v5"]);
const ALLOWED_OUTCOMES = new Set(["win", "loss", "draw", "unknown"]);

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function safeText(value, max = 200) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function safeTeam(value) {
  return (Array.isArray(value) ? value : []).slice(0, 5).map((member) => {
    const input = asObject(member);
    const name = safeText(input?.name, 120);
    if (!name) return null;
    const output = { name };
    for (const key of ["level", "power"]) {
      const number = Number(input?.[key]);
      if (Number.isFinite(number) && number >= 0) output[key] = Math.trunc(number);
    }
    for (const key of ["role", "rarity"]) {
      const text = safeText(input?.[key], 80);
      if (text) output[key] = text;
    }
    return output;
  }).filter(Boolean);
}

export function normalizePvpCapture(input) {
  const body = asObject(input);
  const data = asObject(body?.data) || body;
  const workspaceId = safeText(body?.workspaceId || data?.workspaceId, 80);
  const mode = safeText(data?.mode, 10);
  const outcome = safeText(data?.outcome, 10);
  const playerTeam = safeTeam(data?.playerTeam);
  const opponentTeam = safeTeam(data?.opponentTeam);
  const sourceBattleChannel = safeText(data?.sourceBattleChannel, 500);
  const sourceBattleId = safeText(data?.sourceBattleId, 500);
  if (!workspaceId || !mode || !ALLOWED_MODES.has(mode) || !outcome || !ALLOWED_OUTCOMES.has(outcome)) {
    return { ok: false, error: "workspaceId、mode 或 outcome 無效" };
  }
  if (!playerTeam.length || !opponentTeam.length) return { ok: false, error: "雙方隊伍不可為空" };
  if (mode === "5v5" && (playerTeam.length !== 5 || opponentTeam.length !== 5)) {
    return { ok: false, error: "5v5 必須包含雙方各 5 名成員" };
  }
  const battleAt = Number(data?.battleAt);
  const output = { workspaceId, battleAt: Number.isFinite(battleAt) ? Math.trunc(battleAt) : Date.now(), mode, outcome, playerTeam, opponentTeam };
  for (const key of ["opponentName", "sourceBattleChannel", "sourceBattleId"]) {
    const value = safeText(data?.[key], key === "opponentName" ? 120 : 500);
    if (value) output[key] = value;
  }
  for (const key of ["rankBefore", "rankAfter", "scoreBefore", "scoreAfter"]) {
    const value = Number(data?.[key]);
    if (Number.isInteger(value) && value >= 0) output[key] = value;
  }
  return { ok: true, data: output };
}

export function createPvpBackend() {
  const events = [];
  const seen = new Set();
  let nextId = 1;

  function capture(body) {
    const normalized = normalizePvpCapture(body);
    if (!normalized.ok) return { status: 400, body: normalized };
    const data = normalized.data;
    const dedupeKey = `${data.workspaceId}:${data.sourceBattleChannel || data.sourceBattleId || `${data.battleAt}:${data.mode}`}`;
    if (seen.has(dedupeKey)) return { status: 200, body: { accepted: true, duplicate: true, latestEventId: events.at(-1)?.id || 0 } };
    const event = { id: nextId++, capturedAt: Date.now(), type: "match", data };
    seen.add(dedupeKey);
    events.push(event);
    while (events.length > MAX_EVENTS) events.shift();
    return { status: 202, body: { accepted: true, duplicate: false, eventId: event.id } };
  }

  function list(after = 0, workspaceId) {
    const cursor = Number.isSafeInteger(Number(after)) ? Number(after) : 0;
    const eventsForWorkspace = events.filter((event) => event.id > cursor && (!workspaceId || event.data.workspaceId === workspaceId));
    return { events: eventsForWorkspace, latestEventId: events.at(-1)?.id || 0, queueSize: events.length };
  }

  return { capture, list, health: () => ({ ok: true, queueSize: events.length, latestEventId: events.at(-1)?.id || 0 }) };
}

export function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-RF-Workspace-Id");
  res.setHeader("Cache-Control", "no-store");
}

export async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}
