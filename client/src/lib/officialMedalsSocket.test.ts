import { describe, expect, it, vi } from "vitest";
import { buildOfficialMedalsSocketUrl, extractMedalsFromPhoenixReply, extractProfileFromResponse, mergeOfficialProfiles, parsePhoenixFrame, requestOfficialMedals } from "./officialMedalsSocket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  send(payload: string) { this.sent.push(payload); }
  close() { /* No-op in a unit test. */ }
  open() { this.onopen?.(); }
  message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
}

describe("official medals socket", () => {
  it("建立包含登入當次 token 與 locale 的官方 Phoenix WebSocket URL", () => {
    const url = new URL(buildOfficialMedalsSocketUrl("memory-only-token", "zh_TW"));
    expect(url.protocol).toBe("wss:");
    expect(url.pathname).toBe("/socket/websocket");
    expect(url.searchParams.get("vsn")).toBe("2.0.0");
    expect(url.searchParams.get("userToken")).toBe("memory-only-token");
    expect(url.searchParams.get("locale")).toBe("zh_TW");
  });

  it("只從成功的 Phoenix medals 回覆抽取 medals 陣列", () => {
    const frame = parsePhoenixFrame(JSON.stringify(["join", "medals", "player:918", "phx_reply", { status: "ok", response: { medals: [{ medal_id: 3 }, { medal_id: 8 }], score: 6520, rank: 789 } }]));
    expect(frame).not.toBeNull();
    const snapshot = extractMedalsFromPhoenixReply(frame?.[4], 1_700_000_000_000);
    expect(snapshot).toEqual({ capturedAt: 1_700_000_000_000, count: 2, items: [{ medal_id: 3 }, { medal_id: 8 }] });
    expect(JSON.stringify(snapshot)).not.toContain("6520");
    expect(JSON.stringify(snapshot)).not.toContain("789");
  });

  it("拒絕沒有 medals 陣列或非成功的 player channel 回覆", () => {
    expect(() => extractMedalsFromPhoenixReply({ status: "error", response: { medals: [] } })).toThrow("未接受");
    expect(() => extractMedalsFromPhoenixReply({ status: "ok", response: { rank: 12 } })).toThrow("medals");
    expect(parsePhoenixFrame("not-json")).toBeNull();
  });

  it("能從巢狀 profile 與 organization 解析玩家名稱、聯盟與 ID", () => {
    const profile = extractProfileFromResponse({ data: { profile: { user_id: 832459, nickname: "俏貓紅蝶天紋斬", organization: { name: "RF聯盟" } } } });
    expect(profile).toEqual({ externalUserId: "832459", playerName: "俏貓紅蝶天紋斬", unionName: "RF聯盟" });
    expect(mergeOfficialProfiles({ externalUserId: "832459" }, profile)).toEqual(profile);
  });

  it("medals 先到、profile 後到且 topic 被診斷遮罩時仍會合併身份", async () => {
    FakeWebSocket.instances = [];
    const originalWebSocket = globalThis.WebSocket;
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: FakeWebSocket });
    try {
      const pending = requestOfficialMedals("918", "memory-only-token", 500);
      const socket = FakeWebSocket.instances[0];
      socket.open();
      socket.message(["join", "rf-medals-join", "player:918", "phx_reply", { status: "ok", response: { id: 918 } }]);
      socket.message(["join", "rf-medals-request", "player:918", "phx_reply", { status: "ok", response: { medals: [{ medal_id: 4 }] } }]);
      socket.message(["join", null, "player:#", "update_data", { profile: { nickname: "俏貓紅蝶天紋斬", organization: { name: "RF聯盟" } } }]);
      await expect(pending).resolves.toMatchObject({ profile: { externalUserId: "918", playerName: "俏貓紅蝶天紋斬", unionName: "RF聯盟" } });
    } finally {
      vi.useRealTimers();
      Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: originalWebSocket });
    }
  });

  it("只加入 player channel 並發送 medals，快照不保留同回覆的其他欄位", async () => {
    FakeWebSocket.instances = [];
    const originalWebSocket = globalThis.WebSocket;
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: FakeWebSocket });
    try {
      const pending = requestOfficialMedals("918", "memory-only-token", 500);
      const socket = FakeWebSocket.instances[0];
      socket.open();
      expect(socket.sent.map(entry => JSON.parse(entry)[3])).toEqual(["phx_join"]);
      socket.message(["rf-medals-join", "rf-medals-join", "player:918", "phx_reply", { status: "ok", response: { id: 918 } }]);
      socket.message(["rf-medals-join", null, "player:918", "update_data", { profile: { nickname: "俏貓紅蝶天紋斬", organization: { name: "RF聯盟" } } }]);
      expect(socket.sent.map(entry => JSON.parse(entry)[3])).toEqual(["phx_join", "medals"]);
      socket.message(["rf-medals-join", "rf-medals-request", "player:918", "phx_reply", { status: "ok", response: { medals: [{ medal_id: 4 }], score: 6520, rank: 789, Union: { id: 12 } } }]);
      await expect(pending).resolves.toMatchObject({ count: 1, items: [{ medal_id: 4 }], profile: { externalUserId: "918", playerName: "俏貓紅蝶天紋斬", unionName: "RF聯盟" } });
    } finally {
      Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: originalWebSocket });
    }
  });
});
