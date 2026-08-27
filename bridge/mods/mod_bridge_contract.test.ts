import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const readMod = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

describe("approved PVP mod bridge contract", () => {
  it("loads the self-contained PVP guard without a separate bridge client", () => {
    const loader = read("rf_mod_loader.js");
    const guard = read("pvp_double_match_guard.js");
    expect(loader).not.toContain('src: "./mods/rf_bridge_client.js"');
    expect(loader).not.toContain("全局記憶體優化器");
    expect(loader).toContain('src: "./mods/rf_pvp_backend_config.js"');
    expect(loader.indexOf('src: "./mods/rf_pvp_backend_config.js"')).toBeLessThan(loader.indexOf('src: "./mods/pvp_double_match_guard.js"'));
    expect(loader).toContain('src: "./mods/pvp_double_match_guard.js"');
    expect(loader).toContain('async function loadEnabledTools()');
    expect(loader).toContain('await injectScript(tool)');
    expect(loader).toContain('const pvpPriorityIds = new Set');
    expect(guard).toContain("installEmbeddedBridgeClient");
    expect(guard).toContain('body: JSON.stringify(requestBody)');
    expect(guard).toContain('BRIDGE_HEARTBEAT_MS = 30_000');
    expect(guard).toContain('getHealthEndpoint');
    expect(guard).toContain('getStatus');
    expect(guard).toContain('consecutiveFailures');
    expect(guard).toContain('BRIDGE_MAX_RETRY_MS');
    expect(guard).not.toContain('setInterval');
    expect(guard).toContain('window.RF_PVP_BACKEND_ENDPOINT');
    expect(guard).toContain('X-RF-Write-Secret');
    expect(guard).toContain('headers: getWriteHeaders()');
    expect(guard).toContain('設定檔未載入或載入順序錯誤');
    expect(guard).toContain('設定檔已載入，但密鑰是空白或 placeholder');
    expect(guard).toContain('PVP_WRITE_SECRET not configured');
    expect(guard).toContain('writeSecretState: bridge.writeSecretState || "未知"');
    expect(guard).toContain('bridge: getSafeBridgeDiagnostics()');
    expect(guard).toContain('workspaceId: String(record.sourcePlayerUserId');
  });

  it("provides a one-time configurable Worker endpoint without embedding a real credential", () => {
    const config = readMod("rf_pvp_backend_config.example.js");
    const guard = read("pvp_double_match_guard.js");
    expect(config).toContain("/api/pvp/capture");
    expect(config).toContain("PASTE_YOUR_PVP_WRITE_SECRET_HERE");
    expect(config).toContain("__RF_PVP_CONSUME_BACKEND_CONFIG__");
    expect(config).not.toContain("window.RF_PVP_WRITE_SECRET =");
    expect(config).not.toMatch(/sk_live|Bearer\s+[A-Za-z0-9._-]{20,}/i);
    expect(guard).toContain("takePvpBackendConfig");
    expect(guard).toContain("delete window.__RF_PVP_CONSUME_BACKEND_CONFIG__");
    expect(guard).toContain("delete window.RF_PVP_WRITE_SECRET");
    expect(guard).toContain("const CONFIGURED_WRITE_SECRET = STARTUP_BRIDGE_CONFIG.writeSecret");
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
    expect(guard).toContain("battleIdentityByChannel");
    expect(guard).toContain("rememberBattleIdentity(currentBattleChannel)");
    expect(guard).toContain("identityForBattle(record.sourceBattleChannel)");
    expect(guard).toContain('root.querySelectorAll("*")');
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

  it("removes the obsolete JSON export button and renames sync diagnostics", () => {
    const guard = read("pvp_double_match_guard.js");
    expect(guard).not.toContain("rf-pvp-export-btn");
    expect(guard).not.toContain("下載分析站 JSON");
    expect(guard).not.toContain("downloadAnalyzerExport");
    expect(guard).toContain("複製同步診斷");
  });

  it("bounds the local archive and excludes raw frames from persisted events", () => {
    const guard = read("pvp_double_match_guard.js");
    expect(guard).toContain("MAX_ARCHIVE_CHARS = 1_500_000");
    expect(guard).toContain("function compactArchivePayload");
    expect(guard).toContain("function writeEventArchive");
    expect(guard).not.toContain("rawFrame: rawFrame === undefined");
  });

  it("keeps credentials and raw frames out of the embedded bridge client", () => {
    const guard = read("pvp_double_match_guard.js");
    const embeddedClient = guard.slice(guard.indexOf("function installEmbeddedBridgeClient"), guard.indexOf("const MOD_NAME"));
    expect(embeddedClient).toContain('type: "match"');
    expect(embeddedClient).not.toMatch(/password|user_token|authorization|cookie|rawEvent|rawFrame|rawEvents/i);
  });
});
