import { describe, expect, it } from "vitest";
import { createPvpBackend, normalizePvpCapture } from "./pvpBackend.mjs";

const team = (prefix) => Array.from({ length: 5 }, (_, index) => ({ name: `${prefix}-${index + 1}`, level: 60, secret: "drop" }));
const capture = (workspaceId = "832459") => ({
  type: "match",
  workspaceId,
  data: {
    battleAt: 1_700_000_000_000,
    mode: "5v5",
    outcome: "win",
    playerTeam: team("P"),
    opponentTeam: team("O"),
    sourceBattleChannel: "pvp_battle:abc",
    password: "must-not-survive",
    rawFrame: { token: "must-not-survive" },
  },
});

describe("pvp backend capture contract", () => {
  it("normalizes a minimal 5v5 capture and strips unknown fields", () => {
    const result = normalizePvpCapture(capture());
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ workspaceId: "832459", mode: "5v5", outcome: "win" });
    expect(result.data).not.toHaveProperty("password");
    expect(result.data).not.toHaveProperty("rawFrame");
    expect(result.data.playerTeam).toHaveLength(5);
  });

  it("deduplicates by workspace and source battle identity", () => {
    const backend = createPvpBackend();
    expect(backend.capture(capture()).status).toBe(202);
    expect(backend.capture(capture()).body.duplicate).toBe(true);
    expect(backend.list(0, "832459").events).toHaveLength(1);
  });

  it("keeps workspaces isolated when listing events", () => {
    const backend = createPvpBackend();
    expect(backend.capture(capture("a")).status).toBe(202);
    expect(backend.capture(capture("b")).status).toBe(202);
    expect(backend.list(0, "a").events).toHaveLength(1);
    expect(backend.list(0, "a").events[0].data.workspaceId).toBe("a");
  });

  it("rejects incomplete 5v5 data", () => {
    const value = capture();
    value.data.opponentTeam = team("O").slice(0, 4);
    expect(normalizePvpCapture(value)).toEqual({ ok: false, error: "5v5 必須包含雙方各 5 名成員" });
  });
});
