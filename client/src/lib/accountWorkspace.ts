import { getProfile, LocalProfile, setActiveProfileId, upsertProfile } from "./localPvpStore";
import { extractProfileFromResponse, mergeOfficialProfiles, requestOfficialMedals } from "./officialMedalsSocket";

const LOGIN_ENDPOINT = "https://api.komisureiya.com/api/users/log_in";
const OFFICIAL_APP_VERSION = "2.28";
const LOGIN_TIMEOUT_MS = 12_000;
// 這是官方瀏覽器主程式已公開的相容設定，不是使用者憑證或可持久化 token。
const OFFICIAL_PUBLIC_CLIENT_KEY = "t9cTpsbSCYcJgsrrC";

export type WorkspaceSession = { profile: LocalProfile; verifiedThisSession: boolean };
export type LoginFailureKind = "credentials" | "network" | "cors-or-cloudflare" | "server" | "malformed-response";

export class OfficialLoginError extends Error {
  constructor(public kind: LoginFailureKind, message: string) { super(message); this.name = "OfficialLoginError"; }
}

let session: WorkspaceSession | null = null;
let memoryOnlyUserToken: string | null = null;

function notify() { if (typeof window !== "undefined") window.dispatchEvent(new Event("rf-pvp-account-change")); }
function asObject(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function id(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : null; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function identity(data: Record<string, unknown> | null, keys: string[]) { for (const key of keys) { const value = text(data?.[key]); if (value) return value; } return null; }

export function getWorkspaceSession() { return session; }
export async function restoreStoredWorkspace(profileId: string | null) {
  memoryOnlyUserToken = null;
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
  memoryOnlyUserToken = null; setActiveProfileId(profile.id); session = { profile, verifiedThisSession: false }; notify(); return session;
}
export function logoutWorkspace() { memoryOnlyUserToken = null; session = null; setActiveProfileId(null); notify(); }

export async function createDemoWorkspace() {
  memoryOnlyUserToken = null;
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
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
  try {
    response = await fetch(LOGIN_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json" }, body: body.toString(), signal: controller.signal });
  } catch {
    const timeoutMessage = controller.signal.aborted
      ? "登入連線已在 12 秒後停止。這不是帳號或密碼判定；可能是官方伺服器、Cloudflare 或網路未回應。"
      : "登入 API 未允許目前 GitHub Pages 網域的跨來源連線，或被 Cloudflare／網路攔截。這不是帳號或密碼錯誤。請使用示範模式，或請官方將目前網站網域加入 CORS 允許清單；也可在自行管理的本機代理環境測試。";
    throw new OfficialLoginError("cors-or-cloudflare", timeoutMessage);
  } finally {
    globalThis.clearTimeout(timeoutId);
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
  const now = Date.now();
  const previous = await getProfile(`official:${userId}`);
  // 官方 login response 的身份欄位可能位於 data、user 或 response 等巢狀節點；不可只讀 data。
  const loginProfile = extractProfileFromResponse(payload, userId);
  const identityProfile = mergeOfficialProfiles(
    { externalUserId: userId, ...(previous?.playerName ? { playerName: previous.playerName } : {}), ...(previous?.unionName ? { unionName: previous.unionName } : {}) },
    loginProfile,
    userId,
  );
  const profile: LocalProfile = {
    id: `official:${userId}`,
    externalUserId: userId,
    kind: "official",
    createdAt: previous?.createdAt ?? now,
    lastVerifiedAt: now,
    ...(previous?.medalsSnapshot ? { medalsSnapshot: previous.medalsSnapshot } : {}),
    ...(identityProfile?.playerName ? { playerName: identityProfile.playerName } : {}),
    ...(identityProfile?.unionName ? { unionName: identityProfile.unionName } : {}),
  };
  await upsertProfile(profile); setActiveProfileId(profile.id); memoryOnlyUserToken = typeof data?.user_token === "string" && data.user_token ? data.user_token : null; session = { profile, verifiedThisSession: true }; notify();
  return session;
}

export async function refreshOfficialMedals() {
  if (!session?.verifiedThisSession || session.profile.kind !== "official" || !session.profile.externalUserId || !memoryOnlyUserToken) {
    throw new Error("請先在本次工作階段完成官方登入，才能取得 medals 資料。重新整理或切換工作區後需要重新登入。");
  }
  const medalsSnapshot = await requestOfficialMedals(session.profile.externalUserId, memoryOnlyUserToken);
  const { profile: snapshotProfile, ...medalsOnlySnapshot } = medalsSnapshot;
  const identityProfile = mergeOfficialProfiles(session.profile, snapshotProfile, session.profile.externalUserId);
  const profile: LocalProfile = {
    ...session.profile,
    medalsSnapshot: medalsOnlySnapshot,
    ...(identityProfile?.externalUserId ? { externalUserId: identityProfile.externalUserId } : {}),
    ...(identityProfile?.playerName ? { playerName: identityProfile.playerName } : {}),
    ...(identityProfile?.unionName ? { unionName: identityProfile.unionName } : {}),
  };
  await upsertProfile(profile);
  session = { profile, verifiedThisSession: true };
  notify();
  return session;
}
