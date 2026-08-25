export type MedalsSnapshot = { capturedAt: number; count: number; items: unknown[] };

const SOCKET_ENDPOINT = "wss://api.komisureiya.com/socket/websocket";
const SOCKET_VSN = "2.0.0";

type PhoenixFrame = [string | null, string | null, string, string, unknown];

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
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

export function extractMedalsFromPhoenixReply(payload: unknown, capturedAt = Date.now()): MedalsSnapshot {
  const reply = asObject(payload);
  if (reply?.status !== "ok") throw new Error("player channel 未接受 medals 查詢。 ");
  const response = asObject(reply.response);
  const items = copyMedals(response?.medals);
  return { capturedAt, count: items.length, items };
}

export function requestOfficialMedals(userId: string, userToken: string, timeoutMs = 10_000): Promise<MedalsSnapshot> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(buildOfficialMedalsSocketUrl(userToken));
    const topic = `player:${userId}`;
    const joinRef = "rf-medals-join";
    const medalsRef = "rf-medals-request";
    let complete = false;
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
        socket.send(JSON.stringify([joinRef, medalsRef, topic, "medals", {}]));
        return;
      }
      if (ref === medalsRef) {
        try { finish(undefined, extractMedalsFromPhoenixReply(payload)); }
        catch (error) { finish(error instanceof Error ? error : new Error("medals 回應無法處理。")); }
      }
    };
  });
}
