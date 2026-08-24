import { EmptyData, ModeBadge, OutcomeBadge, RankDelta, TeamStrip, type TeamMember } from "@/components/PvpUi";
import { Button } from "@/components/ui/button";
import { formatLocalDateTime } from "@/lib/localTime";
import { handlePvpMatchDeleteClick, refreshAfterPvpMatchDelete } from "@/lib/pvpMatchDeletion";
import { trpc } from "@/lib/trpc";
import { Filter, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const outcomes = [{ value: "", label: "所有結果" }, { value: "win", label: "勝利" }, { value: "loss", label: "敗北" }, { value: "draw", label: "平手" }, { value: "unknown", label: "待確認" }];

function toStartTimestamp(value: string) { return value ? new Date(`${value}T00:00:00`).getTime() : undefined; }
function toEndTimestamp(value: string) { return value ? new Date(`${value}T23:59:59.999`).getTime() : undefined; }

export default function Matches() {
  const [mode, setMode] = useState<"" | "1v1" | "3v3">("");
  const [outcome, setOutcome] = useState<"" | "win" | "loss" | "draw" | "unknown">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const filters = useMemo(() => ({ ...(mode ? { mode } : {}), ...(outcome ? { outcome } : {}), ...(toStartTimestamp(startDate) ? { startAt: toStartTimestamp(startDate) } : {}), ...(toEndTimestamp(endDate) ? { endAt: toEndTimestamp(endDate) } : {}) }), [mode, outcome, startDate, endDate]);
  const matches = trpc.pvp.list.useQuery(filters);
  const utils = trpc.useUtils();
  const deleteMatch = trpc.pvp.delete.useMutation({
    onSuccess: async () => {
      await refreshAfterPvpMatchDelete({
        invalidateList: () => utils.pvp.list.invalidate(),
        invalidateDashboard: () => utils.pvp.dashboard.invalidate(),
        notifySuccess: () => toast.success("已刪除這筆戰績。"),
      });
    },
    onError: error => toast.error(error.message),
  });

  return <div className="page-enter">
    <section className="page-titlebar compact-titlebar"><div><p className="eyebrow">ARCHIVE / FILTERABLE BATTLE LEDGER</p><h1>戰績歷史<span className="title-underscore">_</span></h1><p>所有篩選僅讀取登入使用者自己的資料。</p></div><Link href="/record"><Button className="blueprint-button primary-button"><Plus size={16} />新增對戰</Button></Link></section>
    <section className="filter-panel technical-frame">
      <div className="filter-label"><Filter size={15} />篩選條件</div>
      <label><span>模式</span><select value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="">全部模式</option><option value="1v1">1v1</option><option value="3v3">3v3</option></select></label>
      <label><span>結果</span><select value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)}>{outcomes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label><span>開始日期</span><input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
      <label><span>結束日期</span><input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      <button className="reset-filter" type="button" onClick={() => { setMode(""); setOutcome(""); setStartDate(""); setEndDate(""); }}>清除</button>
    </section>
    {matches.isLoading ? <div className="loading-block">讀取戰績資料…</div> : !matches.data?.length ? <EmptyData title="找不到符合條件的戰績" description="調整日期、模式或結果篩選，或新增一筆排名戰紀錄。" action={<Link href="/record"><Button className="blueprint-button primary-button"><Plus size={16} />新增對戰</Button></Link>} /> : <section className="history-table technical-frame"><div className="history-head"><span>日期／模式</span><span>結果</span><span>我的隊伍</span><span>對手隊伍</span><span>排名變動</span><span>操作</span></div>{matches.data.map(match => <article key={match.id} className="history-row"><Link href={`/matches/${match.id}`} className="history-row-link"><div><time>{formatLocalDateTime(match.battleAt)}</time><ModeBadge mode={match.mode} /></div><OutcomeBadge outcome={match.outcome} /><TeamStrip members={match.playerTeam as TeamMember[]} /><TeamStrip members={match.opponentTeam as TeamMember[]} tone="opponent" /><RankDelta before={match.rankBefore} after={match.rankAfter} /></Link><Button type="button" variant="outline" size="icon" className="history-delete" disabled={deleteMatch.isPending} onClick={event => handlePvpMatchDeleteClick(event, match.id, () => window.confirm("確定要刪除這筆戰績嗎？此操作無法復原。"), input => deleteMatch.mutate(input))} aria-label={`刪除 ${formatLocalDateTime(match.battleAt)} 的戰績`}><Trash2 size={16} /></Button></article>)}</section>}
  </div>;
}
