import type { ImportedMatch } from "./pvpImport";

type ExistingMatch = {
  id: number;
  userId: number;
  outcome: ImportedMatch["outcome"];
  rankBefore: number | null;
  rankAfter: number | null;
  rawPayload: unknown;
};

export type PlannedPvpBackfill = {
  existingId: number;
  outcome: ImportedMatch["outcome"];
  rankBefore?: number;
  rankAfter?: number;
  rawPayload: unknown;
  unrecognizedFields?: Record<string, unknown>;
};

export type PvpImportReconciliationPlan = {
  inserts: ImportedMatch[];
  updates: PlannedPvpBackfill[];
};

function sourceBattleKey(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const channel = typeof source.sourceBattleChannel === "string" ? source.sourceBattleChannel.trim() : "";
  if (channel) return `channel:${channel}`;
  const id = source.sourceBattleId;
  if (typeof id === "string" && id.trim()) return `id:${id.trim()}`;
  if (typeof id === "number" && Number.isFinite(id)) return `id:${Math.trunc(id)}`;
  return undefined;
}

function importedSourceBattleKey(record: ImportedMatch): string | undefined {
  if (record.sourceBattleChannel?.trim()) return `channel:${record.sourceBattleChannel.trim()}`;
  if (record.sourceBattleId?.trim()) return `id:${record.sourceBattleId.trim()}`;
  return undefined;
}

function hasAuthoritativeResult(record: ImportedMatch): boolean {
  return record.outcome !== "unknown" || record.rankBefore !== undefined || record.rankAfter !== undefined;
}

function mergeIntoPendingImport(existing: ImportedMatch, incoming: ImportedMatch): ImportedMatch {
  if (!hasAuthoritativeResult(incoming)) return existing;
  return {
    ...existing,
    outcome: existing.outcome === "unknown" && incoming.outcome !== "unknown" ? incoming.outcome : existing.outcome,
    rankBefore: incoming.rankBefore ?? existing.rankBefore,
    rankAfter: incoming.rankAfter ?? existing.rankAfter,
    rawPayload: incoming.rawPayload,
    unrecognizedFields: incoming.unrecognizedFields,
  };
}

/**
 * 將單一登入使用者的既有戰績與本次已正規化的匯入資料進行同場來源鍵比對。
 * 僅當新資料含官方結果或排名時才回填既有資料，沒有可驗證來源鍵的紀錄仍會視為新匯入。
 */
export function buildPvpImportReconciliationPlan(
  userId: number,
  existingMatches: ExistingMatch[],
  records: ImportedMatch[],
): PvpImportReconciliationPlan {
  const existingBySource = new Map(
    existingMatches
      .filter(match => match.userId === userId)
      .map(match => [sourceBattleKey(match.rawPayload), match] as const)
      .filter((entry): entry is [string, ExistingMatch] => Boolean(entry[0])),
  );
  const pendingBySource = new Map<string, number>();
  const inserts: ImportedMatch[] = [];
  const updates: PlannedPvpBackfill[] = [];

  for (const record of records) {
    const sourceKey = importedSourceBattleKey(record);
    const existing = sourceKey ? existingBySource.get(sourceKey) : undefined;

    if (existing) {
      if (hasAuthoritativeResult(record)) {
        const outcome = existing.outcome === "unknown" && record.outcome !== "unknown" ? record.outcome : existing.outcome;
        const rankBefore = record.rankBefore ?? existing.rankBefore ?? undefined;
        const rankAfter = record.rankAfter ?? existing.rankAfter ?? undefined;
        const changed = outcome !== existing.outcome
          || rankBefore !== (existing.rankBefore ?? undefined)
          || rankAfter !== (existing.rankAfter ?? undefined);
        if (changed) {
          updates.push({
            existingId: existing.id,
            outcome,
            rankBefore,
            rankAfter,
            rawPayload: record.rawPayload,
            unrecognizedFields: record.unrecognizedFields,
          });
        }
      }
      continue;
    }

    const pendingIndex = sourceKey ? pendingBySource.get(sourceKey) : undefined;
    if (pendingIndex !== undefined) {
      inserts[pendingIndex] = mergeIntoPendingImport(inserts[pendingIndex], record);
      continue;
    }

    inserts.push(record);
    if (sourceKey) pendingBySource.set(sourceKey, inserts.length - 1);
  }

  return { inserts, updates };
}
