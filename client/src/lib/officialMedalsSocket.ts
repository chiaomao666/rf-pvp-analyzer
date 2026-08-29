export type OfficialPlayerProfile = { externalUserId?: string; playerName?: string; unionName?: string };
export type MedalsSnapshot = { capturedAt: number; count: number; items: unknown[]; profile?: OfficialPlayerProfile };

const SOCKET_ENDPOINT = "wss://api.komisureiya.com/socket/websocket";
const SOCKET_VSN = "2.0.0";
const PROFILE_UPDATE_GRACE_MS = 3_000;

type PhoenixFrame = [string | null, string | null, string, string, unknown];

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function id(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return text(value);
}

function hasDisplayIdentity(profile?: OfficialPlayerProfile) {
  return Boolean(profile?.playerName || profile?.unionName);
}

function isPlayerTopic(actualTopic: string, userId: string) {
  return actualTopic === `player:${userId}` || actualTopic === "player:#";
}

type ObjectRecord = Record<string, unknown>;

function profileCandidates(value: unknown, depth = 0): ObjectRecord[] {
  const object = asObject(value);
  if (!object || depth > 4) return [];
  const result = [object];
  for (const key of ["profile", "player", "_player2", "_player", "user", "userProfile", "playerInfo", "player_data", "playerData", "preloads", "account", "data", "response", "payload"]) {
    const nested = object[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) result.push(...profileCandidates(nested, depth + 1));
  }
  return result;
}

function firstProfileValue(candidates: ObjectRecord[], keys: string[]): unknown {
  for (const candidate of candidates) {
    for (const key of keys) {
      if (candidate[key] !== undefined && candidate[key] !== null) return candidate[key];
    }
  }
  return undefined;
}

export function mergeOfficialProfiles(base?: OfficialPlayerProfile, next?: OfficialPlayerProfile, fallbackUserId?: string): OfficialPlayerProfile | undefined {
  const merged: OfficialPlayerProfile = {
    ...(base ?? {}),
    ...(next?.externalUserId ? { externalUserId: next.externalUserId } : {}),
    ...(next?.playerName ? { playerName: next.playerName } : {}),
    ...(next?.unionName ? { unionName: next.unionName } : {}),
  };
  if (!merged.externalUserId && fallbackUserId) merged.externalUserId = fallbackUserId;
  return merged.externalUserId || merged.playerName || merged.unionName ? merged : undefined;
}

export function extractProfileFromResponse(value: unknown, fallbackUserId?: string): OfficialPlayerProfile | undefined {
  const candidates = profileCandidates(value);
  if (!candidates.length) return fallbackUserId ? { externalUserId: fallbackUserId } : undefined;
  const unionValue = firstProfileValue(candidates, ["union", "union_name", "unionName", "organization", "organization_name", "organizationName", "guild", "guild_name", "guildName"]);
  const unionObject = asObject(unionValue);
  const profile: OfficialPlayerProfile = {
    externalUserId: id(firstProfileValue(candidates, ["player_id", "playerId", "user_id", "userId", "id"])) ?? fallbackUserId,
    playerName: text(firstProfileValue(candidates, ["nickname", "player_name", "playerName", "display_name", "displayName", "name"])),
    unionName: text(unionObject?.name ?? unionObject?.title ?? unionObject?.organization_name ?? unionObject?.union_name) ?? text(unionValue),
  };
  return profile.externalUserId || profile.playerName || profile.unionName ? profile : undefined;
}

export function extractOfficialProfileFromPhoenixUpdate(payload: unknown, fallbackUserId?: string): OfficialPlayerProfile | undefined {
  return extractProfileFromResponse(payload, fallbackUserId);
}

function copyMedals(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("player channel 未回傳可辨識的 medals 資料。");
  try {
    return JSON.parse(JSON.stringify(value)) as unknown[];
  } catch {
    throw new Error("medals 資料無法安全複製到本機工作區。");
  }
}

