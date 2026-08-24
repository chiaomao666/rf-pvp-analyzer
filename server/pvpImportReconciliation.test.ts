import { describe, expect, it } from "vitest";
import type { ImportedMatch } from "./pvpImport";
import { buildPvpImportReconciliationPlan } from "./pvpImportReconciliation";

const unknownImport: ImportedMatch = {
  battleAt: 1_726_000_000_000,
  mode: "1v1",
  outcome: "unknown",
  playerTeam: [{ name: "Player" }],
  opponentTeam: [{ name: "Opponent" }],
  sourceBattleChannel: "pvp_battle:12345",
  rawPayload: { sourceBattleChannel: "pvp_battle:12345", phase: "initial" },
};

const officialResult: ImportedMatch = {
  ...unknownImport,
  outcome: "win",
  rankBefore: 904,
  rankAfter: 878,
  rawPayload: {
    sourceBattleChannel: "pvp_battle:12345",
    outcome: "win",
    rankBefore: 904,
    rankAfter: 878,
    officialResult: true,
  },
};

const existingUnknown = {
  id: 41,
  userId: 12,
  outcome: "unknown" as const,
  rankBefore: null,
  rankAfter: null,
  rawPayload: unknownImport.rawPayload,
};

describe("buildPvpImportReconciliationPlan", () => {
  it("將同使用者同場的官方結果回填到既有待確認紀錄，而非新增重複戰績", () => {
    const plan = buildPvpImportReconciliationPlan(12, [existingUnknown], [officialResult]);

    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toEqual([expect.objectContaining({
      existingId: 41,
      outcome: "win",
      rankBefore: 904,
      rankAfter: 878,
      rawPayload: officialResult.rawPayload,
    })]);
  });

  it("重複匯入完全相同的官方結果時不新增也不再更新", () => {
    const resolvedExisting = {
      ...existingUnknown,
      outcome: "win" as const,
      rankBefore: 904,
      rankAfter: 878,
      rawPayload: officialResult.rawPayload,
    };
    const plan = buildPvpImportReconciliationPlan(12, [resolvedExisting], [officialResult]);

    expect(plan).toEqual({ inserts: [], updates: [] });
  });

  it("即使來源鍵相同，也不會將其他使用者的紀錄視為可回填目標", () => {
    const plan = buildPvpImportReconciliationPlan(12, [{ ...existingUnknown, userId: 99 }], [officialResult]);

    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts).toEqual([officialResult]);
  });

  it("在同一匯入批次內合併同場的初始與官方結果資料，僅建立一筆完整紀錄", () => {
    const plan = buildPvpImportReconciliationPlan(12, [], [unknownImport, officialResult]);

    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts).toEqual([expect.objectContaining({
      outcome: "win",
      rankBefore: 904,
      rankAfter: 878,
      rawPayload: officialResult.rawPayload,
    })]);
  });
});
