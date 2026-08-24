import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { pvpMatches, type TeamMember } from "../../drizzle/schema";
import * as db from "../db";
import { parsePvpImportPayload } from "../pvpImport";
import { protectedProcedure, router } from "../_core/trpc";

/** 完整守衛匯出含 rawEvents；25MB 足以保存長對戰歷程，仍保留單次請求邊界。 */
const MAX_PVP_IMPORT_TEXT_LENGTH = 25_000_000;

const teamMemberSchema = z.object({
  name: z.string().trim().min(1, "請填寫角色名稱").max(100),
  level: z.number().int().positive().max(999).optional(),
  power: z.number().int().nonnegative().max(9_999_999_999).optional(),
  role: z.string().trim().max(40).optional(),
  rarity: z.string().trim().max(40).optional(),
}).passthrough();

const matchInputSchema = z.object({
  battleAt: z.number().int().positive(),
  mode: z.enum(["1v1", "3v3"]),
  outcome: z.enum(["win", "loss", "draw", "unknown"]),
  // `mode` 是遊戲 PVP 模式；實際封包可為該模式下的完整多角色陣容，不以 1／3 人硬性截斷。
  playerTeam: z.array(teamMemberSchema).min(1).max(20),
  opponentTeam: z.array(teamMemberSchema).min(1).max(20),
  opponentName: z.string().trim().max(120).optional(),
  rankBefore: z.number().int().positive().optional(),
  rankAfter: z.number().int().positive().optional(),
  notes: z.string().trim().max(3000).optional(),
});

const filterSchema = z.object({
  mode: z.enum(["1v1", "3v3"]).optional(),
  outcome: z.enum(["win", "loss", "draw", "unknown"]).optional(),
  startAt: z.number().int().positive().optional(),
  endAt: z.number().int().positive().optional(),
});

export const pvpRouter = router({
  dashboard: protectedProcedure.query(({ ctx }) => db.getPvpDashboard(ctx.user.id)),
  list: protectedProcedure.input(filterSchema).query(({ ctx, input }) => db.listPvpMatches(ctx.user.id, input)),
  get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const match = await db.getPvpMatch(ctx.user.id, input.id);
    if (!match) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這筆戰績。" });
    return match;
  }),
  create: protectedProcedure.input(matchInputSchema).mutation(async ({ ctx, input }) => {
    const match = await db.createPvpMatch(ctx.user.id, {
      ...input,
      playerTeam: input.playerTeam as TeamMember[],
      opponentTeam: input.opponentTeam as TeamMember[],
      source: "manual",
    });
    return match;
  }),
  delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const removed = await db.deletePvpMatch(ctx.user.id, input.id);
    if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這筆戰績。" });
    return { success: true } as const;
  }),
  importJson: protectedProcedure.input(z.object({
    label: z.string().trim().min(1).max(120),
    dataText: z.string().min(2).max(MAX_PVP_IMPORT_TEXT_LENGTH),
  })).mutation(async ({ ctx, input }) => {
    const parsed = parsePvpImportPayload(input.dataText);
    const batch = await db.recordPvpImport(ctx.user.id, input.label, parsed);
    return {
      batchId: batch.id,
      importedCount: parsed.records.length,
      createdCount: batch.createdCount,
      updatedCount: batch.updatedCount,
      rejectedCount: parsed.rejectedCount,
      warnings: parsed.warnings,
    };
  }),
  listImports: protectedProcedure.query(({ ctx }) => db.listPvpImportBatches(ctx.user.id)),
});
