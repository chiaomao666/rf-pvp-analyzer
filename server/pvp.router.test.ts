import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  createPvpMatch: vi.fn(),
  deletePvpMatch: vi.fn(),
  getPvpMatch: vi.fn(),
  listPvpMatches: vi.fn(),
  recordPvpImport: vi.fn(),
}));

vi.mock("./db", () => dbMocks);

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function authenticatedContext(userId: number): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      name: "Test User",
      email: null,
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("pvp.get", () => {
  it("將登入使用者 ID 傳入資料查詢，避免以他人帳號範圍讀取資料", async () => {
    dbMocks.getPvpMatch.mockResolvedValue({ id: 77, userId: 12 });
    const caller = appRouter.createCaller(authenticatedContext(12));

    await expect(caller.pvp.get({ id: 77 })).resolves.toMatchObject({ id: 77 });
    expect(dbMocks.getPvpMatch).toHaveBeenCalledWith(12, 77);
  });
});

describe("pvp.list", () => {
  it("將模式、結果與日期篩選連同登入使用者 ID 傳入資料查詢", async () => {
    dbMocks.listPvpMatches.mockResolvedValue([]);
    const caller = appRouter.createCaller(authenticatedContext(12));
    const filters = { mode: "3v3" as const, outcome: "loss" as const, startAt: 1_725_000_000_000, endAt: 1_726_000_000_000 };

    await expect(caller.pvp.list(filters)).resolves.toEqual([]);
    expect(dbMocks.listPvpMatches).toHaveBeenCalledWith(12, filters);
  });
});

describe("pvp.create", () => {
  it("保留 1v1 模式下的完整五人終局陣容，而不以模式名稱截斷角色快照", async () => {
    dbMocks.createPvpMatch.mockResolvedValue({ id: 88, userId: 12 });
    const caller = appRouter.createCaller(authenticatedContext(12));
    const playerTeam = Array.from({ length: 5 }, (_, index) => ({ name: `己方${index + 1}`, level: 100 + index }));
    const opponentTeam = Array.from({ length: 5 }, (_, index) => ({ name: `對方${index + 1}`, level: 100 + index }));

    await expect(caller.pvp.create({
      battleAt: 1_725_000_300_000,
      mode: "1v1",
      outcome: "unknown",
      playerTeam,
      opponentTeam,
      opponentName: "測試對手",
    })).resolves.toMatchObject({ id: 88 });

    expect(dbMocks.createPvpMatch).toHaveBeenCalledWith(12, expect.objectContaining({
      mode: "1v1",
      outcome: "unknown",
      playerTeam,
      opponentTeam,
      source: "manual",
    }));
  });
});

describe("pvp.importJson", () => {
  const validRecord = {
    battleAt: 1_725_000_300_000,
    mode: "1v1",
    outcome: "unknown",
    playerTeam: [{ name: "己方角色", level: 100 }],
    opponentTeam: [{ name: "對方角色", level: 100 }],
  };

  it("接受超過舊 512KB 限制的完整守衛匯出，並交由使用者範圍的批次保存", async () => {
    dbMocks.recordPvpImport.mockResolvedValue({ id: "batch-large-export" });
    const caller = appRouter.createCaller(authenticatedContext(12));
    const fullExportText = JSON.stringify({ records: [validRecord], rawEvents: [] }).padEnd(2_050_242, " ");

    await expect(caller.pvp.importJson({ label: "完整守衛匯出", dataText: fullExportText })).resolves.toMatchObject({
      batchId: "batch-large-export",
      importedCount: 1,
      rejectedCount: 0,
    });
    expect(dbMocks.recordPvpImport).toHaveBeenCalledWith(12, "完整守衛匯出", expect.objectContaining({
      records: [expect.objectContaining({ mode: "1v1" })],
    }));
  });

  it("接受剛好 25MB 的完整原始封包匯出", async () => {
    dbMocks.recordPvpImport.mockResolvedValue({ id: "batch-25mb-export" });
    const caller = appRouter.createCaller(authenticatedContext(12));
    const fullExportText = JSON.stringify({ records: [validRecord], rawEvents: [] }).padEnd(25_000_000, " ");

    await expect(caller.pvp.importJson({ label: "25MB 完整守衛匯出", dataText: fullExportText })).resolves.toMatchObject({
      batchId: "batch-25mb-export",
      importedCount: 1,
      rejectedCount: 0,
    });
  });

  it("回傳同場結果回填統計，讓前端可辨識既有戰績已更新而非重複建立", async () => {
    dbMocks.recordPvpImport.mockResolvedValue({
      id: "batch-result-backfill",
      createdCount: 0,
      updatedCount: 1,
    });
    const caller = appRouter.createCaller(authenticatedContext(12));

    await expect(caller.pvp.importJson({
      label: "同場官方結果回填",
      dataText: JSON.stringify({ records: [{
        ...validRecord,
        outcome: "win",
        rankBefore: 904,
        rankAfter: 878,
        sourceBattleChannel: "pvp_battle:12345",
      }], rawEvents: [] }),
    })).resolves.toMatchObject({
      batchId: "batch-result-backfill",
      importedCount: 1,
      createdCount: 0,
      updatedCount: 1,
    });
    expect(dbMocks.recordPvpImport).toHaveBeenLastCalledWith(12, "同場官方結果回填", expect.objectContaining({
      records: [expect.objectContaining({ sourceBattleChannel: "pvp_battle:12345", outcome: "win" })],
    }));
  });

  it("仍拒絕超過 25MB 匯入上限的字串", async () => {
    const caller = appRouter.createCaller(authenticatedContext(12));
    await expect(caller.pvp.importJson({ label: "過大匯出", dataText: " ".repeat(25_000_001) })).rejects.toThrow();
  });

  it("資料庫失敗時不將 SQL 或原始 JSON 透傳至匯入頁", async () => {
    dbMocks.recordPvpImport.mockRejectedValueOnce(new Error("Failed query: insert into pvpImportBatches values ('giant-raw-payload')"));
    const caller = appRouter.createCaller(authenticatedContext(12));

    await expect(caller.pvp.importJson({
      label: "資料庫失敗遮罩",
      dataText: JSON.stringify({ records: [validRecord] }),
    })).rejects.toThrow("匯入批次暫時無法保存");
  });
});

describe("pvp.delete", () => {
  it("以登入使用者範圍刪除紀錄，並拒絕不屬於該使用者或不存在的 ID", async () => {
    const caller = appRouter.createCaller(authenticatedContext(12));
    dbMocks.deletePvpMatch.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(caller.pvp.delete({ id: 91 })).resolves.toEqual({ success: true });
    expect(dbMocks.deletePvpMatch).toHaveBeenCalledWith(12, 91);
    await expect(caller.pvp.delete({ id: 92 })).rejects.toThrow();
    expect(dbMocks.deletePvpMatch).toHaveBeenLastCalledWith(12, 92);
  });
});
