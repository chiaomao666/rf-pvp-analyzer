import type { TeamMember } from "@/components/PvpUi";

export type PvpOutcome = "win" | "loss" | "draw" | "unknown";
export type PvpMode = "1v1" | "3v3";

export type LocalPvpMatch = {
  id: number;
  battleAt: number;
  mode: PvpMode;
  outcome: PvpOutcome;
  playerTeam: TeamMember[];
  opponentTeam: TeamMember[];
  opponentName?: string;
  rankBefore?: number;
  rankAfter?: number;
  notes?: string;
  sourceBattleChannel?: string;
  sourceBattleId?: string;
  rawPayload?: unknown;
  unrecognizedFields?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type LocalImportBatch = {
  id: number;
  receivedAt: number;
  label: string;
  recognizedCount: number;
  rejectedCount: number;
  warnings: string[];
};

export type MatchInput = Omit<LocalPvpMatch, "id" | "createdAt" | "updatedAt">;
export type MatchFilters = Partial<Pick<LocalPvpMatch, "mode" | "outcome">> & { startAt?: number; endAt?: number };
export type ImportSummary = { importedCount: number; createdCount: number; updatedCount: number; rejectedCount: number; warnings: string[] };
export type LocalBackup = { format: "rf-pvp-analyzer/local-backup-v1"; exportedAt: string; recordCount: number; records: Omit<LocalPvpMatch, "id">[]; imports: Omit<LocalImportBatch, "id">[] };

const DB_NAME = "rf-pvp-analyzer-local";
const DB_VERSION = 1;
const MATCHES = "matches";
const IMPORTS = "imports";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MATCHES)) db.createObjectStore(MATCHES, { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains(IMPORTS)) db.createObjectStore(IMPORTS, { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("無法開啟瀏覽器本機資料庫。"));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本機資料庫操作失敗。"));
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try { return await requestValue(action(db.transaction(storeName, mode).objectStore(storeName))); }
  finally { db.close(); }
}

function notifyStoreChange() { window.dispatchEvent(new Event("rf-pvp-store-change")); }
function asObject(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function first(record: Record<string, unknown>, keys: string[]) { return keys.map(key => record[key]).find(value => value !== undefined && value !== null); }
function timestamp(value: unknown) { if (typeof value === "number" && Number.isFinite(value)) return value > 10_000_000_000 ? Math.trunc(value) : Math.trunc(value * 1000); if (typeof value === "string") { const parsed = Date.parse(value); return Number.isNaN(parsed) ? null : parsed; } return null; }
function positiveInteger(value: unknown) { const numeric = typeof value === "number" ? value : Number(value); return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined; }
function sourceId(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : undefined; }
function outcome(value: unknown): PvpOutcome { const text = String(value ?? "").toLowerCase(); if (["win", "won", "victory", "勝", "勝利", "true"].includes(text)) return "win"; if (["loss", "lose", "lost", "defeat", "敗", "失敗", "false"].includes(text)) return "loss"; return ["draw", "tie", "平手"].includes(text) ? "draw" : "unknown"; }
function team(value: unknown): TeamMember[] {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  return entries.flatMap(entry => {
    if (typeof entry === "string" && entry.trim()) return [{ name: entry.trim() }];
    const member = asObject(entry); if (!member) return [];
    const character = asObject(member.character);
    const name = first(member, ["name", "characterName", "character_name", "displayName"]) ?? character?.name;
    if (typeof name !== "string" || !name.trim()) return [];
    const power = first(member, ["power", "combatPower", "combat_power"]);
    const rawPower = typeof power === "number" && Number.isFinite(power) ? Math.trunc(power) : undefined;
    return [{ name: name.trim(), ...(positiveInteger(first(member, ["level", "lv"])) ? { level: positiveInteger(first(member, ["level", "lv"])) } : {}), ...(rawPower !== undefined ? { power: rawPower } : {}), ...(typeof first(member, ["role", "class", "abbr"]) === "string" ? { role: String(first(member, ["role", "class", "abbr"])) } : {}), ...(typeof first(member, ["rarity", "grade"]) === "string" ? { rarity: String(first(member, ["rarity", "grade"])) } : {}) }];
  });
}

function candidates(root: unknown): unknown[] { if (Array.isArray(root)) return root; const object = asObject(root); if (!object) return []; for (const key of ["matches", "records", "data", "logs"]) if (Array.isArray(object[key])) return object[key] as unknown[]; return [root]; }

export function parsePvpJson(dataText: string): { records: MatchInput[]; rejectedCount: number; warnings: string[] } {
  let root: unknown;
  try { root = JSON.parse(dataText); } catch { throw new Error("JSON 格式無法解析；請確認匯出內容完整且未被截斷。 "); }
  const records: MatchInput[] = []; const warnings: string[] = [];
  let rejectedCount = 0;
  for (const candidate of candidates(root)) {
    const record = asObject(candidate); if (!record) { rejectedCount += 1; continue; }
    const playerTeam = team(first(record, ["playerTeam", "player_team", "myTeam", "my_team", "team"]));
    const opponentTeam = team(first(record, ["opponentTeam", "opponent_team", "enemyTeam", "enemy_team", "opponent"]));
    const battleAt = timestamp(first(record, ["battleAt", "battle_at", "timestamp", "date", "playedAt", "played_at"]));
    const rawMode = String(first(record, ["mode", "battleMode", "battle_mode", "type"]) ?? "").toLowerCase().replaceAll(" ", "");
    const mode: PvpMode | null = rawMode.includes("1v1") || rawMode === "1" || playerTeam.length === 1 ? "1v1" : rawMode.includes("3v3") || rawMode === "3" || playerTeam.length === 3 ? "3v3" : null;
    if (!battleAt || !mode || !playerTeam.length || !opponentTeam.length || playerTeam.length > 20 || opponentTeam.length > 20) { rejectedCount += 1; continue; }
    records.push({ battleAt, mode, outcome: outcome(first(record, ["outcome", "result", "winner", "status"])), playerTeam, opponentTeam, ...(typeof first(record, ["opponentName", "opponent_name"]) === "string" ? { opponentName: String(first(record, ["opponentName", "opponent_name"])) } : {}), ...(positiveInteger(first(record, ["rankBefore", "rank_before", "preRank", "pre_rank"])) ? { rankBefore: positiveInteger(first(record, ["rankBefore", "rank_before", "preRank", "pre_rank"])) } : {}), ...(positiveInteger(first(record, ["rankAfter", "rank_after", "postRank", "post_rank"])) ? { rankAfter: positiveInteger(first(record, ["rankAfter", "rank_after", "postRank", "post_rank"])) } : {}), ...(sourceId(first(record, ["sourceBattleChannel", "source_battle_channel"])) ? { sourceBattleChannel: sourceId(first(record, ["sourceBattleChannel", "source_battle_channel"])) } : {}), ...(sourceId(first(record, ["sourceBattleId", "source_battle_id"])) ? { sourceBattleId: sourceId(first(record, ["sourceBattleId", "source_battle_id"])) } : {}), rawPayload: record });
  }
  if (rejectedCount) warnings.push(`${rejectedCount} 筆資料缺少可辨識的時間、模式或非空雙方隊伍，未建立戰績。`);
  return { records, rejectedCount, warnings };
}

export async function listMatches(filters: MatchFilters = {}) { const entries = await withStore<LocalPvpMatch[]>(MATCHES, "readonly", store => store.getAll()); return entries.filter(match => (!filters.mode || match.mode === filters.mode) && (!filters.outcome || match.outcome === filters.outcome) && (!filters.startAt || match.battleAt >= filters.startAt) && (!filters.endAt || match.battleAt <= filters.endAt)).sort((a, b) => b.battleAt - a.battleAt); }
export async function getMatch(id: number) { return withStore<LocalPvpMatch | undefined>(MATCHES, "readonly", store => store.get(id)); }
export async function saveMatch(input: MatchInput) { const now = Date.now(); const id = await withStore<IDBValidKey>(MATCHES, "readwrite", store => store.add({ ...input, createdAt: now, updatedAt: now })); notifyStoreChange(); return Number(id); }
export async function deleteMatch(id: number) { await withStore(MATCHES, "readwrite", store => store.delete(id)); notifyStoreChange(); }
export async function listImports() { const entries = await withStore<LocalImportBatch[]>(IMPORTS, "readonly", store => store.getAll()); return entries.sort((a, b) => b.receivedAt - a.receivedAt); }

function sameSource(a: LocalPvpMatch, b: MatchInput) { return Boolean(a.sourceBattleChannel && a.sourceBattleId && a.sourceBattleChannel === b.sourceBattleChannel && a.sourceBattleId === b.sourceBattleId); }
export async function importPvpJson(label: string, dataText: string): Promise<ImportSummary> {
  const parsed = parsePvpJson(dataText); const existing = await listMatches(); let createdCount = 0; let updatedCount = 0;
  for (const record of parsed.records) {
    const found = existing.find(match => sameSource(match, record));
    if (found) { await withStore(MATCHES, "readwrite", store => store.put({ ...found, ...record, id: found.id, createdAt: found.createdAt, updatedAt: Date.now() })); updatedCount += 1; }
    else { await saveMatch(record); createdCount += 1; }
  }
  await withStore(IMPORTS, "readwrite", store => store.add({ receivedAt: Date.now(), label: label.trim() || "未命名 JSON 匯入", recognizedCount: parsed.records.length, rejectedCount: parsed.rejectedCount, warnings: parsed.warnings }));
  notifyStoreChange(); return { importedCount: parsed.records.length, createdCount, updatedCount, rejectedCount: parsed.rejectedCount, warnings: parsed.warnings };
}

function portable(record: LocalPvpMatch): Omit<LocalPvpMatch, "id"> { const { id: _id, ...rest } = record; return rest; }
export async function exportLocalBackup(): Promise<LocalBackup> { const records = (await listMatches()).map(portable); const imports = (await listImports()).map(({ id: _id, ...batch }) => batch); return { format: "rf-pvp-analyzer/local-backup-v1", exportedAt: new Date().toISOString(), recordCount: records.length, records, imports }; }
export async function restoreLocalBackup(dataText: string, replace = false): Promise<{ restored: number; skipped: number }> {
  let backup: unknown; try { backup = JSON.parse(dataText); } catch { throw new Error("備份 JSON 無法解析。 "); }
  const object = asObject(backup); if (!object || object.format !== "rf-pvp-analyzer/local-backup-v1" || !Array.isArray(object.records)) throw new Error("這不是可還原的 RF PVP 本機備份檔。 ");
  if (replace) { const db = await openDatabase(); const transaction = db.transaction([MATCHES, IMPORTS], "readwrite"); transaction.objectStore(MATCHES).clear(); transaction.objectStore(IMPORTS).clear(); await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); db.close(); }
  let restored = 0; let skipped = 0; const existing = await listMatches();
  for (const entry of object.records) { const record = asObject(entry); if (!record || typeof record.battleAt !== "number" || (record.mode !== "1v1" && record.mode !== "3v3") || !Array.isArray(record.playerTeam) || !Array.isArray(record.opponentTeam)) { skipped += 1; continue; } const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = record; if (existing.some(match => sameSource(match, input as MatchInput))) { skipped += 1; continue; } await saveMatch(input as MatchInput); restored += 1; }
  if (Array.isArray(object.imports)) for (const batch of object.imports) { const value = asObject(batch); if (value && typeof value.label === "string") await withStore(IMPORTS, "readwrite", store => store.add({ receivedAt: typeof value.receivedAt === "number" ? value.receivedAt : Date.now(), label: value.label, recognizedCount: typeof value.recognizedCount === "number" ? value.recognizedCount : 0, rejectedCount: typeof value.rejectedCount === "number" ? value.rejectedCount : 0, warnings: Array.isArray(value.warnings) ? value.warnings.filter(item => typeof item === "string") : [] })); }
  notifyStoreChange(); return { restored, skipped };
}
export async function clearLocalData() { const db = await openDatabase(); const transaction = db.transaction([MATCHES, IMPORTS], "readwrite"); transaction.objectStore(MATCHES).clear(); transaction.objectStore(IMPORTS).clear(); await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); db.close(); notifyStoreChange(); }
export async function dashboard() { const records = await listMatches(); const wins = records.filter(item => item.outcome === "win").length; const losses = records.filter(item => item.outcome === "loss").length; const decided = wins + losses; const ordered = [...records].sort((a, b) => a.battleAt - b.battleAt); const ranked = ordered.filter(item => item.rankAfter); return { total: records.length, wins, losses, winRate: decided ? Math.round((wins / decided) * 1000) / 10 : null, currentRank: ranked.at(-1)?.rankAfter ?? null, rankSeries: ranked.map(item => ({ battleAt: item.battleAt, rank: item.rankAfter! })), recent: records.slice(0, 6) }; }
