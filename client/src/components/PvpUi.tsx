import { cn } from "@/lib/utils";
import { Crosshair, Minus, Plus, ShieldCheck, Swords } from "lucide-react";

export type TeamMember = {
  name: string;
  level?: number;
  power?: number;
  role?: string;
  rarity?: string;
};

export function BlueprintTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("blueprint-tag", className)}>{children}</span>;
}

export function OutcomeBadge({ outcome }: { outcome: "win" | "loss" | "draw" | "unknown" }) {
  const labels = { win: "勝利", loss: "敗北", draw: "平手", unknown: "待確認" };
  return <span className={cn("outcome-badge", `outcome-${outcome}`)}>{labels[outcome]}</span>;
}

export function ModeBadge({ mode }: { mode: "1v1" | "3v3" | "5v5" }) {
  return <span className="mode-badge"><Swords size={12} strokeWidth={1.8} /> {mode}</span>;
}

export function RankDelta({ before, after }: { before: number | null | undefined; after: number | null | undefined }) {
  if (!before || !after) return <span className="rank-delta muted">—</span>;
  const delta = before - after;
  const label = delta === 0 ? "持平" : delta > 0 ? `↑ ${delta}` : `↓ ${Math.abs(delta)}`;
  return <span className={cn("rank-delta", delta > 0 ? "improved" : delta < 0 ? "declined" : "muted")}>{label}</span>;
}

export function ScoreDelta({ before, after }: { before: number | null | undefined; after: number | null | undefined }) {
  if (before === undefined || before === null || after === undefined || after === null) return <span className="score-delta muted">—</span>;
  const delta = after - before;
  const label = delta === 0 ? "持平" : delta > 0 ? `＋${delta.toLocaleString()}` : `−${Math.abs(delta).toLocaleString()}`;
  return <span className={cn("score-delta", delta > 0 ? "improved" : delta < 0 ? "declined" : "muted")}>{label}</span>;
}

export function TeamStrip({ members, tone = "player" }: { members: TeamMember[]; tone?: "player" | "opponent" }) {
  return (
    <div className={cn("team-strip", `team-${tone}`)}>
      {members.map((member, index) => (
        <div className="team-member" key={`${member.name}-${index}`}>
          <span className="member-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="member-name">{member.name}</span>
          <span className="member-meta">
            {member.level ? `Lv.${member.level}` : "—"}
            {member.power !== undefined ? ` · ${member.power.toLocaleString()}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EmptyData({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <section className="empty-data technical-frame">
      <div className="empty-icon"><Crosshair size={22} /></div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

export function MetricCard({ label, value, detail, accent = "cyan" }: { label: string; value: React.ReactNode; detail: string; accent?: "cyan" | "lime" | "violet" | "orange" }) {
  return (
    <section className={cn("metric-card technical-frame", `accent-${accent}`)}>
      <p className="metric-label"><span className="metric-dot" />{label}</p>
      <strong className="metric-value">{value}</strong>
      <p className="metric-detail">{detail}</p>
    </section>
  );
}

export function TimelineMarker() {
  return <span className="timeline-marker" aria-hidden="true"><ShieldCheck size={12} /></span>;
}

export function CountStepper({ value, onChange, min = 1, max = 3 }: { value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <div className="count-stepper" aria-label="隊伍人數">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="減少角色"><Minus size={14} /></button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="增加角色"><Plus size={14} /></button>
    </div>
  );
}
