export const IMPORT_BATCH_MAX_BYTES = 24_000_000;
const MAX_RECORDS_PER_BATCH = 100;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function compactMetadata(root: JsonObject): JsonObject {
  const metadataKeys = ["format", "version", "schema", "exportedAt", "exportedAtUtc", "exportedAtLocal", "source", "guardVersion"];
  return Object.fromEntries(metadataKeys.filter(key => root[key] !== undefined).map(key => [key, root[key]]));
}

function serialiseBatch(metadata: JsonObject, records: unknown[], rawEvents: unknown[], batchIndex: number, batchCount: number) {
  return JSON.stringify({
    ...metadata,
    records,
    rawEvents,
    chunk: { index: batchIndex + 1, total: batchCount },
  });
}

/**
 * 將守衛輸出的 records 與 rawEvents 安全切為多個獨立 JSON 根物件。
 * 每批均可由既有匯入器直接辨識，且 records 永遠不超過其 100 筆解析上限。
 */
export function splitPvpImportForUpload(dataText: string, maxBytes = IMPORT_BATCH_MAX_BYTES): string[] {
  if (byteLength(dataText) <= maxBytes) return [dataText];

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataText);
  } catch {
    throw new Error("JSON 格式無法解析；請確認檔案完整後再匯入。");
  }
  if (!isObject(parsed)) {
    throw new Error("超過單批上限的資料必須是 PVP 守衛輸出的 JSON 物件。");
  }

  const records = Array.isArray(parsed.records) ? parsed.records : [];
  const rawEvents = Array.isArray(parsed.rawEvents) ? parsed.rawEvents : [];
  if (!records.length && !rawEvents.length) {
    throw new Error("此大型 JSON 找不到可分批的 records 或 rawEvents 陣列。");
  }

  const metadata = compactMetadata(parsed);
  const chunks: Array<{ records: unknown[]; rawEvents: unknown[] }> = [];
  let current = { records: [] as unknown[], rawEvents: [] as unknown[] };

  const canAdd = (kind: "records" | "rawEvents", value: unknown) => {
    const candidate = {
      records: kind === "records" ? [...current.records, value] : current.records,
      rawEvents: kind === "rawEvents" ? [...current.rawEvents, value] : current.rawEvents,
    };
    return candidate.records.length <= MAX_RECORDS_PER_BATCH
      && byteLength(serialiseBatch(metadata, candidate.records, candidate.rawEvents, 0, 1)) <= maxBytes;
  };
  const commitCurrent = () => {
    if (current.records.length || current.rawEvents.length) chunks.push(current);
    current = { records: [], rawEvents: [] };
  };
  const append = (kind: "records" | "rawEvents", value: unknown) => {
    if (!canAdd(kind, value)) {
      commitCurrent();
      if (!canAdd(kind, value)) throw new Error("有單一原始封包已超過單批安全上限，無法自動分批匯入。");
    }
    current[kind].push(value);
  };

  records.forEach(record => append("records", record));
  rawEvents.forEach(event => append("rawEvents", event));
  commitCurrent();

  return chunks.map((chunk, index) => serialiseBatch(metadata, chunk.records, chunk.rawEvents, index, chunks.length));
}
