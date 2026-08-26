import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const readTool = (name: string) => readFileSync(new URL(`./TOOLS/${name}`, import.meta.url), "utf8");

describe("approved PVP mod bridge contract", () => {
  it("loads the self-contained PVP guard without a separate bridge client", () => {
    const loader = read("rf_mod_loader.js");
    const guard = read("pvp_double_match_guard.js");
    expect(loader).not.toContain('src: "./mods/rf_bridge_client.js"');
    expect(loader).not.toContain("全局記憶體優化器");
    expect(loader).toContain('src: "./mods/TOOLS/rf_pvp_backend_config.js"');
    expect(loader.indexOf('src: "./mods/TOOLS/rf_pvp_backend_config.js"')).toBeLessThan(loader.indexOf('src: "./mods/pvp_double_match_guard.js"'));
    expect(loader).toContain('src: "./mods/pvp_double_match_guard.js"');
    expect(guard).toContain("installEmbeddedBridgeClient");
    expect(guard).toContain('body: JSON.stringify(requestBody)');
    expect(guard).toContain('BRIDGE_HEARTBEAT_MS = 30_000');
    expect(guard).toContain('getHealthEndpoint');
    expect(guard).toContain('getStatus');
    expect(guard).toContain('consecutiveFailures');
    expect(guard).toContain('BRIDGE_MAX_RETRY_MS');
    expect(guard).not.toContain('setInterval');
    expect(guard).toContain('window.RF_PVP_BACKEND_ENDPOINT');
    expect(guard).toContain('X-RF-API-Key');
    expect(guard).toContain('workspaceId: String(record.sourcePlayerUserId');
  });

  it("provides a configurable Worker endpoint without embedding a real credential", () => {
    const config = readTool("rf_pvp_backend_config.js");
    expect(config).toContain("/api/pvp/capture");
    expect(config).toContain("PASTE_YOUR_PVP_API_KEY_HERE");
    expect(config).not.toMatch(/sk_live|Bearer\s+[A-Za-z0-9._-]{20,}/i);
  });

  it("only forwards records after official player medals evidence", () => {
    const guard = read("pvp_double_match_guard.js");
    expect(guard).toContain('record.resultEvidence !== "official_player_medals"');
    expect(guard).toContain('window.RFLocalBridge?.sendMatch');
    expect(guard).toContain('text.includes("5v5")');
    expect(guard).toContain('asObject(response?.["5v5"])');
    expect(guard).toContain('asObject(nestedMedals?.["5v5"])');
  });

  it("captures AniDoor player and union identities and forwards the fields", () => {
    const guard = read("pvp_double_match_guard.js");
    expect(guard).toContain("AniDoor_leftTitle1_");
    expect(guard).toContain("AniDoor_leftTitle2_");
    expect(guard).toContain("AniDoor_rightTitle1_");
    expect(guard).toContain("AniDoor_rightTitle2_");
    expect(guard).toContain("playerUnion");
    expect(guard).toContain("opponentUnion");
    expect(guard).toContain("installAniDoorCapture");
    expect(guard).toContain("identitySignature");
  });

  it("accepts current player medals even when previous_record is absent", () => {
    const guard = read("pvp_double_match_guard.js");
    expect(guard).toContain("const hasCurrentResult = hasTopLevelMode || hasNestedMode;");
    expect(guard).toContain("|| !hasCurrentResult) return null;");
    expect(guard).toContain("extractMedalsMetrics");
  });

  it("retains active battle frames beyond the rolling archive for late result replies", () => {
    const guard = read("pvp_double_match_guard.js");
    expect(guard).toContain("ACTIVE_BATTLE_EVENT_LIMIT = 96");
    expect(guard).toContain("ACTIVE_BATTLE_TTL_MS = 10 * 60 * 1000");
    expect(guard).toContain("activeBattleEvents");
    expect(guard).toContain("analyzerEventPool");
    expect(guard).toContain("uniqueAnalyzerRecords(analyzerEventPool(events))");
  });

  it("keeps credentials and raw frames out of the embedded bridge client", () => {
    const guard = read("pvp_double_match_guard.js");
    const embeddedClient = guard.slice(guard.indexOf("function installEmbeddedBridgeClient"), guard.indexOf("const MOD_NAME"));
    expect(embeddedClient).toContain('type: "match"');
    expect(embeddedClient).not.toMatch(/password|user_token|authorization|cookie|rawEvent|rawFrame|rawEvents/i);
  });
});
