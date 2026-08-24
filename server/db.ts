import { and, desc, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { randomUUID } from "node:crypto";
import {
  type InsertUser,
  pvpImportBatches,
  pvpMatches,
  type TeamMember,
  users,
} from "../drizzle/schema";
import type { ImportedMatch, ParsedPvpImport } from "./pvpImport";
import { buildPvpImportReconciliationPlan } from "./pvpImportReconciliation";
import { buildDashboardStats } from "./pvpStats";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("資料庫目前無法使用，請稍後再試。");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  (["name", "email", "loginMethod"] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export type PvpFilters = {
  mode?: "1v1" | "3v3";
  outcome?: "win" | "loss" | "draw" | "unknown";
  startAt?: number;
  endAt?: number;
};

function ownedMatchConditions(userId: number, filters: PvpFilters = {}) {
  const conditions = [eq(pvpMatches.userId, userId)];
  if (filters.mode) conditions.push(eq(pvpMatches.mode, filters.mode));
  if (filters.outcome) conditions.push(eq(pvpMatches.outcome, filters.outcome));
  if (filters.startAt) conditions.push(gte(pvpMatches.battleAt, filters.startAt));
  if (filters.endAt) conditions.push(lte(pvpMatches.battleAt, filters.endAt));
  return and(...conditions);
}

export async function createPvpMatch(userId: number, values: {
  battleAt: number;
  mode: "1v1" | "3v3";
  outcome: "win" | "loss" | "draw" | "unknown";
  playerTeam: TeamMember[];
  opponentTeam: TeamMember[];
  opponentName?: string;
  rankBefore?: number;
  rankAfter?: number;
  notes?: string;
  source: "manual" | "import";
}) {
  const db = await requireDb();
  const result = await db.insert(pvpMatches).values({ userId, ...values });
  return { id: Number(result[0].insertId) };
}

export async function listPvpMatches(userId: number, filters: PvpFilters = {}) {
  const db = await requireDb();
  return db.select().from(pvpMatches).where(ownedMatchConditions(userId, filters)).orderBy(desc(pvpMatches.battleAt)).limit(250);
}

export async function getPvpMatch(userId: number, id: number) {
  const db = await requireDb();
  const result = await db.select().from(pvpMatches).where(and(eq(pvpMatches.id, id), eq(pvpMatches.userId, userId))).limit(1);
  return result[0];
}

export async function deletePvpMatch(userId: number, id: number) {
  const db = await requireDb();
  const result = await db.delete(pvpMatches).where(and(eq(pvpMatches.id, id), eq(pvpMatches.userId, userId)));
  return result[0].affectedRows > 0;
}

export async function getPvpDashboard(userId: number) {
  const db = await requireDb();
  const all = await db.select({
    id: pvpMatches.id,
    battleAt: pvpMatches.battleAt,
    outcome: pvpMatches.outcome,
    mode: pvpMatches.mode,
    rankBefore: pvpMatches.rankBefore,
    rankAfter: pvpMatches.rankAfter,
    opponentName: pvpMatches.opponentName,
  }).from(pvpMatches).where(eq(pvpMatches.userId, userId)).orderBy(desc(pvpMatches.battleAt));
  return buildDashboardStats(all);
}

function importValues(record: ImportedMatch, userId: number, batchId: string) {
  return {
    userId,
    importBatchId: batchId,
    battleAt: record.battleAt,
    mode: record.mode,
    outcome: record.outcome,
    playerTeam: record.playerTeam,
    opponentTeam: record.opponentTeam,
    opponentName: record.opponentName,
    rankBefore: record.rankBefore,
    rankAfter: record.rankAfter,
    source: "import" as const,
    rawPayload: record.rawPayload,
    unrecognizedFields: record.unrecognizedFields,
  };
}

function summaryString(value: unknown, maxLength = 160) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

/**
 * 匯入批次只保留可追溯的 metadata；完整根 JSON 可能接近請求上限，
 * 應僅由各筆可建立戰績的 rawPayload 保存，不能再重複寫入 JSON 欄位。
 */
export function buildPvpImportBatchSummary(parsed: ParsedPvpImport) {
  const source = parsed.rawPayload !== null && typeof parsed.rawPayload === "object" && !Array.isArray(parsed.rawPayload)
    ? parsed.rawPayload as Record<string, unknown>
    : {};
  const chunk = source.chunk !== null && typeof source.chunk === "object" && !Array.isArray(source.chunk)
    ? source.chunk as Record<string, unknown>
    : undefined;

  return {
    format: "rf-pvp-analyzer/import-summary-v1",
    sourceFormat: summaryString(source.format),
    exportedAt: summaryString(source.exportedAt),
    exportedAtLocal: summaryString(source.exportedAtLocal),
    sourceCharacterCount: parsed.sourceCharacterCount ?? null,
    acceptedRecordCount: parsed.records.length,
    rejectedRecordCount: parsed.rejectedCount,
    ...(chunk && typeof chunk.index === "number" && typeof chunk.total === "number"
      ? { chunk: { index: chunk.index, total: chunk.total } }
      : {}),
  };
}

export async function recordPvpImport(userId: number, label: string, parsed: ParsedPvpImport) {
  const db = await requireDb();
  const id = randomUUID();
  const receivedAt = Date.now();
  let createdCount = 0;
  let updatedCount = 0;
  await db.transaction(async tx => {
    await tx.insert(pvpImportBatches).values({
      id,
      userId,
      label,
      receivedAt,
      recognizedCount: parsed.records.length,
      rejectedCount: parsed.rejectedCount,
      warnings: parsed.warnings,
      rawPayload: buildPvpImportBatchSummary(parsed),
    });
    if (parsed.records.length) {
      const existingMatches = await tx.select().from(pvpMatches).where(eq(pvpMatches.userId, userId));
      const plan = buildPvpImportReconciliationPlan(userId, existingMatches, parsed.records);
      for (const update of plan.updates) {
        await tx.update(pvpMatches).set({
          outcome: update.outcome,
          rankBefore: update.rankBefore ?? null,
          rankAfter: update.rankAfter ?? null,
          rawPayload: update.rawPayload,
          unrecognizedFields: update.unrecognizedFields ?? null,
        }).where(and(eq(pvpMatches.id, update.existingId), eq(pvpMatches.userId, userId)));
        updatedCount += 1;
      }
      if (plan.inserts.length) {
        await tx.insert(pvpMatches).values(plan.inserts.map(record => importValues(record, userId, id)));
        createdCount = plan.inserts.length;
      }
    }
  });
  return { id, receivedAt, createdCount, updatedCount };
}

export async function listPvpImportBatches(userId: number) {
  const db = await requireDb();
  return db.select({
    id: pvpImportBatches.id,
    label: pvpImportBatches.label,
    receivedAt: pvpImportBatches.receivedAt,
    recognizedCount: pvpImportBatches.recognizedCount,
    rejectedCount: pvpImportBatches.rejectedCount,
    warnings: pvpImportBatches.warnings,
  }).from(pvpImportBatches).where(eq(pvpImportBatches.userId, userId)).orderBy(desc(pvpImportBatches.receivedAt)).limit(20);
}
