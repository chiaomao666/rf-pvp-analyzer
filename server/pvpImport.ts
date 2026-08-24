import type { TeamMember } from "../drizzle/schema";

export type ImportedMatch = {
  battleAt: number;
  mode: "1v1" | "3v3";
  outcome: "win" | "loss" | "draw" | "unknown";
  playerTeam: TeamMember[];
  opponentTeam: TeamMember[];
  opponentName?: string;
  rankBefore?: number;
  rankAfter?: number;
  rawPayload: unknown;
  unrecognizedFields?: Record<string, unknown>;
};

export type ParsedPvpImport = {
  rawPayload: unknown;
  records: ImportedMatch[];
  rejectedCount: number;
  warnings: string[];
};

const knownKeys = new Set([
  "battleAt", "battle_at", "timestamp", "date", "playedAt", "played_at", "mode", "battleMode", "battle_mode",
  "type", "outcome", "result", "winner", "status", "playerTeam", "player_team", "myTeam", "my_team", "team",
  "opponentTeam", "opponent_team", "enemyTeam", "enemy_team", "opponent", "opponentName", "opponent_name",
  "rankBefore", "rank_before", "preRank", "pre_rank", "rankAfter", "rank_after", "postRank", "post_rank",
]);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstValue(record: Record<string, unknown>, names: string[]) {
  return names.map(name => record[name]).find(value => value !== undefined && value !== null);
}

function normaliseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.trunc(value) : Math.trunc(value * 1000);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normaliseRank(value: unknown): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function normaliseMode(value: unknown, playerCount: number): "1v1" | "3v3" | null {
  const text = String(value ?? "").toLowerCase().replaceAll(" ", "");
  if (text.includes("1v1") || text === "1") return "1v1";
  if (text.includes("3v3") || text === "3") return "3v3";
  if (playerCount === 1 || playerCount === 3) return playerCount === 1 ? "1v1" : "3v3";
  return null;
}

function normaliseOutcome(value: unknown): ImportedMatch["outcome"] {
  const text = String(value ?? "").toLowerCase();
  if (["win", "won", "victory", "勝", "勝利", "true"].includes(text)) return "win";
  if (["loss", "lose", "lost", "defeat", "敗", "失敗", "false"].includes(text)) return "loss";
  if (["draw", "tie", "平手"].includes(text)) return "draw";
  return "unknown";
}

function normaliseTeam(value: unknown): TeamMember[] {
  const entries = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return entries.flatMap(entry => {
    if (typeof entry === "string" && entry.trim()) return [{ name: entry.trim() }];
    const member = objectValue(entry);
    if (!member) return [];
    const nestedCharacter = objectValue(member.character);
    const name = firstValue(member, ["name", "characterName", "character_name", "displayName"]) ?? nestedCharacter?.name;
    if (typeof name !== "string" || !name.trim()) return [];
    const level = normaliseRank(firstValue(member, ["level", "lv"]));
    const powerValue = firstValue(member, ["power", "combatPower", "combat_power"]);
    const power = typeof powerValue === "number" && Number.isFinite(powerValue) ? Math.trunc(powerValue) : undefined;
    const role = firstValue(member, ["role", "class", "abbr"]);
    const rarity = firstValue(member, ["rarity", "grade"]);
    return [{
      name: name.trim(),
      ...(level ? { level } : {}),
      ...(power !== undefined ? { power } : {}),
      ...(typeof role === "string" ? { role } : {}),
      ...(typeof rarity === "string" ? { rarity } : {}),
      raw: objectValue(member.raw) ?? member,
    }];
  });
}

function inputRecords(root: unknown): unknown[] {
  if (Array.isArray(root)) return root;
  const object = objectValue(root);
  if (!object) return [];
  for (const key of ["matches", "records", "data", "logs"]) {
    if (Array.isArray(object[key])) return object[key] as unknown[];
  }
  return [root];
}

export function parsePvpImportPayload(dataText: string): ParsedPvpImport {
  let root: unknown;
  try {
    root = JSON.parse(dataText);
  } catch {
    throw new Error("JSON 格式無法解析；請確認匯出內容完整且未被截斷。");
  }

  const records: ImportedMatch[] = [];
  const warnings: string[] = [];
  let rejectedCount = 0;

  for (const candidate of inputRecords(root).slice(0, 100)) {
    const record = objectValue(candidate);
    if (!record) {
      rejectedCount += 1;
      continue;
    }
    const playerTeam = normaliseTeam(firstValue(record, ["playerTeam", "player_team", "myTeam", "my_team", "team"]));
    const opponentTeam = normaliseTeam(firstValue(record, ["opponentTeam", "opponent_team", "enemyTeam", "enemy_team", "opponent"]));
    const battleAt = normaliseTimestamp(firstValue(record, ["battleAt", "battle_at", "timestamp", "date", "playedAt", "played_at"]));
    const mode = normaliseMode(firstValue(record, ["mode", "battleMode", "battle_mode", "type"]), playerTeam.length);

    if (!battleAt || !mode || playerTeam.length < 1 || opponentTeam.length < 1 || playerTeam.length > 20 || opponentTeam.length > 20) {
      rejectedCount += 1;
      if (warnings.length < 8) warnings.push("有一筆資料缺少可辨識的時間、模式或非空雙方隊伍，或單方角色數超過安全上限，已保留在匯入原始檔中但未建立戰績。");
      continue;
    }

    const unrecognizedFields = Object.fromEntries(Object.entries(record).filter(([key]) => !knownKeys.has(key)));
    records.push({
      battleAt,
      mode,
      outcome: normaliseOutcome(firstValue(record, ["outcome", "result", "winner", "status"])),
      playerTeam,
      opponentTeam,
      opponentName: typeof firstValue(record, ["opponentName", "opponent_name"]) === "string"
        ? String(firstValue(record, ["opponentName", "opponent_name"]))
        : undefined,
      rankBefore: normaliseRank(firstValue(record, ["rankBefore", "rank_before", "preRank", "pre_rank"])),
      rankAfter: normaliseRank(firstValue(record, ["rankAfter", "rank_after", "postRank", "post_rank"])),
      rawPayload: record,
      ...(Object.keys(unrecognizedFields).length ? { unrecognizedFields } : {}),
    });
  }

  if (inputRecords(root).length > 100) warnings.push("單次僅處理前 100 筆資料；完整原始 JSON 仍會保存於匯入批次。\n");
  if (records.length === 0) warnings.push("未偵測到可建立的對戰紀錄。這類資料仍會保留於匯入批次，供後續檢視與擴充辨識規則。");
  return { rawPayload: root, records, rejectedCount, warnings };
}
