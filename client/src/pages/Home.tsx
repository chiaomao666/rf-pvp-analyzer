import { EmptyData, MetricCard, ModeBadge, OutcomeBadge, RankDelta } from "@/components/PvpUi";
import { Button } from "@/components/ui/button";
import { formatLocalDateTime, formatLocalShortDate, formatLocalShortDateTime } from "@/lib/localTime";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, ChartNoAxesCombined, Clock3, Plus, TrendingUp, Upload } from "lucide-react";
import { Link } from "wouter";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function Home() {
  const dashboard = trpc.pvp.dashboard.useQuery();
  const data = dashboard.data;

  return (
    <div className="page-enter">
      <section className="page-titlebar">
        <div>
          <p className="eyebrow">OVERVIEW / INDIVIDUAL PVP ARCHIVE</p>
          <h1>排名戰總覽<span className="title-underscore">_</span></h1>
          <p>由你的私有戰績資料彙整；尚未新增或匯入的場次不會被估算。</p>
        </div>
        <div className="title-actions">
          <Link href="/import"><Button variant="outline" className="blueprint-button secondary-button"><Upload size={16} />匯入 JSON</Button></Link>
          <Link href="/record"><Button className="blueprint-button primary-button"><Plus size={16} />新增對戰</Button></Link>
        </div>
      </section>

      <section className="metrics-grid" aria-label="戰績關鍵指標">
        <MetricCard label="累計場次" value={dashboard.isLoading ? "—" : data?.total ?? 0} detail="所有已保存的 1v1 與 3v3 場次" accent="cyan" />
        <MetricCard label="可判定勝率" value={dashboard.isLoading || data?.winRate == null ? "—" : `${data.winRate}%`} detail="僅以勝利與敗北場次計算" accent="lime" />
        <MetricCard label="目前排名" value={dashboard.isLoading ? "—" : data?.currentRank ? `#${data.currentRank}` : "—"} detail="最後一筆含賽後排名的紀錄" accent="violet" />
        <MetricCard label="勝／敗" value={dashboard.isLoading ? "—" : `${data?.wins ?? 0} / ${data?.losses ?? 0}`} detail="未知或平手不納入勝率" accent="orange" />
      </section>

      {!dashboard.isLoading && data?.total === 0 ? (
        <EmptyData title="資料庫尚未建立第一筆戰績" description="可手動新增單場資料，或貼上 PVP 守衛腳本匯出的 JSON。未被辨識的欄位會原樣保存並在匯入結果中提示。" action={<div className="empty-actions"><Link href="/record"><Button className="blueprint-button primary-button"><Plus size={16} />新增第一場</Button></Link><Link href="/import"><Button variant="outline" className="blueprint-button secondary-button"><Upload size={16} />匯入 JSON</Button></Link></div>} />
      ) : (
        <section className="overview-grid">
          <article className="chart-card technical-frame">
            <header className="panel-header"><div><p className="panel-kicker">RANKING TRAJECTORY</p><h2><ChartNoAxesCombined size={18} />排名軌跡</h2></div><span className="panel-index">01</span></header>
            {data && data.rankSeries.length > 0 ? (
              <div className="rank-chart">
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={data.rankSeries} margin={{ top: 18, right: 18, left: -12, bottom: 8 }}>
                    <CartesianGrid stroke="rgba(143, 220, 255, .13)" vertical={false} />
                    <XAxis dataKey="battleAt" tickFormatter={value => formatLocalShortDate(Number(value))} stroke="#7fa2cc" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis dataKey="rank" reversed stroke="#7fa2cc" tickLine={false} axisLine={false} fontSize={11} width={40} />
                    <Tooltip contentStyle={{ background: "#071a3c", border: "1px solid #3979bd", borderRadius: 0, color: "#e8f4ff" }} labelFormatter={value => formatLocalDateTime(Number(value))} formatter={(value: number) => [`#${value}`, "排名"]} />
                    <Line type="monotone" dataKey="rank" stroke="#70e5ff" strokeWidth={2.5} dot={{ r: 3, fill: "#071a3c", stroke: "#70e5ff", strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="chart-empty"><TrendingUp size={22} /><p>尚無含賽後排名的連續資料。</p></div>}
          </article>

          <article className="recent-card technical-frame">
            <header className="panel-header"><div><p className="panel-kicker">LATEST ENTRIES</p><h2><Clock3 size={18} />近期戰績</h2></div><Link href="/matches" className="text-link">查看全部 <ArrowUpRight size={15} /></Link></header>
            <div className="recent-list">
              {data?.recent.map(match => (
                <Link href={`/matches/${match.id}`} key={match.id} className="recent-row">
                  <span className="recent-time">{formatLocalShortDateTime(match.battleAt)}</span>
                  <ModeBadge mode={match.mode} />
                  <OutcomeBadge outcome={match.outcome} />
                  <span className="recent-opponent">{match.opponentName || "未標記對手"}</span>
                  <RankDelta before={match.rankBefore} after={match.rankAfter} />
                </Link>
              ))}
              {!data?.recent.length && <p className="no-recent">沒有可顯示的近期資料。</p>}
            </div>
          </article>
        </section>
      )}
    </div>
  );
}
