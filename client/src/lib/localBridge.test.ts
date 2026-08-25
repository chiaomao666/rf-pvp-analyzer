import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLocalBridge, localBridgeOrigin, pollLocalBridge } from "./localBridge";

afterEach(() => vi.unstubAllGlobals());

describe("local bridge client", () => {
  it("uses loopback origin and polls after a cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [{ id: 4, capturedAt: 1, type: "match", data: { battleAt: 1 } }, { id: 5, capturedAt: 2, type: "noise", data: {} }], latestEventId: 5, queueSize: 2 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await pollLocalBridge(3);
    expect(localBridgeOrigin()).toBe("http://127.0.0.1:8787");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/events?after=3");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.id).toBe(4);
  });

  it("accepts only a healthy bridge response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, queueSize: 7, latestEventId: 12 }), { status: 200 })));
    await expect(checkLocalBridge()).resolves.toMatchObject({ ok: true, queueSize: 7 });
  });

  it("surfaces a bridge HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 503 })));
    await expect(checkLocalBridge()).rejects.toThrow("bridge health HTTP 503");
  });
});

it("uses the remote backend health endpoint when remote mode is selected", async () => {
  const localStorage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => localStorage.get(key) ?? null,
      setItem: (key: string, value: string) => localStorage.set(key, value),
    },
    dispatchEvent: vi.fn(),
  });
  localStorage.set("rf-pvp-bridge-mode", "remote");
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, queueSize: 2, latestEventId: 8 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(checkLocalBridge()).resolves.toMatchObject({ ok: true, latestEventId: 8 });
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://rfpvpanlyz-wgxynphd.manus.space/api/pvp/health");
});

it("polls the remote backend by the active bare official workspace id", async () => {
  const localStorage = new Map<string, string>([
    ["rf-pvp-bridge-mode", "remote"],
    ["rf-pvp-active-profile-id", "official:832459"],
  ]);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => localStorage.get(key) ?? null,
      setItem: (key: string, value: string) => localStorage.set(key, value),
    },
    dispatchEvent: vi.fn(),
  });
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [], latestEventId: 12, queueSize: 1 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await pollLocalBridge(9);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://rfpvpanlyz-wgxynphd.manus.space/api/pvp/events?workspaceId=832459&after=9");
});
