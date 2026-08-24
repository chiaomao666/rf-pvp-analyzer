import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { ChevronDown, Database, LayoutDashboard, LogOut, PlusSquare, Shield, Upload } from "lucide-react";
import { Link, useLocation } from "wouter";

const navigation = [
  { href: "/", label: "總覽", icon: LayoutDashboard },
  { href: "/matches", label: "戰績歷史", icon: Database },
  { href: "/record", label: "新增紀錄", icon: PlusSquare },
  { href: "/import", label: "匯入資料", icon: Upload },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return <div className="app-loading"><div className="loading-grid" /><p>正在建立安全工作階段…</p></div>;
  }

  if (!user) {
    return (
      <div className="auth-shell">
        <div className="auth-grid" />
        <section className="auth-card technical-frame">
          <span className="auth-mark"><Shield size={24} /></span>
          <p className="eyebrow">RF / PVP INTELLIGENCE SYSTEM</p>
          <h1>每一場排名戰，
            <br />都留下可回查的資料軌跡。</h1>
          <p className="auth-copy">登入後才能建立及查看你的私有戰績資料。每個查詢與匯入操作皆以登入身分為資料邊界。</p>
          <Button onClick={() => startLogin()} className="blueprint-button primary-button">以 Manus 帳號安全登入</Button>
        </section>
      </div>
    );
  }

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
        <div className="account-zone">
          <span className="presence-dot" />
          <div className="account-copy"><b>{user.name || "已登入使用者"}</b><small>PRIVATE VAULT</small></div>
          <button className="logout-button" onClick={logout} title="登出"><LogOut size={16} /></button>
          <ChevronDown size={14} className="account-chevron" />
        </div>
      </header>
      <main className="workspace">{children}</main>
      <footer className="app-footer"><span>RF PVP ANALYZER</span><i /> <span>USER-SCOPED DATABASE</span><i /> <span>UTC TIMESTAMPS · LOCAL DISPLAY</span></footer>
    </div>
  );
}
