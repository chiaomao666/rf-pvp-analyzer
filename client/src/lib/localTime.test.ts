import { describe, expect, it } from "vitest";
import { formatLocalDateTime, formatLocalShortDate, formatLocalShortDateTime } from "./localTime";

describe("local PVP time formatting", () => {
  const utcTime = "2026-08-24T16:55:36.763Z";

  it("formats imported UTC timestamps in the selected local timezone", () => {
    expect(formatLocalDateTime(utcTime, { timeZone: "Asia/Taipei" })).toBe("2026/08/25 00:55");
    expect(formatLocalShortDateTime(utcTime, { timeZone: "Asia/Taipei" })).toBe("08/25 00:55");
    expect(formatLocalShortDate(utcTime, { timeZone: "Asia/Taipei" })).toBe("8/25");
  });

  it("keeps the underlying instant distinct from its local presentation", () => {
    expect(formatLocalDateTime(utcTime, { timeZone: "UTC" })).toBe("2026/08/24 16:55");
  });
});
