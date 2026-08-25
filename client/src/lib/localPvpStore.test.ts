import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateStoredWorkspace, loginOfficialAccount, logoutWorkspace } from "./accountWorkspace";
import { countUnscopedData, exportLocalBackup, getMatch, importPvpJson, listImports, listMatches, listProfiles, migrateUnscopedDataToProfile, parsePvpJson, restoreLocalBackup, saveMatch, setActiveProfileId, upsertProfile } from "./localPvpStore";

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  logoutWorkspace();
});
afterEach(() => vi.unstubAllGlobals());

const fixtureRecord = (sourceBattleId = "fixture-1") => ({ battleAt: 1787603139254, mode: "1v1" as const, outcome: "win" as const, playerTeam: [{ name: "我方" }], opponentTeam: [{ name: "對方" }], sourceBattleChannel: "player:#", sourceBattleId });
const officialProfile = async (userId: string) => upsertProfile({ id: `official:${userId}`, externalUserId: userId, kind: "official", createdAt: Date.now(), lastVerifiedAt: Date.now() });

describe("parsePvpJson", () => {
  it("normalizes a guard-compatible record", () => {
    const parsed = parsePvpJson(JSON.stringify({ records: [{ timestamp: "2026-08-24T22:00:00.000Z", mode: "1v1", result: "victory", playerTeam: [{ name: "我方", level: 80 }], opponentTeam: [{ name: "對方", power: 12345 }], rank_before: 30, rank_after: 22, score_before: 6740, score_after: 6860 }] }));
    expect(parsed.rejectedCount).toBe(0);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({ mode: "1v1", outcome: "win", rankBefore: 30, rankAfter: 22, scoreBefore: 6740, scoreAfter: 6860 });
  });
  it("rejects incomplete candidates without throwing", () => {
    const parsed = parsePvpJson(JSON.stringify([{ mode: "1v1" }, { battleAt: Date.now(), mode: "3v3", playerTeam: ["我"], opponentTeam: ["敵"] }]));
    expect(parsed.records).toHaveLength(1);
    expect(parsed.rejectedCount).toBe(1);
  });

  it("restores portable records into IndexedDB with generated keys", async () => {
    const backup = JSON.stringify({
      format: "rf-pvp-analyzer/local-backup-v1",
      exportedAt: "2026-08-24T22:39:08.808Z",
      recordCount: 1,
      records: [{ battleAt: 1787603139254, mode: "1v1", outcome: "win", playerTeam: [{ name: "我方" }], opponentTeam: [{ name: "對方" }], sourceBattleChannel: "player:#", sourceBattleId: "fixture-1", unrecognizedFields: { scoreBefore: 6740, scoreAfter: 6860 }, createdAt: 1787603139254, updatedAt: 1787603139254 }],
      imports: [{ receivedAt: 1787603139254, label: "真實備份格式測試", recognizedCount: 1, rejectedCount: 0, warnings: [] }],
    });

    await expect(restoreLocalBackup(backup, true)).resolves.toEqual({ restored: 1, skipped: 0 });
    await expect(listMatches()).resolves.toMatchObject([{ id: 1, sourceBattleId: "fixture-1", outcome: "win", scoreBefore: 6740, scoreAfter: 6860 }]);
    await expect(listImports()).resolves.toMatchObject([{ id: 1, label: "真實備份格式測試", recognizedCount: 1 }]);
  });
});

