import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportedMatch, ParsedPvpImport } from "./pvpImport";

const dataLayer = vi.hoisted(() => {
  const state = {
    existing: [] as unknown[],
    batchInserts: [] as unknown[],
    matchInserts: [] as unknown[],
    updates: [] as unknown[],
  };
  const insertValues = vi.fn(async (values: unknown) => {
    if (Array.isArray(values)) state.matchInserts.push(...values);
    else state.batchInserts.push(values);
  });
  const updateWhere = vi.fn(async () => []);
  const updateSet = vi.fn((values: unknown) => {
    state.updates.push(values);
    return { where: updateWhere };
  });
  const selectWhere = vi.fn(async () => state.existing);
  const tx = {
    insert: vi.fn(() => ({ values: insertValues })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: selectWhere })) })),
    update: vi.fn(() => ({ set: updateSet })),
  };
  const transaction = vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  const reset = () => {
    state.existing = [];
    state.batchInserts = [];
    state.matchInserts = [];
    state.updates = [];
    insertValues.mockClear();
    updateWhere.mockClear();
    updateSet.mockClear();
    selectWhere.mockClear();
    tx.insert.mockClear();
    tx.select.mockClear();
    tx.update.mockClear();
    transaction.mockClear();
  };
  return { state, transaction, reset };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => ({ transaction: dataLayer.transaction })) }));

const unknownRecord: ImportedMatch = {
  battleAt: 1_726_000_000_000,
  mode: "1v1",
  outcome: "unknown",
  playerTeam: [{ name: "Player" }],
  opponentTeam: [{ name: "Opponent" }],
  sourceBattleChannel: "pvp_battle:12345",
  rawPayload: { sourceBattleChannel: "pvp_battle:12345", phase: "initial" },
};

const officialRecord: ImportedMatch = {
  ...unknownRecord,
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

const parsed = (records: ImportedMatch[]): ParsedPvpImport => ({
  rawPayload: { records },
  records,
  rejectedCount: 0,
  warnings: [],
});

const existingMatch = (overrides: Record<string, unknown> = {}) => ({
  id: 41,
  userId: 12,
  outcome: "unknown",
  rankBefore: null,
  rankAfter: null,
  rawPayload: unknownRecord.rawPayload,
  ...overrides,
});

let recordPvpImport: typeof import("./db").recordPvpImport;

beforeAll(async () => {
  process.env.DATABASE_URL = "mysql://record-pvp-import-test";
  ({ recordPvpImport } = await import("./db"));
});

beforeEach(() => dataLayer.reset());

describe("recordPvpImport transaction reconciliation", () => {
  it("對同使用者既有待確認紀錄回填官方結果，回傳 0 新建／1 更新且不插入重複戰績", async () => {
    dataLayer.state.existing = [existingMatch()];

    const result = await recordPvpImport(12, "官方結果回填", parsed([officialRecord]));

    expect(result).toMatchObject({ createdCount: 0, updatedCount: 1 });
    expect(dataLayer.state.batchInserts).toHaveLength(1);
    expect(dataLayer.state.matchInserts).toHaveLength(0);
    expect(dataLayer.state.updates).toEqual([expect.objectContaining({
      outcome: "win",
      rankBefore: 904,
      rankAfter: 878,
      rawPayload: officialRecord.rawPayload,
    })]);
  });

  it("重複匯入完全相同的官方結果時，回傳 0 新建／0 更新", async () => {
    dataLayer.state.existing = [existingMatch({
      outcome: "win",
      rankBefore: 904,
      rankAfter: 878,
      rawPayload: officialRecord.rawPayload,
    })];

    const result = await recordPvpImport(12, "官方結果重匯", parsed([officialRecord]));

    expect(result).toMatchObject({ createdCount: 0, updatedCount: 0 });
    expect(dataLayer.state.matchInserts).toHaveLength(0);
    expect(dataLayer.state.updates).toHaveLength(0);
  });

  it("來源鍵相同但屬於其他使用者的紀錄不會被更新，當前使用者會建立自己的紀錄", async () => {
    dataLayer.state.existing = [existingMatch({ userId: 99 })];

    const result = await recordPvpImport(12, "跨使用者隔離", parsed([officialRecord]));

    expect(result).toMatchObject({ createdCount: 1, updatedCount: 0 });
    expect(dataLayer.state.updates).toHaveLength(0);
    expect(dataLayer.state.matchInserts).toEqual([expect.objectContaining({
      userId: 12,
      outcome: "win",
      rankBefore: 904,
      rankAfter: 878,
    })]);
  });
});
