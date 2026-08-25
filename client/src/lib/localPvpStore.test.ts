import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { listImports, listMatches, parsePvpJson, restoreLocalBackup } from "./localPvpStore";

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
});

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
