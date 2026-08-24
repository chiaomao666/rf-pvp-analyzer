import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getPvpMatch: vi.fn(),
  listPvpMatches: vi.fn(),
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
