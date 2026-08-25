import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

describe("approved PVP mod bridge contract", () => {
  it("loads bridge client before the PVP guard", () => {
    const loader = read("rf_mod_loader.js");
    expect(loader.indexOf('src: "./mods/rf_bridge_client.js"')).toBeLessThan(loader.indexOf('src: "./mods/pvp_double_match_guard.js"'));
  });

  it("only forwards records after official player medals evidence", () => {
    const guard = read("pvp_double_match_guard.js");
    expect(guard).toContain('record.resultEvidence !== "official_player_medals"');
    expect(guard).toContain('window.RFLocalBridge?.sendMatch');
    expect(guard).toContain('text.includes("5v5")');
  });

  it("keeps credentials and raw frames out of the bridge client", () => {
    const client = read("rf_bridge_client.js");
    expect(client).toContain('type: "match"');
    expect(client).not.toMatch(/password|user_token|authorization|cookie|rawEvent|rawFrame|rawEvents/i);
  });
});
