import { describe, expect, it } from "vitest";
import { buildDashboardStats } from "./pvpStats";

describe("buildDashboardStats", () => {
  it("只以勝負場計算勝率，並依時間產生私有排名趨勢與最近六場", () => {
    const summary = buildDashboardStats([
      { id: 5, battleAt: 5_000, mode: "1v1", outcome: "draw", rankBefore: 101, rankAfter: 101, opponentName: "E" },
      { id: 4, battleAt: 4_000, mode: "3v3", outcome: "loss", rankBefore: 95, rankAfter: 103, opponentName: "D" },
      { id: 3, battleAt: 3_000, mode: "1v1", outcome: "unknown", rankBefore: null, rankAfter: null, opponentName: null },
      { id: 2, battleAt: 2_000, mode: "1v1", outcome: "win", rankBefore: 110, rankAfter: 95, opponentName: "B" },
      { id: 1, battleAt: 1_000, mode: "3v3", outcome: "win", rankBefore: 125, rankAfter: 110, opponentName: "A" },
    ]);

    expect(summary).toMatchObject({ total: 5, wins: 2, losses: 1, winRate: 66.7, currentRank: 101 });
    expect(summary.rankSeries).toEqual([
      { battleAt: 1_000, rank: 110 },
      { battleAt: 2_000, rank: 95 },
      { battleAt: 4_000, rank: 103 },
      { battleAt: 5_000, rank: 101 },
    ]);
    expect(summary.recent.map((match) => match.id)).toEqual([5, 4, 3, 2, 1]);
  });

  it("沒有已決勝負時不產生誤導性的勝率", () => {
    const summary = buildDashboardStats([
      { id: 1, battleAt: 1_000, mode: "1v1", outcome: "unknown", rankBefore: null, rankAfter: null, opponentName: null },
    ]);

    expect(summary.winRate).toBeNull();
    expect(summary.currentRank).toBeNull();
  });
});
