import { describe, expect, it, vi } from "vitest";
import worker from "./index.mjs";

function env() {
  const state = { credential: null };
  const prepare = vi.fn((sql) => {
    let values = [];
    return {
      bind(...next) { values = next; return this; },
      first: vi.fn(async () => {
        if (sql === "SELECT password_salt, password_verifier, revision FROM pvp_site_credentials WHERE id = 1") return state.credential;
        if (sql === "SELECT 1 AS ok") return { ok: 1 };
        return { ok: 1 };
      }),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn(async () => {
        if (sql.startsWith("INSERT INTO pvp_site_credentials")) {
          const [password_salt, password_verifier, revision, updated_at] = values;
          state.credential = { password_salt, password_verifier, revision, updated_at };
        }
        return { meta: { last_row_id: 1 } };
      }),
    };
  });
  return {
    PVP_SITE_PASSWORD: "site-password",
    PVP_SESSION_SECRET: "session-secret-for-tests",
    PVP_WRITE_SECRET: "write-secret",
    PVP_ADMIN_PASSWORD: "admin-password",
    ALLOWED_ORIGINS: "https://chiaomao666.github.io",
    DB: { prepare },
    __state: state,
  };
}

function request(path, init = {}) {
  return new Request(`https://worker.example${path}`, {
    ...init,
    headers: { Origin: "https://chiaomao666.github.io", ...(init.headers || {}) },
  });
}

async function login(current, password = "site-password") {
  const response = await worker.fetch(request("/api/pvp/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }), current);
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie");
}

function changePassword(current, cookie, body) {
  return worker.fetch(request("/api/pvp/password", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) }), current);
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

  it("authenticates the legacy Cloudflare site password and returns an HttpOnly session", async () => {
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

  it("returns a generic service error when the legacy login configuration is missing", async () => {
    const withoutSessionSecret = env(); delete withoutSessionSecret.PVP_SESSION_SECRET;
    const response = await worker.fetch(request("/api/pvp/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "site-password" }) }), withoutSessionSecret);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "authentication configuration unavailable" });
  });

  it("keeps an incorrect password distinct from a missing login secret", async () => {
    const response = await worker.fetch(request("/api/pvp/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "wrong-password" }) }), env());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("rejects unauthenticated password changes without reading credentials", async () => {
    const current = env();
    const response = await worker.fetch(request("/api/pvp/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminPassword: "admin-password", currentPassword: "site-password", newPassword: "new-password-123" }) }), current);
    expect(response.status).toBe(401);
    expect(current.__state.credential).toBeNull();
  });

  it("requires a configured admin password before any authenticated change", async () => {
    const current = env(); delete current.PVP_ADMIN_PASSWORD;
    const cookie = await login(current);
    const response = await changePassword(current, cookie, { adminPassword: "admin-password", currentPassword: "site-password", newPassword: "new-password-123" });
    expect(response.status).toBe(503);
    expect(current.__state.credential).toBeNull();
  });

  it("requires both the management password and current site password", async () => {
    const current = env();
    const cookie = await login(current);
    const wrongAdmin = await changePassword(current, cookie, { adminPassword: "wrong", currentPassword: "site-password", newPassword: "new-password-123" });
    expect(wrongAdmin.status).toBe(401);
    const wrongCurrent = await changePassword(current, cookie, { adminPassword: "admin-password", currentPassword: "wrong", newPassword: "new-password-123" });
    expect(wrongCurrent.status).toBe(401);
    expect(current.__state.credential).toBeNull();
  });

  it("stores a salted verifier, switches login to D1, and invalidates earlier sessions", async () => {
    const current = env();
    const oldCookie = await login(current);
    const response = await changePassword(current, oldCookie, { adminPassword: "admin-password", currentPassword: "site-password", newPassword: "new-password-123" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ updated: true });
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(current.__state.credential).toMatchObject({ revision: 1 });
    expect(current.__state.credential.password_salt).not.toContain("new-password-123");
    expect(current.__state.credential.password_verifier).not.toContain("new-password-123");

    const expired = await worker.fetch(request("/api/pvp/session", { headers: { Cookie: oldCookie } }), current);
    expect(expired.status).toBe(401);
    const oldLogin = await worker.fetch(request("/api/pvp/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "site-password" }) }), current);
    expect(oldLogin.status).toBe(401);
    const newCookie = await login(current, "new-password-123");
    const active = await worker.fetch(request("/api/pvp/session", { headers: { Cookie: newCookie } }), current);
    expect(active.status).toBe(200);
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
