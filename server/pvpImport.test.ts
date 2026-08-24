import { describe, expect, it } from "vitest";
import { parsePvpImportPayload } from "./pvpImport";

describe("parsePvpImportPayload", () => {
  it("辨識 1v1 紀錄、轉換秒級時間戳並保留未辨識欄位", () => {
    const parsed = parsePvpImportPayload(JSON.stringify({
      records: [{
        timestamp: 1_725_000_000,
        mode: "1v1",
        result: "win",
        playerTeam: [{ name: "夏夏", power: 120_000 }],
        opponentTeam: [{ name: "對手", lv: 80 }],
        rankBefore: 120,
        rankAfter: 111,
        serverTrace: "retained-for-review",
      }],
    }));

    expect(parsed.rejectedCount).toBe(0);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      battleAt: 1_725_000_000_000,
      mode: "1v1",
      outcome: "win",
      rankBefore: 120,
      rankAfter: 111,
      unrecognizedFields: { serverTrace: "retained-for-review" },
    });
  });

  it("依三人隊伍推定 3v3，並拒絕隊伍不完整的紀錄而不拋棄整批資料", () => {
    const parsed = parsePvpImportPayload(JSON.stringify([
      {
        date: "2026-08-24T12:00:00.000Z",
        playerTeam: ["A", "B", "C"],
        opponentTeam: ["D", "E", "F"],
        status: "loss",
      },
      {
        timestamp: 1_725_000_100,
        mode: "3v3",
        playerTeam: ["A", "B"],
        opponentTeam: ["D", "E", "F"],
      },
    ]));

    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({ mode: "3v3", outcome: "loss" });
    expect(parsed.rejectedCount).toBe(1);
    expect(parsed.warnings.join(" ")).toContain("完整雙方隊伍");
    expect(parsed.rawPayload).toHaveLength(2);
  });
});
