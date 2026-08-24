import { IMPORT_BATCH_MAX_BYTES, splitPvpImportForUpload } from "./pvpImportBatching";

export type PvpImportChunkResult = {
  importedCount: number;
  createdCount: number;
  updatedCount: number;
  rejectedCount: number;
  warnings: string[];
};

export type PvpImportUploadSummary = PvpImportChunkResult & {
  totalChunks: number;
  completedChunks: number;
  failure?: {
    current: number;
    total: number;
    message: string;
  };
};

type UploadArguments = {
  label: string;
  dataText: string;
  uploadChunk: (input: { label: string; dataText: string }) => Promise<PvpImportChunkResult>;
  onProgress?: (progress: { current: number; total: number }) => void;
  maxBytes?: number;
};

/**
 * 逐批提交守衛匯出，故意在第一個失敗批次停止；已完成批次的統計會原樣保留，避免使用者誤以為整次匯入均未寫入。
 */
export async function uploadPvpImportChunks({
  label,
  dataText,
  uploadChunk,
  onProgress,
  maxBytes = IMPORT_BATCH_MAX_BYTES,
}: UploadArguments): Promise<PvpImportUploadSummary> {
  const chunks = splitPvpImportForUpload(dataText, maxBytes);
  const summary: PvpImportUploadSummary = {
    importedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    rejectedCount: 0,
    warnings: [],
    totalChunks: chunks.length,
    completedChunks: 0,
  };

  for (let index = 0; index < chunks.length; index += 1) {
    const current = index + 1;
    onProgress?.({ current, total: chunks.length });
    const chunkLabel = chunks.length > 1 ? `${label}（第 ${current}/${chunks.length} 批）` : label;
    try {
      const result = await uploadChunk({ label: chunkLabel, dataText: chunks[index] });
      summary.importedCount += result.importedCount;
      summary.createdCount += result.createdCount;
      summary.updatedCount += result.updatedCount;
      summary.rejectedCount += result.rejectedCount;
      summary.warnings.push(...result.warnings.map(warning => `第 ${current} 批：${warning}`));
      summary.completedChunks = current;
    } catch (error) {
      const message = error instanceof Error ? error.message : "匯入失敗，請稍後重試。";
      return {
        ...summary,
        failure: { current, total: chunks.length, message },
      };
    }
  }

  return summary;
}
