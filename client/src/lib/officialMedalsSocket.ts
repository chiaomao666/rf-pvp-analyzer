export type OfficialPlayerProfile = { externalUserId?: string; playerName?: string; unionName?: string };
export type MedalsSnapshot = { capturedAt: number; count: number; items: unknown[]; profile?: OfficialPlayerProfile };

const SOCKET_ENDPOINT = "wss://api.komisureiya.com/socket/websocket";
const SOCKET_VSN = "2.0.0";

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

function extractProfileFromResponse(value: unknown, fallbackUserId?: string): OfficialPlayerProfile | undefined {
  const response = asObject(value);
  const nested = asObject(response?.profile) ?? asObject(response?.user) ?? response;
  if (!nested) return fallbackUserId ? { externalUserId: fallbackUserId } : undefined;
  const unionValue = nested.union ?? nested.union_name ?? nested.unionName ?? nested.organization ?? nested.organization_name ?? nested.organizationName ?? nested.guild ?? nested.guild_name;
  const unionObject = asObject(unionValue);
  const profile: OfficialPlayerProfile = {
    externalUserId: id(nested.id ?? nested.user_id ?? nested.userId) ?? fallbackUserId,
    playerName: text(nested.nickname ?? nested.player_name ?? nested.playerName ?? nested.display_name ?? nested.name),
    unionName: text(unionObject?.name ?? unionObject?.title) ?? text(unionValue),
  };
  return profile.externalUserId || profile.playerName || profile.unionName ? profile : undefined;
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
  const items = copyMedals(response?.medals);
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
    let complete = false;
    let joinedProfile: OfficialPlayerProfile | undefined;
    const finish = (error?: Error, result?: MedalsSnapshot) => {
      if (complete) return;
      complete = true;
      globalThis.clearTimeout(timer);
      try { socket.close(1000, "medals query complete"); } catch { /* Socket may already be closed. */ }
      if (error) reject(error); else if (result) resolve(result);
    };
    const timer = globalThis.setTimeout(() => finish(new Error("取得 medals 資料逾時；請確認網路、CORS 或 Cloudflare 連線狀態。")), timeoutMs);
    socket.onerror = () => finish(new Error("無法建立 player channel；這可能是瀏覽器 CORS、Cloudflare 或網路限制。"));
    socket.onopen = () => socket.send(JSON.stringify([joinRef, joinRef, topic, "phx_join", {}]));
    socket.onmessage = event => {
      if (typeof event.data !== "string") return;
      const frame = parsePhoenixFrame(event.data);
      if (!frame || frame[2] !== topic || frame[3] !== "phx_reply") return;
      const [, ref, , , payload] = frame;
      if (ref === joinRef) {
        const joined = asObject(payload);
        if (joined?.status !== "ok") { finish(new Error("player channel 未接受本次登入狀態。")); return; }
        joinedProfile = extractProfileFromResponse(joined.response, userId);
        socket.send(JSON.stringify([joinRef, medalsRef, topic, "medals", {}]));
        return;
      }
      if (ref === medalsRef) {
        try {
          const snapshot = extractMedalsFromPhoenixReply(payload, Date.now(), userId);
          const profile = snapshot.profile || joinedProfile
            ? {
                ...joinedProfile,
                ...(snapshot.profile?.externalUserId ? { externalUserId: snapshot.profile.externalUserId } : {}),
                ...(snapshot.profile?.playerName ? { playerName: snapshot.profile.playerName } : {}),
                ...(snapshot.profile?.unionName ? { unionName: snapshot.profile.unionName } : {}),
                externalUserId: snapshot.profile?.externalUserId ?? joinedProfile?.externalUserId ?? userId,
              }
            : undefined;
          finish(undefined, profile ? { ...snapshot, profile } : snapshot);
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
    let complete = false;
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
      if (!frame || frame[2] !== topic || frame[3] !== "phx_reply" || frame[1] !== joinRef) return;
      try { finish(undefined, extractOfficialProfileFromPhoenixReply(frame[4], userId)); }
      catch (error) { finish(error instanceof Error ? error : new Error("玩家資料回應無法處理。")); }
    };
  });
}
