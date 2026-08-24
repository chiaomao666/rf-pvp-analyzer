import { describe, expect, it, vi } from "vitest";
import { uploadPvpImportChunks } from "./pvpImportUpload";

const payload = JSON.stringify({
  format: "rf-pvp-analyzer/v1",
  records: Array.from({ length: 4 }, (_, index) => ({
    battleAt: 1_726_000_000_000 + index,
    mode: "1v1",
    playerTeam: [{ name: "Player" }],
    opponentTeam: [{ name: "Opponent" }],
    payload: "x".repeat(600),
  })),
  rawEvents: [],
});

describe("uploadPvpImportChunks", () => {
  it("依序提交所有批次，並正確彙總 imported／created／updated 與進度", async () => {
    const uploadChunk = vi.fn()
      .mockResolvedValueOnce({ importedCount: 2, createdCount: 1, updatedCount: 1, rejectedCount: 0, warnings: ["首批警告"] })
      .mockResolvedValueOnce({ importedCount: 2, createdCount: 2, updatedCount: 0, rejectedCount: 1, warnings: [] });
    const onProgress = vi.fn();

    const summary = await uploadPvpImportChunks({
      label: "守衛匯出",
      dataText: payload,
      uploadChunk,
      onProgress,
      maxBytes: 1_800,
    });

    expect(uploadChunk).toHaveBeenCalledTimes(2);
    expect(uploadChunk.mock.calls.map(call => call[0].label)).toEqual(["守衛匯出（第 1/2 批）", "守衛匯出（第 2/2 批）"]);
    expect(onProgress.mock.calls.map(call => call[0])).toEqual([{ current: 1, total: 2 }, { current: 2, total: 2 }]);
    expect(summary).toMatchObject({
      importedCount: 4,
      createdCount: 3,
      updatedCount: 1,
      rejectedCount: 1,
      totalChunks: 2,
      completedChunks: 2,
      warnings: ["第 1 批：首批警告"],
    });
    expect(summary.failure).toBeUndefined();
  });

  it("在中途失敗時停止後續提交，並保留先前批次統計與失敗批次資訊", async () => {
    const uploadChunk = vi.fn()
      .mockResolvedValueOnce({ importedCount: 2, createdCount: 2, updatedCount: 0, rejectedCount: 0, warnings: [] })
      .mockRejectedValueOnce(new Error("網路連線中斷"));

    const summary = await uploadPvpImportChunks({
      label: "守衛匯出",
      dataText: payload,
      uploadChunk,
      maxBytes: 1_800,
    });

    expect(uploadChunk).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({
      importedCount: 2,
      createdCount: 2,
      updatedCount: 0,
      totalChunks: 2,
      completedChunks: 1,
      failure: { current: 2, total: 2, message: "網路連線中斷" },
    });
  });
});
