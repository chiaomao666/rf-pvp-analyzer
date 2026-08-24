import { ChevronDown, Database, LayoutDashboard, PlusSquare, Shield, Upload } from "lucide-react";
import { Link, useLocation } from "wouter";

const navigation = [
  { href: "/", label: "總覽", icon: LayoutDashboard },
  { href: "/matches", label: "戰績歷史", icon: Database },
  { href: "/record", label: "新增紀錄", icon: PlusSquare },
  { href: "/import", label: "匯入資料", icon: Upload },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

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
          <div className="account-copy"><b>本機私有資料</b><small>THIS BROWSER ONLY</small></div>
          <ChevronDown size={14} className="account-chevron" />
        </div>
      </header>
      <main className="workspace">{children}</main>
      <footer className="app-footer"><span>RF PVP ANALYZER</span><i /> <span>DEVICE-SCOPED DATABASE</span><i /> <span>UTC TIMESTAMPS · LOCAL DISPLAY</span></footer>
    </div>
  );
}
