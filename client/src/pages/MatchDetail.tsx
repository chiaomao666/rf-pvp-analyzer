import { BlueprintTag, EmptyData, ModeBadge, OutcomeBadge, RankDelta, TeamStrip, type TeamMember } from "@/components/PvpUi";
import { Button } from "@/components/ui/button";
import { formatLocalDateTime } from "@/lib/localTime";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Database, FileJson, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function MatchDetail({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const match = trpc.pvp.get.useQuery({ id });
  const remove = trpc.pvp.delete.useMutation({ onSuccess: async () => { await utils.pvp.invalidate(); toast.success("已刪除這筆戰績。"); navigate("/matches"); }, onError: error => toast.error(error.message) });
  if (match.isLoading) return <div className="loading-block">載入單場資料…</div>;
  if (!match.data) return <EmptyData title="找不到這筆戰績" description="這筆資料可能已被刪除，或不屬於目前登入的使用者。" action={<Link href="/matches"><Button className="blueprint-button secondary-button"><ArrowLeft size={16} />返回戰績歷史</Button></Link>} />;
  const data = match.data;
  const hasUnrecognizedFields = Boolean(data.unrecognizedFields);
  const hasRawPayload = Boolean(data.rawPayload);
  const unrecognizedFieldsJson = hasUnrecognizedFields ? JSON.stringify(data.unrecognizedFields, null, 2) || "{}" : "";
  const rawPayloadJson = hasRawPayload ? JSON.stringify(data.rawPayload, null, 2) || "{}" : "";
  return <div className="page-enter detail-page">
    <section className="detail-topline"><Link href="/matches" className="back-link"><ArrowLeft size={15} />返回戰績歷史</Link><BlueprintTag>{data.source === "import" ? "IMPORTED RECORD" : "MANUAL RECORD"}</BlueprintTag></section>
    <section className="detail-header technical-frame"><div><p className="eyebrow">BATTLE RECORD / {String(data.id).padStart(5, "0")}</p><h1>{formatLocalDateTime(data.battleAt)}</h1><div className="detail-badges"><ModeBadge mode={data.mode} /><OutcomeBadge outcome={data.outcome} />{data.opponentName && <BlueprintTag>對手：{data.opponentName}</BlueprintTag>}</div></div><button className="danger-button" onClick={() => { if (confirm("確定要刪除這筆戰績嗎？此操作無法復原。")) remove.mutate({ id }); }} disabled={remove.isPending}><Trash2 size={15} />刪除紀錄</button></section>
    <section className="detail-stats"><div className="detail-stat"><span>賽前排名</span><b>{data.rankBefore ? `#${data.rankBefore}` : "—"}</b></div><div className="detail-stat"><span>賽後排名</span><b>{data.rankAfter ? `#${data.rankAfter}` : "—"}</b></div><div className="detail-stat"><span>排名變動</span><RankDelta before={data.rankBefore} after={data.rankAfter} /></div></section>
    <section className="versus-grid"><article className="team-panel technical-frame"><header><span>01 / PLAYER SIDE</span><h2>我的隊伍</h2></header><TeamStrip members={data.playerTeam as TeamMember[]} /><p className="team-total">{(data.playerTeam as TeamMember[]).reduce((sum, member) => sum + (member.power || 0), 0).toLocaleString()} <small>已記錄戰力合計</small></p></article><div className="versus-mark">VS</div><article className="team-panel technical-frame opponent-panel"><header><span>02 / OPPONENT SIDE</span><h2>對手隊伍</h2></header><TeamStrip members={data.opponentTeam as TeamMember[]} tone="opponent" /><p className="team-total">{(data.opponentTeam as TeamMember[]).reduce((sum, member) => sum + (member.power || 0), 0).toLocaleString()} <small>已記錄戰力合計</small></p></article></section>
    {data.notes && <section className="notes-panel technical-frame"><header><Database size={16} /><h2>對戰備註</h2></header><p>{data.notes}</p></section>}
    {(hasUnrecognizedFields || hasRawPayload) && <section className="raw-panel technical-frame"><header><FileJson size={16} /><div><h2>保留的匯入資料</h2><p>未辨識欄位與原始資料僅供你回查，不會被系統用來推論戰績。</p></div></header>{hasUnrecognizedFields && <><h3>未辨識欄位</h3><pre>{unrecognizedFieldsJson}</pre></>}{hasRawPayload && <details><summary>查看完整原始紀錄</summary><pre>{rawPayloadJson}</pre></details>}</section>}
  </div>;
}
