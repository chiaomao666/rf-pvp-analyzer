/* RF PVP Analyzer Localhost Bridge client for an approved browser mod. */
(() => {
  "use strict";
  const endpoint = "http://127.0.0.1:8787/v1/capture";
  const allowed = [
    "battleAt", "mode", "outcome", "playerTeam", "opponentTeam", "opponentName",
    "rankBefore", "rankAfter", "scoreBefore", "scoreAfter", "notes",
    "sourceBattleChannel", "sourceBattleId",
  ];

  if (window.RFLocalBridge?.sendMatch) return;

  function sanitize(summary) {
    if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
      throw new Error("match summary must be an object");
    }
    return Object.fromEntries(
      allowed.filter((key) => key in summary).map((key) => [key, summary[key]]),
    );
  }

  async function sendMatch(summary) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "match", data: sanitize(summary) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.accepted) {
      throw new Error(payload.error || `bridge HTTP ${response.status}`);
    }
    return payload;
  }

  window.RFLocalBridge = Object.freeze({ sendMatch, endpoint });
  console.log("[RF bridge] client ready; loopback only");
})();