export function buildOfficialMedalsSocketUrl(userToken: string, locale = "zh_TW") {
  const url = new URL(SOCKET_ENDPOINT);
  url.searchParams.set("vsn", SOCKET_VSN);
  url.searchParams.set("userToken", userToken);
  url.searchParams.set("locale", locale);
  return url.toString();
}

export function parsePhoenixFrame(raw: string): PhoenixFrame | null {
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded) || decoded.length !== 5 || typeof decoded[2] !== "string" || typeof decoded[3] !== "string") return null;
    return [typeof decoded[0] === "string" ? decoded[0] : null, typeof decoded[1] === "string" ? decoded[1] : null, decoded[2], decoded[3], decoded[4]];
  } catch {
    return null;
  }
}

export function extractMedalsFromPhoenixReply(payload: unknown, capturedAt = Date.now(), fallbackUserId?: string): MedalsSnapshot {
  const reply = asObject(payload);
  if (reply?.status !== "ok") throw new Error("player channel 未接受 medals 查詢。 ");
  const response = asObject(reply.response);
  const items = copyMedals(response?.medals ?? asObject(response?.data)?.medals);
  const profile = extractProfileFromResponse(response, fallbackUserId);
  return profile ? { capturedAt, count: items.length, items, profile } : { capturedAt, count: items.length, items };
}

export function extractOfficialProfileFromPhoenixReply(payload: unknown, fallbackUserId?: string): OfficialPlayerProfile {
  const reply = asObject(payload);
  if (reply?.status !== "ok") throw new Error("player channel 未接受玩家資料查詢。 ");
  const profile = extractProfileFromResponse(reply.response, fallbackUserId);
  if (!profile) throw new Error("player channel 未回傳可辨識的玩家資料。 ");
  return profile;
}

export function requestOfficialMedals(userId: string, userToken: string, timeoutMs = 10_000): Promise<MedalsSnapshot> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(buildOfficialMedalsSocketUrl(userToken));
    const topic = `player:${userId}`;
    const joinRef = "rf-medals-join";
    const medalsRef = "rf-medals-request";
    const profileRef = "rf-profile-request";
    let complete = false;
    let joinedProfile: OfficialPlayerProfile | undefined;
    let delayedSnapshot: MedalsSnapshot | undefined;
    let profileGraceTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, result?: MedalsSnapshot) => {
      if (complete) return;
      complete = true;
      globalThis.clearTimeout(timer);
      if (profileGraceTimer) globalThis.clearTimeout(profileGraceTimer);
      try { socket.close(1000, "medals query complete"); } catch { /* Socket may already be closed. */ }
      if (error) reject(error); else if (result) resolve(result);
    };
    const timer = globalThis.setTimeout(() => finish(new Error("取得 medals 資料逾時；請確認網路、CORS 或 Cloudflare 連線狀態。")), timeoutMs);
    socket.onerror = () => finish(new Error("無法建立 player channel；這可能是瀏覽器 CORS、Cloudflare 或網路限制。"));
    socket.onopen = () => socket.send(JSON.stringify([joinRef, joinRef, topic, "phx_join", {}]));
    socket.onmessage = event => {
      if (typeof event.data !== "string") return;
      const frame = parsePhoenixFrame(event.data);
      if (!frame || !isPlayerTopic(frame[2], userId)) return;
      const [, ref, , eventName, payload] = frame;
      if (eventName === "update_data") {
        joinedProfile = mergeOfficialProfiles(joinedProfile, extractOfficialProfileFromPhoenixUpdate(payload, userId), userId);
        if (delayedSnapshot) {
          const profile = mergeOfficialProfiles(delayedSnapshot.profile, joinedProfile, userId);
          delayedSnapshot = profile ? { ...delayedSnapshot, profile } : delayedSnapshot;
          if (hasDisplayIdentity(profile)) finish(undefined, delayedSnapshot);
        }
        return;
      }
      if (eventName !== "phx_reply") return;
      if (ref === joinRef) {
        const joined = asObject(payload);
        if (joined?.status !== "ok") { finish(new Error("player channel 未接受本次登入狀態。")); return; }
        joinedProfile = mergeOfficialProfiles(joinedProfile, extractProfileFromResponse(joined.response, userId), userId);
        socket.send(JSON.stringify([joinRef, profileRef, topic, "profile", { user_id: userId }]));
        socket.send(JSON.stringify([joinRef, medalsRef, topic, "medals", {}]));
        return;
      }
      if (ref === profileRef) {
        try {
          joinedProfile = mergeOfficialProfiles(joinedProfile, extractOfficialProfileFromPhoenixReply(payload, userId), userId);
          if (delayedSnapshot && joinedProfile) {
            delayedSnapshot = { ...delayedSnapshot, profile: mergeOfficialProfiles(delayedSnapshot.profile, joinedProfile, userId) };
          }
        } catch {
          // 某些官方版本不回應明確 profile 事件，保留 update_data 作為 fallback。
        }
        return;
      }
      if (ref === medalsRef) {
        try {
          const snapshot = extractMedalsFromPhoenixReply(payload, Date.now(), userId);
          const profile = mergeOfficialProfiles(joinedProfile, snapshot.profile, userId);
          delayedSnapshot = profile ? { ...snapshot, profile } : snapshot;
          if (hasDisplayIdentity(profile)) {
            finish(undefined, delayedSnapshot);
          } else {
            profileGraceTimer = globalThis.setTimeout(() => finish(undefined, delayedSnapshot), PROFILE_UPDATE_GRACE_MS);
          }
        }
        catch (error) { finish(error instanceof Error ? error : new Error("medals 回應無法處理。")); }
      }
    };
  });
}