describe("帳號工作區隔離與備份", () => {
  it("讓相同官方來源鍵在不同帳號工作區各自建立，且無法跨帳號讀取", async () => {
    const profileA = await officialProfile("101"); const profileB = await officialProfile("202");
    setActiveProfileId(profileA.id);
    await importPvpJson("帳號 A", JSON.stringify({ records: [fixtureRecord("same-source")] }));
    const matchA = (await listMatches())[0];
    setActiveProfileId(profileB.id);
    await importPvpJson("帳號 B", JSON.stringify({ records: [fixtureRecord("same-source")] }));
    const matchB = (await listMatches())[0];
    expect(matchB.id).not.toBe(matchA.id);
    expect(await getMatch(matchA.id)).toBeUndefined();
    setActiveProfileId(profileA.id);
    await expect(listMatches()).resolves.toMatchObject([{ id: matchA.id, profileId: profileA.id }]);
    await expect(listImports()).resolves.toHaveLength(1);
  });

  it("只在明確呼叫遷移後才把 v1 未綁定資料指派給第一個帳號", async () => {
    const legacyRecords = Array.from({ length: 11 }, (_, index) => fixtureRecord(`legacy-source-${index + 1}`));
    const legacy = JSON.stringify({ format: "rf-pvp-analyzer/local-backup-v1", exportedAt: "2026-08-24T22:39:08.808Z", recordCount: 11, records: legacyRecords, imports: [{ receivedAt: 1787603139254, label: "舊資料", recognizedCount: 11, rejectedCount: 0, warnings: [] }] });
    await restoreLocalBackup(legacy, true);
    await expect(countUnscopedData()).resolves.toEqual({ matches: 11, imports: 1 });
    const profileA = await officialProfile("101"); const profileB = await officialProfile("202");
    setActiveProfileId(profileA.id);
    await expect(listMatches()).resolves.toEqual([]);
    await expect(migrateUnscopedDataToProfile()).resolves.toEqual({ matches: 11, imports: 1 });
    const migrated = await listMatches();
    expect(migrated).toHaveLength(11);
    expect(migrated.every(match => match.profileId === profileA.id)).toBe(true);
    expect(new Set(migrated.map(match => match.sourceBattleId)).size).toBe(11);
    setActiveProfileId(profileB.id);
    await expect(listMatches()).resolves.toEqual([]);
    await expect(countUnscopedData()).resolves.toEqual({ matches: 0, imports: 0 });
  });

  it("拒絕 JSON 內明確屬於其他帳號的資料", async () => {
    const profileA = await officialProfile("101"); setActiveProfileId(profileA.id);
    await expect(importPvpJson("錯誤帳號", JSON.stringify({ user_id: "202", records: [fixtureRecord()] }))).rejects.toThrow("帳號 ID 與目前登入帳號不一致");
    await expect(listMatches()).resolves.toEqual([]);
  });

  it("只允許在相符帳號下還原 v2 完整備份，並將備份限制為非機密 profile 資訊", async () => {
    const profileA = await officialProfile("101"); const profileB = await officialProfile("202");
    setActiveProfileId(profileA.id); await saveMatch(fixtureRecord("v2-source"));
    const backup = await exportLocalBackup(); const serialized = JSON.stringify(backup);
    expect(backup.format).toBe("rf-pvp-analyzer/local-backup-v2"); expect(backup.profile).toMatchObject({ id: profileA.id, externalUserId: "101" });
    expect(serialized).not.toContain("password"); expect(serialized).not.toContain("user_token");
    setActiveProfileId(profileB.id);
    await expect(restoreLocalBackup(serialized)).rejects.toThrow("屬於其他帳號工作區");
  });

  it("登入成功後只保存官方 user_id profile，不保存本次回應的 user token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok", data: { user_id: "918", user_token: "test-session-token" } }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const session = await loginOfficialAccount("tester", "only-for-request");
    expect(session).toMatchObject({ verifiedThisSession: true, profile: { id: "official:918", externalUserId: "918", kind: "official" } });
    const request = vi.mocked(fetch).mock.calls[0];
    expect(String(request[1]?.body)).toContain("user%5Bpassword%5D=only-for-request");
    const backup = await exportLocalBackup();
    expect(JSON.stringify(backup)).not.toContain("only-for-request");
    expect(JSON.stringify(backup)).not.toContain("test-session-token");
    logoutWorkspace();
    await expect(activateStoredWorkspace("official:918")).resolves.toMatchObject({ verifiedThisSession: false, profile: { id: "official:918" } });
  });

  it("瀏覽器 CORS 型 fetch 拒絕會回報非帳密錯誤，並且不建立工作區", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(loginOfficialAccount("tester", "only-for-request")).rejects.toMatchObject({
      kind: "cors-or-cloudflare",
    });
    expect(await listProfiles()).toEqual([]);
  });
});
