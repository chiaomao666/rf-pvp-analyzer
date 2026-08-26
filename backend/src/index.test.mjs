import { describe, expect, it, vi } from "vitest";
import worker from "./index.mjs";

function env() {
  return {
    PVP_SITE_PASSWORD: "site-password",
    PVP_SESSION_SECRET: "session-secret-for-tests",
    PVP_WRITE_SECRET: "write-secret",
    ALLOWED_ORIGINS: "https://chiaomao666.github.io",
    DB: { prepare: vi.fn(() => ({ first: vi.fn().mockResolvedValue({ ok: 1 }), all: vi.fn().mockResolvedValue({ results: [] }), bind: vi.fn(function () { return this; }), run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1 } }) })) },
  };
}

function request(path, init = {}) {
  return new Request(`https://worker.example${path}`, {
    ...init,
    headers: { Origin: "https://chiaomao666.github.io", ...(init.headers || {}) },
  });
}

async function login(current) {
  const response = await worker.fetch(request("/api/pvp/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "site-password" }) }), current);
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie");
}

describe("PVP Worker security boundary", () => {
  it("fails closed without a site session or write secret", async () => {
    const current = env();
    const health = await worker.fetch(request("/api/pvp/health"), current);
    const session = await worker.fetch(request("/api/pvp/session"), current);
    const events = await worker.fetch(request("/api/pvp/events?workspaceId=123"), current);
    const capture = await worker.fetch(request("/api/pvp/capture", { method: "POST", body: "{}" }), current);
    expect(health.status).toBe(401);
    expect(session.status).toBe(401);
    expect(events.status).toBe(401);
    expect(capture.status).toBe(401);
    expect(current.DB.prepare).not.toHaveBeenCalled();
  });

  it("authenticates the site password and returns an HttpOnly session", async () => {
    const current = env();
    const response = await worker.fetch(request("/api/pvp/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "site-password" }) }), current);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/rf_pvp_session=.*HttpOnly/);
    expect(response.headers.get("set-cookie")).toMatch(/Secure/);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=None/);
    expect(response.headers.get("set-cookie")).toMatch(/Partitioned/);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://chiaomao666.github.io");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("clears the same partitioned cookie on logout", async () => {
    const current = env();
    const response = await worker.fetch(request("/api/pvp/logout", { method: "POST" }), current);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=None/);
    expect(response.headers.get("set-cookie")).toMatch(/Partitioned/);
  });

  it("accepts a valid site session and keeps health response minimal", async () => {
    const current = env();
    const cookie = await login(current);
    const response = await worker.fetch(request("/api/pvp/health", { headers: { Cookie: cookie } }), current);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, durable: true });
  });

  it("allows a write-authorized mod to probe minimal health without a site session", async () => {
    const current = env();
    const response = await worker.fetch(request("/api/pvp/health", { headers: { "X-RF-Write-Secret": "write-secret" } }), current);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, durable: true });
  });

  it("does not allow an unlisted browser origin", async () => {
    const current = env();
    const response = await worker.fetch(new Request("https://worker.example/api/pvp/session", { headers: { Origin: "https://evil.example" } }), current);
    expect(response.headers.get("access-control-allow-origin")).toBe("null");
  });
});
