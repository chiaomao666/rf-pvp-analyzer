import { ChevronDown, Database, LayoutDashboard, PlusSquare, Shield, Upload } from "lucide-react";
import { getWorkspaceSession, restoreStoredWorkspace } from "@/lib/accountWorkspace";
import { getActiveProfileId } from "@/lib/localPvpStore";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

const navigation = [
  { href: "/", label: "總覽", icon: LayoutDashboard },
  { href: "/matches", label: "戰績歷史", icon: Database },
  { href: "/record", label: "新增紀錄", icon: PlusSquare },
  { href: "/import", label: "匯入資料", icon: Upload },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [session, setSession] = useState(getWorkspaceSession());

  useEffect(() => {
    void restoreStoredWorkspace(getActiveProfileId()).then(setSession);
    const listener = () => setSession(getWorkspaceSession());
    window.addEventListener("rf-pvp-account-change", listener);
    return () => window.removeEventListener("rf-pvp-account-change", listener);
  }, []);
  const accountLabel = session?.profile.kind === "demo" ? "示範模式" : session ? `帳號 #${session.profile.externalUserId ?? session.profile.id.replace("official:", "")}` : "帳號登入";

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand-lockup" aria-label="返回排名戰總覽">
          <span className="brand-mark"><Shield size={19} /></span>
          <span><strong>RF</strong><em>PVP ANALYZER</em></span>
        </Link>
        <nav className="topnav" aria-label="主要導覽">
          {navigation.map(item => {
            const active = item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} className={active ? "active" : ""}><Icon size={15} />{item.label}</Link>;
          })}
        </nav>
        <Link href="/account" className="account-zone" aria-label="開啟帳號工作區">
          <span className="presence-dot" />
          <div className="account-copy"><b>{accountLabel}</b><small>{session?.verifiedThisSession ? "VERIFIED THIS SESSION" : "LOCAL WORKSPACE"}</small></div>
          <ChevronDown size={14} className="account-chevron" />
        </Link>
      </header>
      <main className="workspace">{children}</main>
      <footer className="app-footer"><span>RF PVP ANALYZER</span><i /> <span>DEVICE-SCOPED DATABASE</span><i /> <span>UTC TIMESTAMPS · LOCAL DISPLAY</span></footer>
    </div>
  );
}
