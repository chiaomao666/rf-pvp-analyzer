#!/usr/bin/env node
/**
 * RF PVP Analyzer Localhost Bridge
 *
 * The bridge is intentionally loopback-only and memory-only. It accepts
 * caller-provided match summaries from an approved local mod and never
 * accepts credentials, user tokens, cookies, or arbitrary game payloads.
 */
import http from "node:http";

const HOST = "127.0.0.1";
const PORT = Number(process.env.RF_BRIDGE_PORT || 8787);
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_EVENTS = 200;
let nextId = 1;
const events = [];

const allowedKeys = new Set([
  "battleAt", "mode", "outcome", "playerTeam", "opponentTeam", "opponentName",
  "rankBefore", "rankAfter", "scoreBefore", "scoreAfter", "notes",
  "sourceBattleChannel", "sourceBattleId",
]);
const modes = new Set(["1v1", "3v3", "5v5"]);
const outcomes = new Set(["win", "loss", "draw", "unknown"]);

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function finiteNumber(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function cleanTeam(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [{ name: entry.trim() }];
    const member = asObject(entry);
    if (!member || typeof member.name !== "string" || !member.name.trim()) return [];
    const output = { name: member.name.trim() };
    for (const key of ["level", "power"]) {
      const number = finiteNumber(member[key]);
      if (number !== undefined && number >= 0) output[key] = Math.trunc(number);
    }
    for (const key of ["role", "rarity"]) {
      if (typeof member[key] === "string" && member[key].trim()) output[key] = member[key].trim().slice(0, 80);
    }
    return [output];
  });
}

function sanitizeMatch(input) {
  const source = asObject(input);
  if (!source) throw new Error("data 必須是 JSON 物件。");
  const output = {};
  for (const key of allowedKeys) if (key in source) output[key] = source[key];
  const battleAt = finiteNumber(source.battleAt);
  if (battleAt === undefined) throw new Error("data.battleAt 必須是時間戳記。");
  if (!modes.has(source.mode)) throw new Error("data.mode 必須是 1v1、3v3 或 5v5。");
  if (!outcomes.has(source.outcome)) throw new Error("data.outcome 必須是 win、loss、draw 或 unknown。");
  output.battleAt = Math.trunc(battleAt);
  output.playerTeam = cleanTeam(source.playerTeam);
  output.opponentTeam = cleanTeam(source.opponentTeam);
  if (!output.playerTeam.length || !output.opponentTeam.length) throw new Error("data 必須包含非空的雙方隊伍。");
  for (const key of ["rankBefore", "rankAfter", "scoreBefore", "scoreAfter"]) {
    const number = finiteNumber(source[key]);
    if (number !== undefined && number >= 0) output[key] = Math.trunc(number);
  }
  for (const key of ["opponentName", "notes", "sourceBattleChannel", "sourceBattleId"]) {
    if (typeof source[key] === "string" && source[key].trim()) output[key] = source[key].trim().slice(0, 500);
  }
  return output;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body 太大；bridge 只接受小型戰績摘要。"));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("request body 不是有效 JSON。")); }
    });
    req.on("error", reject);
  });
}

function capture(req, res) {
  readJson(req).then((payload) => {
    if (payload.type !== "match") throw new Error("只接受 type=match 的戰績摘要事件。");
    const data = sanitizeMatch(payload.data);
    const event = { id: nextId++, capturedAt: Date.now(), type: "match", data };
    events.push(event);
    while (events.length > MAX_EVENTS) events.shift();
    json(res, 202, { accepted: true, eventId: event.id, queueSize: events.length });
  }).catch((error) => json(res, 400, { accepted: false, error: error.message }));
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "rf-pvp-analyzer-bridge", host: HOST, port: PORT, queueSize: events.length, latestEventId: events.at(-1)?.id ?? 0 });
  }
  if (req.method === "GET" && url.pathname === "/v1/events") {
    const after = Math.max(0, Number(url.searchParams.get("after") || 0));
    return json(res, 200, { events: events.filter((event) => event.id > after), latestEventId: events.at(-1)?.id ?? after, queueSize: events.length });
  }
  if (req.method === "POST" && url.pathname === "/v1/capture") return capture(req, res);
  return json(res, 404, { error: "not_found" });
});

server.on("error", (error) => {
  console.error(`[RF BRIDGE] ${error.message}`);
  process.exitCode = 1;
});
server.listen(PORT, HOST, () => {
  console.log(`[RF BRIDGE] listening on http://${HOST}:${PORT}`);
  console.log("[RF BRIDGE] memory-only; accepts sanitized match summaries only");
});

function shutdown() { server.close(() => process.exit(0)); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
