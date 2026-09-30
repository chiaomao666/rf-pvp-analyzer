import { EmptyData, ModeBadge, OutcomeBadge, RankDelta, ScoreDelta } from "@/components/PvpUi";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatLocalDateTime } from "@/lib/localTime";
import { deleteMatch, listMatches, type LocalPvpMatch, type MatchFilters, type MatchSort } from "@/lib/localPvpStore";
import { Filter, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const outcomes = [{ value: "", label: "所有結果" }, { value: "win", label: "勝利" }, { value: "loss", label: "敗北" }, { value: "unknown", label: "待確認" }];
const sortOptions: { value: MatchSort; label: string }[] = [{ value: "newest", label: "最新對戰優先" }, { value: "oldest", label: "最早對戰優先" }, { value: "scoreDelta", label: "積分變動最高" }, { value: "rankGain", label: "排名進步最多" }];

function OpponentCells({ match }: { match: LocalPvpMatch }) {
  const name = match.opponentName?.trim() || match.opponentTeam[0]?.name || "未提供對手玩家";
  return <><span className="opponent-name">{name}</span><span className="opponent-union">{match.opponentUnion?.trim() || "—"}</span><span className="opponent-id">{match.opponentPlayerId || "—"}</span></>;
}

export default function Matches() {
  const [outcome, setOutcome] = useState<"" | "win" | "loss" | "unknown">(""); const [query, setQuery] = useState(""); const [sort, setSort] = useState<MatchSort>("newest"); const [matches, setMatches] = useState<LocalPvpMatch[]>([]); const [loading, setLoading] = useState(true); const [pendingDelete, setPendingDelete] = useState<LocalPvpMatch | null>(null); const [deleting, setDeleting] = useState(false);
  const filters = useMemo<MatchFilters>(() => ({ ...(outcome ? { outcome } : {}), ...(query.trim() ? { query } : {}), sort }), [outcome, query, sort]);
  const refresh = () => { setLoading(true); listMatches(filters).then(setMatches).catch(() => toast.error("讀取本機戰績失敗。 ")).finally(() => setLoading(false)); };
  useEffect(() => { refresh(); }, [filters]);
  useEffect(() => { window.addEventListener("rf-pvp-store-change", refresh); return () => window.removeEventListener("rf-pvp-store-change", refresh); }, [filters]);
  const remove = async () => { if (!pendingDelete) return; setDeleting(true); try { await deleteMatch(pendingDelete.id); toast.success("已刪除這筆本機戰績。 "); setPendingDelete(null); } catch { toast.error("刪除失敗，請稍後再試。 "); } finally { setDeleting(false); } };
  return <div className="page-enter">
    <section className="page-titlebar compact-titlebar"><div><p className="eyebrow">ARCHIVE / LOCAL BROWSER DATA</p><h1>戰績歷史<span className="title-underscore">_</span></h1><p>所有篩選僅讀取目前工作區的戰績；PVP 守衛收到的新資料會自動同步。</p></div><Link href="/record"><Button className="blueprint-button primary-button"><Plus size={16} />新增對戰</Button></Link></section>
    <section className="filter-panel technical-frame"><div className="filter-label"><Filter size={15} />篩選條件</div><label><span>結果</span><select value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)}>{outcomes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>排序</span><select value={sort} onChange={event => setSort(event.target.value as MatchSort)}>{sortOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="match-search"><span>搜尋對手</span><div><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="玩家、組織或 ID" /></div></label><button className="reset-filter" type="button" onClick={() => { setOutcome(""); setQuery(""); setSort("newest"); }}>清除</button></section>
    {loading ? <div className="loading-block">讀取本機戰績…</div> : !matches.length ? <EmptyData title="找不到符合條件的戰績" description="調整日期、模式或結果篩選，或新增一筆排名戰紀錄。" action={<Link href="/record"><Button className="blueprint-button primary-button"><Plus size={16} />新增對戰</Button></Link>} /> : <section className="history-table technical-frame">
      <div className="history-head"><span>日期／模式</span><span>結果</span><span>對手玩家</span><span>聯盟／組織</span><span>玩家 ID</span><span>積分變動</span><span>排名變動</span><span>操作</span></div>
      {matches.map(match => <article key={match.id} className="history-row">
        <Link href={`/matches/${match.id}`} className="history-row-link">
          <div><time>{formatLocalDateTime(match.battleAt)}</time><ModeBadge mode={match.mode} /></div>
          <OutcomeBadge outcome={match.outcome} />
          <OpponentCells match={match} />
          <ScoreDelta before={match.scoreBefore} after={match.scoreAfter} />
          <RankDelta before={match.rankBefore} after={match.rankAfter} />
        </Link>
        <Button type="button" variant="outline" size="icon" className="history-delete" disabled={deleting} onClick={() => setPendingDelete(match)} aria-label={`刪除 ${formatLocalDateTime(match.battleAt)} 的戰績`}><Trash2 size={16} /></Button>
      </article>)}
    </section>}
    <AlertDialog open={pendingDelete !== null} onOpenChange={open => !open && !deleting && setPendingDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>刪除這筆戰績？</AlertDialogTitle><AlertDialogDescription>將永久刪除 {pendingDelete ? formatLocalDateTime(pendingDelete.battleAt) : "這筆"} 的戰績，無法復原。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel><AlertDialogAction disabled={!pendingDelete || deleting} onClick={event => { event.preventDefault(); void remove(); }}>{deleting ? "刪除中…" : "確認刪除"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
