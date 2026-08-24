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

  it("依三人隊伍推定 3v3，並拒絕缺少任一方隊伍的紀錄而不拋棄整批資料", () => {
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
        playerTeam: [],
        opponentTeam: ["D", "E", "F"],
      },
    ]));

    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({ mode: "3v3", outcome: "loss" });
    expect(parsed.rejectedCount).toBe(1);
    expect(parsed.warnings.join(" ")).toContain("非空雙方隊伍");
    expect(parsed.rawPayload).toHaveLength(2);
  });

  it("接受 PVP 守衛的分析站匯出包裝格式，並保留守衛的原始封包欄位", () => {
    const guardExport = {
      format: "rf-pvp-analyzer/v1",
      exportedAt: "2026-08-24T16:00:00.000Z",
      source: "PVP Double Match Guard",
      records: [{
        battleAt: 1_725_000_200_000,
        mode: "3v3",
        outcome: "unknown",
        playerTeam: ["A", "B", "C"],
        opponentTeam: ["D", "E", "F"],
        rankBefore: 90,
        rankAfter: 86,
        sourceEvent: "pvp_battle_status",
        rawEvent: { status: "matched", channel: "battle:123" },
      }],
      rawEvents: [{ event: "pvp_battle_status", payload: { status: "matched" } }],
    };

    const parsed = parsePvpImportPayload(JSON.stringify(guardExport));

    expect(parsed.rejectedCount).toBe(0);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      mode: "3v3",
      outcome: "unknown",
      rankBefore: 90,
      rankAfter: 86,
      unrecognizedFields: {
        sourceEvent: "pvp_battle_status",
        rawEvent: { status: "matched", channel: "battle:123" },
      },
    });
    expect(parsed.rawPayload).toMatchObject({
      format: "rf-pvp-analyzer/v1",
      rawEvents: [{ event: "pvp_battle_status" }],
    });
  });

  it("接受真實 PVP 終局快照的五對五陣容，並將 1v1 保留為模式而非角色數量", () => {
    const members = ["甲", "乙", "丙", "丁", "戊"].map((name, index) => ({
      name,
      level: 100 + index,
      role: index % 2 ? "S" : "G",
      raw: { defender: false, position: index + 1, blood: 1000 - index * 100 },
    }));
    const parsed = parsePvpImportPayload(JSON.stringify({
      format: "rf-pvp-analyzer/v1",
      records: [{
        battleAt: 1_725_000_300_000,
        mode: "1v1",
        outcome: "unknown",
        playerTeam: members,
        opponentTeam: members.map(member => ({ ...member, name: `敵${member.name}`, raw: { ...member.raw, defender: true } })),
        opponentName: "真實對手",
        sourceBattleChannel: "pvp_battle:example",
        terminalAction: "medals",
        rawEvent: { terminal: { next_action: "medals" } },
      }],
    }));

    expect(parsed.rejectedCount).toBe(0);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      mode: "1v1",
      outcome: "unknown",
      opponentName: "真實對手",
      unrecognizedFields: {
        sourceBattleChannel: "pvp_battle:example",
        terminalAction: "medals",
      },
    });
    expect(parsed.records[0].playerTeam[0]).toMatchObject({ name: "甲", level: 100, role: "G" });
    expect(parsed.records[0].playerTeam[0].raw).toEqual({ defender: false, position: 1, blood: 1000 });
    expect(parsed.records[0].playerTeam).toHaveLength(5);
    expect(parsed.records[0].opponentTeam).toHaveLength(5);
  });

  it("保留官方結果頁 medals 證據與已確認的積分、排名變動", () => {
    const parsed = parsePvpImportPayload(JSON.stringify({
      format: "rf-pvp-analyzer/v1",
      records: [{
        battleAt: 1_725_000_400_000,
        mode: "1v1",
        outcome: "win",
        playerTeam: ["我方"],
        opponentTeam: ["對方"],
        rankBefore: 980,
        rankAfter: 904,
        scoreBefore: 5945,
        scoreAfter: 6135,
        scoreChange: 190,
        rankChange: 76,
        resultEvidence: "official_player_medals",
      }],
    }));

    expect(parsed.rejectedCount).toBe(0);
    expect(parsed.records[0]).toMatchObject({ outcome: "win", rankBefore: 980, rankAfter: 904 });
    expect(parsed.records[0].unrecognizedFields).toMatchObject({
      scoreBefore: 5945,
      scoreAfter: 6135,
      scoreChange: 190,
      rankChange: 76,
      resultEvidence: "official_player_medals",
    });
  });
});
