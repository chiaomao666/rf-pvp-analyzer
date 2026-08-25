import { activateStoredWorkspace, createDemoWorkspace, getWorkspaceSession, loginOfficialAccount, logoutWorkspace, OfficialLoginError, refreshOfficialMedals, restoreStoredWorkspace } from "@/lib/accountWorkspace";
import { countUnscopedData, getActiveProfileId, listProfiles, LocalProfile, migrateUnscopedDataToProfile } from "@/lib/localPvpStore";
import { CheckCircle2, Database, Eye, EyeOff, KeyRound, LogIn, LogOut, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type Status = { tone: "success" | "error" | "info"; text: string } | null;

function profileLabel(profile: LocalProfile) { return profile.kind === "demo" ? "示範模式工作區" : `遊戲帳號 #${profile.externalUserId ?? profile.id.replace("official:", "")}`; }

export default function Account() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [session, setSession] = useState(getWorkspaceSession());
  const [profiles, setProfiles] = useState<LocalProfile[]>([]);
  const [unscoped, setUnscoped] = useState({ matches: 0, imports: 0 });

  const refresh = async () => {
    const [storedProfiles, legacy] = await Promise.all([listProfiles(), countUnscopedData()]);
    setProfiles(storedProfiles); setUnscoped(legacy); setSession(getWorkspaceSession());
  };
  useEffect(() => {
    void restoreStoredWorkspace(getActiveProfileId()).then(refresh);
    const listener = () => { void refresh(); };
    window.addEventListener("rf-pvp-account-change", listener);
    return () => window.removeEventListener("rf-pvp-account-change", listener);
  }, []);

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!riskAccepted) { setStatus({ tone: "error", text: "請先閱讀並確認帳號安全、隱私與服務條款風險。" }); return; }
    setBusy(true); setStatus(null);
    try {
      const active = await loginOfficialAccount(account, password);
      setPassword(""); setAccount(""); setShowPassword(false); setSession(active); await refresh();
      try {
        const refreshed = await refreshOfficialMedals();
        setSession(refreshed); await refresh();
        setStatus({ tone: "success", text: `已確認帳號存在並切換至 ${profileLabel(refreshed.profile)}；本次僅讀取並保存 ${refreshed.profile.medalsSnapshot?.count ?? 0} 枚 medals。密碼與登入 token 未寫入本機儲存。` });
      } catch (medalsError) {
        setStatus({ tone: "info", text: `已確認帳號存在並切換至 ${profileLabel(active.profile)}，但 medals 尚未取得：${medalsError instanceof Error ? medalsError.message : "連線未完成。"} 密碼與登入 token 未寫入本機儲存。` });
      }
    } catch (error) {
      setPassword("");
      const text = error instanceof OfficialLoginError ? error.message : "登入流程未完成，請稍後再試。";
      setStatus({ tone: "error", text });
    } finally { setBusy(false); }
  };

  const onRefreshMedals = async () => {
    setBusy(true); setStatus(null);
    try {
      const refreshed = await refreshOfficialMedals();
      setSession(refreshed); await refresh();
      setStatus({ tone: "success", text: `已更新此帳號的 medals 快照：${refreshed.profile.medalsSnapshot?.count ?? 0} 枚。查詢過程只送出 player channel 加入與 medals 事件。` });
    } catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : "無法取得 medals 資料。" }); }
    finally { setBusy(false); }
  };

  const onDemo = async () => {
    setBusy(true); setStatus(null);
    try { const active = await createDemoWorkspace(); setSession(active); await refresh(); setStatus({ tone: "info", text: "已開啟示範模式工作區。此模式不會對遊戲伺服器送出帳號或密碼。" }); }
    finally { setBusy(false); }
  };

  const onActivate = async (profileId: string) => {
    setBusy(true); setStatus(null);
    try { const active = await activateStoredWorkspace(profileId); setSession(active); await refresh(); setStatus({ tone: "info", text: `已切換至 ${profileLabel(active.profile)}。這是本機工作區選取，不代表本次重新驗證。` }); }
    catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : "無法切換帳號工作區。" }); }
    finally { setBusy(false); }
  };

  const onMigrate = async () => {
    if (!session) return;
    setBusy(true); setStatus(null);
    try {
      const result = await migrateUnscopedDataToProfile(session.profile.id);
      await refresh(); setStatus({ tone: "success", text: `已將既有未綁定資料轉移到 ${profileLabel(session.profile)}：${result.matches} 筆戰績、${result.imports} 筆匯入歷程。` });
    } catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : "無法轉移既有資料。" }); }
    finally { setBusy(false); }
  };

  return <div className="account-page">
    <section className="page-titlebar account-titlebar">
      <div><p className="eyebrow">OFFICIAL ACCOUNT CHECK / MEDALS ONLY</p><h1>帳號工作區</h1><p>以官方回傳的帳號 ID 分隔本機戰績。登入後可從 player channel 唯讀取得 `medals`；排名戰歷史仍請透過守衛 JSON 或手動建立資料。</p></div>
      <div className="workspace-chip"><Database size={15} /><span>{session ? profileLabel(session.profile) : "尚未選取工作區"}</span></div>
    </section>

    {status && <div className={`account-status ${status.tone}`} role="status"><CheckCircle2 size={17} /><span>{status.text}</span></div>}

    <div className="account-grid">
      <section className="panel account-login-panel">
        <header><span><KeyRound size={17} /></span><div><p className="eyebrow">OFFICIAL ACCOUNT CHECK</p><h2>登入並確認帳號</h2><p>登入成功後只保留官方 `user_id` 作為此瀏覽器的工作區鍵。</p></div></header>
        <form className="account-form" onSubmit={onLogin}>
          <label><span>遊戲帳號</span><input autoComplete="username" value={account} onChange={event => setAccount(event.target.value)} placeholder="遊戲帳號或登入 Email" disabled={busy} /></label>
          <label><span>密碼</span><span className="password-field"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="僅用於本次登入請求" disabled={busy} /><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} disabled={busy} aria-label={showPassword ? "隱藏密碼" : "顯示密碼"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}<span>{showPassword ? "隱藏" : "顯示"}</span></button></span></label>
          <label className="risk-check"><input type="checkbox" checked={riskAccepted} onChange={event => setRiskAccepted(event.target.checked)} disabled={busy} /><span>我已閱讀下方風險說明，並自行承擔使用第三方工具的風險。</span></label>
          <div className="account-actions"><button className="primary-action" type="submit" disabled={busy || !riskAccepted}><LogIn size={16} />{busy ? "連線中…" : "登入並建立工作區"}</button><button className="secondary-action" type="button" onClick={onDemo} disabled={busy}><WifiOff size={16} />示範模式</button></div>
        </form>
      </section>

      <aside className="panel workspace-panel">
        <header><span><Database size={17} /></span><div><p className="eyebrow">CURRENT LOCAL SCOPE</p><h2>目前工作區</h2><p>工作區資料只保存在目前瀏覽器，與其他裝置或網站 origin 不共用。</p></div></header>
        {session ? <div className="current-workspace"><b>{profileLabel(session.profile)}</b><small>{session.verifiedThisSession ? "本次已由官方登入流程確認" : "已選取的本機工作區；未於本次重新驗證"}</small><code>{session.profile.id}</code>{session.profile.medalsSnapshot && <div className="medals-snapshot"><b>MEDALS SNAPSHOT</b><span>{session.profile.medalsSnapshot.count} 枚 medals · {new Date(session.profile.medalsSnapshot.capturedAt).toLocaleString()}</span><small>本機只保留 player channel 回應中的 `medals` 陣列；不保留排名、積分或其他回應欄位。</small></div>}{session.verifiedThisSession && session.profile.kind === "official" && <button className="secondary-action medals-refresh" type="button" disabled={busy} onClick={() => void onRefreshMedals()}><RefreshCw size={14} />重新取得 medals</button>}<button className="text-action" type="button" disabled={busy} onClick={() => { logoutWorkspace(); setStatus({ tone: "info", text: "已登出本次登入狀態；本機工作區資料未刪除。" }); }}><LogOut size={14} />登出並取消選取</button></div> : <div className="empty-workspace"><ShieldAlert size={20} /><p>請登入、選取已存工作區，或開啟示範模式後再建立與匯入戰績。</p></div>}
        {profiles.length > 0 && <div className="profile-list"><p className="micro-label">此瀏覽器已知工作區</p>{profiles.map(profile => <button className={session?.profile.id === profile.id ? "profile-select selected" : "profile-select"} key={profile.id} onClick={() => void onActivate(profile.id)} disabled={busy}><span>{profileLabel(profile)}</span><small>{profile.lastVerifiedAt ? "曾經登入確認" : "本機示範"}</small></button>)}</div>}
      </aside>
    </div>

    {session && (unscoped.matches || unscoped.imports) > 0 && <section className="panel migration-panel"><div><p className="eyebrow">ONE-TIME LEGACY MIGRATION</p><h2>發現未綁定的既有資料</h2><p>本機仍有 <b>{unscoped.matches}</b> 筆戰績及 <b>{unscoped.imports}</b> 筆匯入歷程尚未屬於任何帳號。為避免誤綁，不會自動轉移。確認後會全部指派到目前的 <b>{profileLabel(session.profile)}</b>；此動作不會刪除資料。</p></div><button className="primary-action" type="button" onClick={() => void onMigrate()} disabled={busy}>確認轉移既有資料</button></section>}

    <section className="panel account-warning-panel"><header><span><ShieldAlert size={17} /></span><div><p className="eyebrow">READ BEFORE LOGIN</p><h2>重要安全與技術說明</h2></div></header><div className="warning-grid"><div><h3>帳號安全與隱私</h3><p><b>帳號安全風險：</b>在第三方網站輸入密碼可能導致帳號被盜。</p><p><b>隱私風險：</b>您的遊戲資料將在瀏覽器中處理。</p><p><b>ToS 風險：</b>使用非官方工具可能違反遊戲服務條款。</p><p>本網站不會儲存您的密碼，也不會將登入 token 寫入 IndexedDB、localStorage、備份檔或 GitHub；但仍請自行評估風險。</p></div><div><h3>瀏覽器 CORS 限制</h3><p>瀏覽器安全限制、Cloudflare 或網路環境可能使直接連線遊戲伺服器失敗。連線失敗不必然表示帳號或密碼錯誤。</p><p>若失敗，您可以使用「示範模式」檢視功能；或在自行理解風險下，透過瀏覽器開發者工具或官方允許的本地代理測試連線。</p><p>登入後的唯讀查詢只會加入 player channel 並呼叫 `medals`，本機也只保存回應中的 `medals` 陣列，不保存排名、積分或其他 player 回應欄位。</p></div></div></section>
  </div>;
}
