import { ChevronDown, Database, LayoutDashboard, PlusSquare, Shield, UserRound } from "lucide-react";
import { getWorkspaceSession, restoreStoredWorkspace } from "@/lib/accountWorkspace";
import { getActiveProfileId } from "@/lib/localPvpStore";
import BuildStatusFooter from "@/components/BuildStatusFooter";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

const navigation = [
  { href: "/", label: "總覽", icon: LayoutDashboard },
  { href: "/matches", label: "戰績歷史", icon: Database },
  { href: "/record", label: "新增紀錄", icon: PlusSquare },
];

function profileLabel(session: ReturnType<typeof getWorkspaceSession>) {
  if (!session) return "選擇工作區";
  if (session.profile.kind === "demo") return "示範模式";
  return session.profile.playerName || "遊戲玩家工作區";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [session, setSession] = useState(getWorkspaceSession());
  useEffect(() => {
    void restoreStoredWorkspace(getActiveProfileId()).then(setSession);
    const listener = () => setSession(getWorkspaceSession());
    window.addEventListener("rf-pvp-account-change", listener);
    return () => window.removeEventListener("rf-pvp-account-change", listener);
  }, []);
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand-lockup" aria-label="返回排名戰總覽"><span className="brand-mark"><Shield size={19} /></span><span><strong>RF</strong><em>PVP ANALYZER</em></span></Link>
        <nav className="topnav" aria-label="主要導覽">
          {navigation.map(item => { const active = item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`); const Icon = item.icon; return <Link key={item.href} href={item.href} className={active ? "active" : ""}><Icon size={15} />{item.label}</Link>; })}
          <Link href="/account" className={location.startsWith("/account") ? "active workspace-nav-link" : "workspace-nav-link"}><UserRound size={15} />帳號工作區</Link>
        </nav>
        <Link href="/account" className="account-zone" aria-label="開啟帳號工作區"><span className="presence-dot" /><div className="account-copy"><b>{profileLabel(session)}</b><small>{session?.profile.unionName || (session?.verifiedThisSession ? "VERIFIED THIS SESSION" : "LOCAL WORKSPACE")}</small></div><ChevronDown size={14} className="account-chevron" /></Link>
      </header>
      <main className="workspace">{children}</main>
      <BuildStatusFooter />
    </div>
  );
}
