import { getProfile, LocalProfile, setActiveProfileId, upsertProfile } from "./localPvpStore";

const LOGIN_ENDPOINT = "https://api.komisureiya.com/api/users/log_in";
const OFFICIAL_APP_VERSION = "2.28";
// 這是官方瀏覽器主程式已公開的相容設定，不是使用者憑證或可持久化 token。
const OFFICIAL_PUBLIC_CLIENT_KEY = "t9cTpsbSCYcJgsrrC";

export type WorkspaceSession = { profile: LocalProfile; verifiedThisSession: boolean };
export type LoginFailureKind = "credentials" | "network" | "cors-or-cloudflare" | "server" | "malformed-response";

export class OfficialLoginError extends Error {
  constructor(public kind: LoginFailureKind, message: string) { super(message); this.name = "OfficialLoginError"; }
}

let session: WorkspaceSession | null = null;

function notify() { if (typeof window !== "undefined") window.dispatchEvent(new Event("rf-pvp-account-change")); }
function asObject(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function id(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : null; }

export function getWorkspaceSession() { return session; }
export async function restoreStoredWorkspace(profileId: string | null) {
  if (!profileId) { session = null; notify(); return null; }
  const profile = await getProfile(profileId);
  session = profile ? { profile, verifiedThisSession: false } : null;
  if (!profile) setActiveProfileId(null);
  notify();
  return session;
}
export async function activateStoredWorkspace(profileId: string) {
  const profile = await getProfile(profileId);
  if (!profile) throw new Error("找不到此裝置上的帳號工作區。 ");
  setActiveProfileId(profile.id); session = { profile, verifiedThisSession: false }; notify(); return session;
}
export function logoutWorkspace() { session = null; setActiveProfileId(null); notify(); }

export async function createDemoWorkspace() {
  const profile: LocalProfile = { id: "demo:local", kind: "demo", createdAt: Date.now() };
  await upsertProfile(profile); setActiveProfileId(profile.id); session = { profile, verifiedThisSession: false }; notify(); return session;
}

export async function loginOfficialAccount(account: string, password: string) {
  const normalizedAccount = account.trim();
  if (!normalizedAccount || !password) throw new OfficialLoginError("credentials", "請同時輸入遊戲帳號與密碼。 ");
  const body = new URLSearchParams({
    "user[email]": normalizedAccount,
    "user[password]": password,
    locale: "zh_TW",
    app_version: OFFICIAL_APP_VERSION,
    key: OFFICIAL_PUBLIC_CLIENT_KEY,
  });
  let response: Response;
  try {
    response = await fetch(LOGIN_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json" }, body: body.toString() });
  } catch {
    throw new OfficialLoginError("cors-or-cloudflare", "無法連線至遊戲伺服器。這可能是瀏覽器 CORS、Cloudflare 或網路連線限制，而不代表帳號或密碼錯誤。 ");
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new OfficialLoginError("malformed-response", `伺服器回傳了無法辨識的內容（HTTP ${response.status}）。請稍後再試。`); }
  const result = asObject(payload); const data = asObject(result?.data);
  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) throw new OfficialLoginError("credentials", "登入未獲接受。請確認帳號與密碼；若瀏覽器顯示 Cloudflare 攔截，請改用示範模式或官方允許的本地代理。 ");
    throw new OfficialLoginError("server", `遊戲伺服器暫時無法完成登入（HTTP ${response.status}）。這不代表帳號不存在。`);
  }
  const userId = result?.status === "ok" ? id(data?.user_id) : null;
  if (!userId) throw new OfficialLoginError("credentials", "遊戲伺服器未確認此帳號。請確認帳號與密碼，或稍後再試。 ");
  const now = Date.now(); const profile: LocalProfile = { id: `official:${userId}`, externalUserId: userId, kind: "official", createdAt: (await getProfile(`official:${userId}`))?.createdAt ?? now, lastVerifiedAt: now };
  await upsertProfile(profile); setActiveProfileId(profile.id); session = { profile, verifiedThisSession: true }; notify();
  return session;
}
