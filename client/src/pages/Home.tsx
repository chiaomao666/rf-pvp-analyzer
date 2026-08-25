import { EmptyData, MetricCard, ModeBadge, OutcomeBadge, RankDelta, ScoreDelta } from "@/components/PvpUi";
import { Button } from "@/components/ui/button";
import { formatLocalDateTime, formatLocalShortDate, formatLocalShortDateTime } from "@/lib/localTime";
import { dashboard, getActiveProfileId, getProfile, type LocalProfile } from "@/lib/localPvpStore";
import { ArrowUpRight, ChartNoAxesCombined, Clock3, Plus, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DashboardData = Awaited<ReturnType<typeof dashboard>>;

function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const refresh = () => { setLoading(true); dashboard().then(setData).finally(() => setLoading(false)); };
    refresh(); window.addEventListener("rf-pvp-store-change", refresh);
    return () => window.removeEventListener("rf-pvp-store-change", refresh);
  }, []);
  return { data, loading };
}

function useWorkspaceProfile() {
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  useEffect(() => {
    const refresh = () => { const id = getActiveProfileId(); if (!id) { setProfile(null); return; } void getProfile(id).then(value => setProfile(value ?? null)); };
    refresh(); window.addEventListener("rf-pvp-account-change", refresh);
    return () => window.removeEventListener("rf-pvp-account-change", refresh);
  }, []);
  return profile;
}

export default function Home() {
  const { data, loading } = useDashboard();
  const profile = useWorkspaceProfile();
  const workspaceName = profile?.kind === "demo" ? "示範模式工作區" : profile ? `遊戲帳號 #${profile.externalUserId ?? profile.id.replace("official:", "")}` : null;
  const emptyAction = !profile ? <Link href="/account"><Button className="blueprint-button primary-button">前往帳號工作區</Button></Link> : <Link href="/record"><Button className="blueprint-button primary-button"><Plus size={16} />新增第一場</Button></Link>;

  return <div className="page-enter">
    <section className="page-titlebar">
      <div>
        <p className="eyebrow">OVERVIEW / ACCOUNT-SCOPED LOCAL ARCHIVE</p>
        <h1>排名戰總覽<span className="title-underscore">_</span></h1>
        <p>{workspaceName ? `正在檢視 ${workspaceName} 的本機戰績；PVP 守衛收到的資料會自動同步。` : "尚未選取帳號工作區；此頁不會顯示或建立未歸屬戰績。"}</p>
      </div>
      <div className="title-actions">
        {!profile && <Link href="/account"><Button variant="outline" className="blueprint-button secondary-button">帳號工作區</Button></Link>}

        <Link href="/record"><Button className="blueprint-button primary-button"><Plus size={16} />新增對戰</Button></Link>
      </div>
    </section>
    <section className="metrics-grid" aria-label="戰績關鍵指標">
      <MetricCard label="累計場次" value={loading ? "—" : data?.total ?? 0} detail="目前帳號工作區的 1v1 與 3v3 場次" accent="cyan" />
      <MetricCard label="可判定勝率" value={loading || data?.winRate == null ? "—" : `${data.winRate}%`} detail="僅以勝利與敗北場次計算" accent="lime" />
      <MetricCard label="目前積分" value={loading ? "—" : data?.currentScore?.toLocaleString() ?? "—"} detail="最後一筆含賽後積分的紀錄" accent="cyan" />
      <MetricCard label="目前排名" value={loading ? "—" : data?.currentRank ? `#${data.currentRank}` : "—"} detail="最後一筆含賽後排名的紀錄" accent="violet" />
      <MetricCard label="勝／敗" value={loading ? "—" : `${data?.wins ?? 0} / ${data?.losses ?? 0}`} detail="未知或平手不納入勝率" accent="orange" />
    </section>
    {!loading && data?.total === 0 ? <EmptyData title={profile ? "此帳號工作區尚未建立第一筆戰績" : "請先選取帳號工作區"} description={profile ? "可手動新增單場資料；PVP 守衛收到的戰績會自動同步到此帳號工作區。" : "登入確認遊戲帳號、選取既有本機工作區，或使用示範模式後，才能建立戰績。"} action={emptyAction} /> : <section className="overview-grid">
      <article className="chart-card technical-frame">
        <header className="panel-header"><div><p className="panel-kicker">RANKING TRAJECTORY</p><h2><ChartNoAxesCombined size={18} />排名軌跡</h2></div><span className="panel-index">01</span></header>
        {data && data.rankSeries.length > 0 ? <div className="rank-chart"><ResponsiveContainer width="100%" height={250}><LineChart data={data.rankSeries} margin={{ top: 18, right: 18, left: -12, bottom: 8 }}><CartesianGrid stroke="rgba(143, 220, 255, .13)" vertical={false} /><XAxis dataKey="battleAt" tickFormatter={value => formatLocalShortDate(Number(value))} stroke="#7fa2cc" tickLine={false} axisLine={false} fontSize={11} /><YAxis dataKey="rank" reversed stroke="#7fa2cc" tickLine={false} axisLine={false} fontSize={11} width={40} /><Tooltip contentStyle={{ background: "#071a3c", border: "1px solid #3979bd", borderRadius: 0, color: "#e8f4ff" }} labelFormatter={value => formatLocalDateTime(Number(value))} formatter={(value: number) => [`#${value}`, "排名"]} /><Line type="monotone" dataKey="rank" stroke="#70e5ff" strokeWidth={2.5} dot={{ r: 3, fill: "#071a3c", stroke: "#70e5ff", strokeWidth: 2 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div> : <div className="chart-empty"><TrendingUp size={22} /><p>尚無含賽後排名的連續資料。</p></div>}
      </article>
      <article className="recent-card technical-frame">
        <header className="panel-header"><div><p className="panel-kicker">LATEST ENTRIES</p><h2><Clock3 size={18} />近期戰績</h2></div><Link href="/matches" className="text-link">查看全部 <ArrowUpRight size={15} /></Link></header>
        <div className="recent-list">{data?.recent.map(match => <Link href={`/matches/${match.id}`} key={match.id} className="recent-row"><span className="recent-time">{formatLocalShortDateTime(match.battleAt)}</span><ModeBadge mode={match.mode} /><OutcomeBadge outcome={match.outcome} /><span className="recent-opponent">{match.opponentName || "未標記對手"}</span><ScoreDelta before={match.scoreBefore} after={match.scoreAfter} /><RankDelta before={match.rankBefore} after={match.rankAfter} /></Link>)}{!data?.recent.length && <p className="no-recent">沒有可顯示的近期資料。</p>}</div>
      </article>
    </section>}
  </div>;
}