export function requestOfficialProfile(userId: string, userToken: string, timeoutMs = 10_000): Promise<OfficialPlayerProfile> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(buildOfficialMedalsSocketUrl(userToken));
    const topic = `player:${userId}`;
    const joinRef = "rf-profile-join";
    const profileRef = "rf-profile-request";
    let complete = false;
    let profile: OfficialPlayerProfile | undefined;
    const finish = (error?: Error, result?: OfficialPlayerProfile) => {
      if (complete) return;
      complete = true;
      globalThis.clearTimeout(timer);
      try { socket.close(1000, "profile query complete"); } catch { /* Socket may already be closed. */ }
      if (error) reject(error); else if (result) resolve(result);
    };
    const timer = globalThis.setTimeout(() => finish(new Error("取得玩家資料逾時。")), timeoutMs);
    socket.onerror = () => finish(new Error("無法建立 player channel 取得玩家資料。"));
    socket.onopen = () => socket.send(JSON.stringify([joinRef, joinRef, topic, "phx_join", {}]));
    socket.onmessage = event => {
      if (typeof event.data !== "string") return;
      const frame = parsePhoenixFrame(event.data);
      if (!frame || !isPlayerTopic(frame[2], userId)) return;
      if (frame[3] === "update_data") {
        profile = mergeOfficialProfiles(profile, extractOfficialProfileFromPhoenixUpdate(frame[4], userId), userId);
        if (profile?.playerName || profile?.unionName) finish(undefined, profile);
        return;
      }
      if (frame[3] !== "phx_reply") return;
      if (frame[1] === joinRef) {
        const joined = asObject(frame[4]);
        if (joined?.status !== "ok") { finish(new Error("player channel 未接受本次玩家資料查詢。")); return; }
        profile = mergeOfficialProfiles(profile, extractProfileFromResponse(joined.response, userId), userId);
        socket.send(JSON.stringify([joinRef, profileRef, topic, "profile", { user_id: userId }]));
        if (profile?.playerName || profile?.unionName) finish(undefined, profile);
        return;
      }
      if (frame[1] !== profileRef) return;
      try { finish(undefined, extractOfficialProfileFromPhoenixReply(frame[4], userId)); }
      catch (error) { finish(error instanceof Error ? error : new Error("玩家資料回應無法處理。")); }
    };
  });
}
