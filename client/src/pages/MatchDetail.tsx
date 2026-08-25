import { BlueprintTag, EmptyData, ModeBadge, OutcomeBadge, RankDelta, ScoreDelta, TeamStrip } from "@/components/PvpUi";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatLocalDateTime } from "@/lib/localTime";
import { deleteMatch, getMatch, type LocalPvpMatch } from "@/lib/localPvpStore";
import { getWorkspaceSession } from "@/lib/accountWorkspace";
import { ArrowLeft, Database, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

function extractIdentity(payload: unknown, keys: string[]): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const object = payload as Record<string, unknown>;
  for (const key of keys) if (typeof object[key] === "string" && object[key].trim()) return object[key].trim();
  for (const value of Object.values(object)) { const found = extractIdentity(value, keys); if (found) return found; }
  return undefined;
}

export default function MatchDetail({ id }: { id: number }) {
  const [, navigate] = useLocation(); const [data, setData] = useState<LocalPvpMatch | null | undefined>(undefined); const [dialog, setDialog] = useState(false); const [deleting, setDeleting] = useState(false);
  useEffect(() => { getMatch(id).then(setData); }, [id]);
  if (data === undefined) return <div className="loading-block">載入本機單場資料…</div>;
  if (!data) return <EmptyData title="找不到這筆戰績" description="這筆資料可能已被刪除，或不在目前瀏覽器的本機資料中。" action={<Link href="/matches"><Button className="blueprint-button secondary-button"><ArrowLeft size={16} />返回戰績歷史</Button></Link>} />;
  const remove = async () => { setDeleting(true); try { await deleteMatch(id); toast.success("已刪除這筆本機戰績。 "); navigate("/matches"); } finally { setDeleting(false); } };
  const ownProfile = getWorkspaceSession()?.profile;
  const opponentPlayer = data.opponentName || "未提供玩家名稱";
  const opponentUnion = data.opponentUnion || extractIdentity(data.rawPayload, ["opponent_union_name", "opponentUnionName", "opponent_guild_name", "opponentGuildName", "opponent_organization_name"]);
  const ownPlayer = data.playerName || ownProfile?.playerName || "目前工作區玩家";
  const ownUnion = data.playerUnion || ownProfile?.unionName || "未提供組織名稱";
  return <div className="page-enter detail-page"><section className="detail-topline"><Link href="/matches" className="back-link"><ArrowLeft size={15} />返回戰績歷史</Link><BlueprintTag>{data.rawPayload ? "IMPORTED RECORD" : "MANUAL RECORD"}</BlueprintTag></section><section className="detail-header technical-frame"><div><p className="eyebrow">LOCAL BATTLE RECORD / {String(data.id).padStart(5, "0")}</p><h1>{formatLocalDateTime(data.battleAt)}</h1><div className="detail-badges"><ModeBadge mode={data.mode} /><OutcomeBadge outcome={data.outcome} /></div></div><button className="danger-button" onClick={() => setDialog(true)}><Trash2 size={15} />刪除紀錄</button></section><section className="detail-stats"><div className="detail-stat"><span>賽前積分</span><b>{data.scoreBefore?.toLocaleString() ?? "—"}</b></div><div className="detail-stat"><span>賽後積分</span><b>{data.scoreAfter?.toLocaleString() ?? "—"}</b></div><div className="detail-stat"><span>積分變動</span><ScoreDelta before={data.scoreBefore} after={data.scoreAfter} /></div><div className="detail-stat"><span>賽前排名</span><b>{data.rankBefore ? `#${data.rankBefore}` : "—"}</b></div><div className="detail-stat"><span>賽後排名</span><b>{data.rankAfter ? `#${data.rankAfter}` : "—"}</b></div><div className="detail-stat"><span>排名變動</span><RankDelta before={data.rankBefore} after={data.rankAfter} /></div></section><section className="versus-grid"><article className="team-panel technical-frame"><header><span>01 / PLAYER SIDE</span><h2>我的隊伍</h2><p className="team-identity"><b>{ownPlayer}</b><small>{ownUnion}</small></p></header><TeamStrip members={data.playerTeam} /><p className="team-total">{data.playerTeam.reduce((sum, member) => sum + (member.power || 0), 0).toLocaleString()} <small>已記錄戰力合計</small></p></article><div className="versus-mark">VS</div><article className="team-panel technical-frame opponent-panel"><header><span>02 / OPPONENT SIDE</span><h2>對手隊伍</h2><p className="team-identity"><b>{opponentPlayer}</b><small>{opponentUnion || "未提供組織名稱"}</small></p></header><TeamStrip members={data.opponentTeam} tone="opponent" /><p className="team-total">{data.opponentTeam.reduce((sum, member) => sum + (member.power || 0), 0).toLocaleString()} <small>已記錄戰力合計</small></p></article></section>{data.notes && <section className="notes-panel technical-frame"><header><Database size={16} /><h2>對戰備註</h2></header><p>{data.notes}</p></section>}<AlertDialog open={dialog} onOpenChange={open => !open && !deleting && setDialog(false)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>刪除這筆戰績？</AlertDialogTitle><AlertDialogDescription>此操作無法復原，且只會移除目前瀏覽器的本機資料。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={event => { event.preventDefault(); void remove(); }}>{deleting ? "刪除中…" : "確認刪除"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}
