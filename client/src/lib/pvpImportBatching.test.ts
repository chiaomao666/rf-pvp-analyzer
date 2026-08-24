import { describe, expect, it } from "vitest";
import { IMPORT_BATCH_MAX_BYTES, splitPvpImportForUpload } from "./pvpImportBatching";

describe("splitPvpImportForUpload", () => {
  it("會把大型守衛匯出拆成可獨立辨識且各自受限的 JSON 批次", () => {
    const payload = JSON.stringify({
      format: "rf-pvp-analyzer/v1",
      records: Array.from({ length: 101 }, (_, index) => ({
        battleAt: 1_700_000_000_000 + index,
        mode: "1v1",
        playerTeam: [{ name: "A" }],
        opponentTeam: [{ name: "B" }],
      })),
      rawEvents: Array.from({ length: 6 }, (_, index) => ({ payload: "x".repeat(640), index })),
    });
    const chunks = splitPvpImportForUpload(payload, 4_500);
    expect(chunks.length).toBeGreaterThan(1);
    const parsed = chunks.map(chunk => JSON.parse(chunk));
    expect(parsed.flatMap(chunk => chunk.records).length).toBe(101);
    expect(parsed.flatMap(chunk => chunk.rawEvents).length).toBe(6);
    expect(parsed.every(chunk => chunk.records.length <= 100)).toBe(true);
    expect(chunks.every(chunk => new TextEncoder().encode(chunk).byteLength <= 4_500)).toBe(true);
  });

  it("不會改寫原本已低於上限的 JSON", () => {
    const payload = JSON.stringify({ records: [], rawEvents: [] });
    expect(splitPvpImportForUpload(payload, IMPORT_BATCH_MAX_BYTES)).toEqual([payload]);
  });

  it("可將超過 25MB 的守衛 JSON 依 24MB API 目標拆為完整且可提交的多批", () => {
    const payload = JSON.stringify({
      format: "rf-pvp-analyzer/v1",
      records: [],
      rawEvents: [{ frame: "x".repeat(12_600_000) }, { frame: "y".repeat(12_600_000) }],
    });
    expect(new TextEncoder().encode(payload).byteLength).toBeGreaterThan(25_000_000);

    const chunks = splitPvpImportForUpload(payload);
    expect(chunks).toHaveLength(2);
    expect(chunks.every(chunk => new TextEncoder().encode(chunk).byteLength <= IMPORT_BATCH_MAX_BYTES)).toBe(true);
    expect(chunks.flatMap(chunk => JSON.parse(chunk).rawEvents).map((event: { frame: string }) => event.frame.length)).toEqual([12_600_000, 12_600_000]);
  });
});
