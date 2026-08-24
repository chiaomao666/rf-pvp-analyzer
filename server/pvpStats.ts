export type DashboardMatch = {
  id: number;
  battleAt: number;
  outcome: "win" | "loss" | "draw" | "unknown";
  mode: "1v1" | "3v3";
  rankBefore: number | null;
  rankAfter: number | null;
  opponentName: string | null;
};

/**
 * 將已限定為同一使用者的戰績轉為儀表板所需的統計資料。
 * 排名數字越小代表排名越高，因此趨勢只呈現賽後排名的時間序列。
 */
export function buildDashboardStats(matches: DashboardMatch[]) {
  const chronologicalRanks = matches
    .filter((match) => match.rankAfter !== null)
    .sort((left, right) => left.battleAt - right.battleAt);
  const total = matches.length;
  const wins = matches.filter((match) => match.outcome === "win").length;
  const losses = matches.filter((match) => match.outcome === "loss").length;
  const decided = wins + losses;

  return {
    total,
    wins,
    losses,
    winRate: decided ? Math.round((wins / decided) * 1000) / 10 : null,
    currentRank: chronologicalRanks.at(-1)?.rankAfter ?? null,
    recent: matches.slice(0, 6),
    rankSeries: chronologicalRanks.map((match) => ({ battleAt: match.battleAt, rank: match.rankAfter! })),
  };
}
