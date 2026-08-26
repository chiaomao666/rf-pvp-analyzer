import { describe, expect, it, vi } from "vitest";
import worker from "./index.mjs";

function env() {
  return {
    PVP_API_KEY: "test-secret",
    ALLOWED_ORIGINS: "https://chiaomao666.github.io",
    DB: { prepare: vi.fn(() => ({ first: vi.fn().mockResolvedValue({ ok: 1 }) })) },
  };
}

function request(path, init = {}) {
  return new Request(`https://worker.example${path}`, {
    ...init,
    headers: { Origin: "https://chiaomao666.github.io", ...(init.headers || {}) },
  });
}

describe("PVP Worker security boundary", () => {
  it("fails closed when the API key is missing", async () => {
    const current = env();
    const health = await worker.fetch(request("/api/pvp/health"), current);
    const events = await worker.fetch(request("/api/pvp/events?workspaceId=123"), current);
    const capture = await worker.fetch(request("/api/pvp/capture", { method: "POST", body: "{}" }), current);
    expect(health.status).toBe(401);
    expect(events.status).toBe(401);
    expect(capture.status).toBe(401);
    expect(current.DB.prepare).not.toHaveBeenCalled();
  });

  it("accepts the key and keeps health response minimal", async () => {
    const current = env();
    const response = await worker.fetch(request("/api/pvp/health", { headers: { "X-RF-API-Key": "test-secret" } }), current);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, durable: true });
  });

  it("does not allow an unlisted browser origin", async () => {
    const current = env();
    const response = await worker.fetch(new Request("https://worker.example/api/pvp/health", { headers: { Origin: "https://evil.example", "X-RF-API-Key": "test-secret" } }), current);
    expect(response.headers.get("access-control-allow-origin")).toBe("null");
  });
});
