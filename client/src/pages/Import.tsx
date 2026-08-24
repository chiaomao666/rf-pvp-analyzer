import { BlueprintTag, EmptyData } from "@/components/PvpUi";
import { Button } from "@/components/ui/button";
import { formatLocalDateTime } from "@/lib/localTime";
import { uploadPvpImportChunks, type PvpImportUploadSummary } from "@/lib/pvpImportUpload";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ClipboardPaste, Database, Download, FileJson, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const MAX_IMPORT_FILE_BYTES = 25_000_000;

export default function Import() {
  const utils = trpc.useUtils();
  const [label, setLabel] = useState("PVP 守衛 JSON 匯出");
  const [dataText, setDataText] = useState("");
  const [result, setResult] = useState<PvpImportUploadSummary | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const imports = trpc.pvp.listImports.useQuery();
  const backup = trpc.pvp.exportBackup.useQuery(undefined, { enabled: false });

  const upload = trpc.pvp.importJson.useMutation();

  const downloadBackup = async () => {
    try {
      const response = await backup.refetch();
      if (!response.data) throw new Error("目前無法建立備份，請稍後重試。");
      const content = JSON.stringify(response.data, null, 2);
      const href = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `rf-pvp-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      toast.success(`已下載 ${response.data.recordCount} 筆戰績備份；請保存在安全位置。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "建立備份失敗，請稍後重試。");
    }
  };

  const readFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDataText(String(reader.result || ""));
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        toast.info(`已載入 ${(file.size / 1_000_000).toFixed(1)}MB 檔案；匯入時會自動分批。`);
      }
    };
    reader.onerror = () => toast.error("無法讀取此檔案。");
    reader.readAsText(file);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setResult(null);
      const summary = await uploadPvpImportChunks({
        label,
        dataText,
        uploadChunk: input => upload.mutateAsync(input),
        onProgress: setBatchProgress,
      });
      setResult(summary);
      await utils.pvp.invalidate();
      if (summary.failure) {
        toast.error(`第 ${summary.failure.current}/${summary.failure.total} 批匯入失敗；先前 ${summary.completedChunks} 批已保留。${summary.failure.message}`);
        return;
      }
      setDataText("");
      toast.success(summary.totalChunks > 1
        ? `已完成 ${summary.totalChunks} 批匯入；新建 ${summary.createdCount} 筆、回填 ${summary.updatedCount} 筆。`
        : `匯入完成；新建 ${summary.createdCount} 筆、回填 ${summary.updatedCount} 筆。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "匯入失敗，請稍後重試。");
    } finally {
      setBatchProgress(null);
    }
  };

  return (
    <div className="page-enter">
      <section className="page-titlebar compact-titlebar">
        <div>
          <p className="eyebrow">IMPORT / PRESERVED RAW PAYLOAD</p>
          <h1>匯入資料<span className="title-underscore">_</span></h1>
          <p>可貼上或上傳 PVP 守衛腳本匯出的 JSON；已建立或回填的戰績會保留其來源資料，匯入批次則保存可追溯摘要。</p>
        </div>
        <Button type="button" variant="outline" className="blueprint-button" onClick={downloadBackup} disabled={backup.isFetching}>
          <Download size={16} />{backup.isFetching ? "正在建立備份…" : "下載完整資料備份"}
        </Button>
      </section>

      <section className="import-grid">
        <form className="import-form technical-frame" onSubmit={submit}>
          <header>
            <FileJson size={21} />
            <div>
              <h2>JSON 匯入入口</h2>
              <p>每批最多解析 100 筆候選資料；完整原始封包超過 24MB 時，系統會自動拆成多批循序匯入。</p>
            </div>
          </header>
          <label>
            <span>批次名稱 <b>*</b></span>
            <input value={label} onChange={event => setLabel(event.target.value)} required maxLength={120} />
          </label>
          <label className="file-drop">
            <span>從檔案載入</span>
            <input type="file" accept="application/json,.json" onChange={event => readFile(event.target.files?.[0])} />
            <Upload size={17} />選擇 .json 檔案（大型檔案會自動分批）
          </label>
          <label className="wide-label">
            <span>JSON 內容 <b>*</b></span>
            <textarea
              value={dataText}
              onChange={event => setDataText(event.target.value)}
              required
              placeholder="貼上 JSON，例如 PVP 守衛輸出的 [] 或含 matches / records / logs 陣列的物件。"
            />
          </label>
          <div className="import-note">
            <AlertTriangle size={16} />
            <p><b>辨識原則：</b>系統只在時間、模式與雙方非空隊伍可對應時建立戰績。`1v1`／`3v3` 會保留為遊戲模式，終局快照中的完整角色陣容不會被截斷；大型匯入的批次層只保存安全摘要，避免重複儲存整份原始封包。</p>
          </div>
          {batchProgress && (
            <p className="import-progress" aria-live="polite">正在匯入第 {batchProgress.current} / {batchProgress.total} 批，請勿關閉此頁…</p>
          )}
          <Button type="submit" className="blueprint-button primary-button" disabled={upload.isPending || Boolean(batchProgress) || !dataText.trim()}>
            {batchProgress || upload.isPending ? "驗證與保存中…" : <><ClipboardPaste size={16} />驗證並匯入</>}
          </Button>
        </form>

        <aside className="import-guide technical-frame">
          <p className="panel-kicker">IMPORT CONTRACT</p>
          <h2>已支援的常見欄位</h2>
          <dl>
            <div><dt>時間</dt><dd>battleAt、timestamp、date</dd></div>
            <div><dt>模式</dt><dd>mode、battleMode；或由 1／3 人資料推定</dd></div>
            <div><dt>隊伍</dt><dd>playerTeam / opponentTeam 與常見別名</dd></div>
            <div><dt>結果</dt><dd>outcome、result、winner、status</dd></div>
            <div><dt>排名</dt><dd>rankBefore / rankAfter 與常見別名</dd></div>
          </dl>
          <BlueprintTag>MATCH RAW · BATCH SUMMARY</BlueprintTag>
        </aside>
      </section>

      {result && (
        <section className="import-result technical-frame">
          <Database size={18} />
          <div>
            <h2>{result.failure ? "本次匯入部分完成" : "本次匯入已完成"}</h2>
            <p>辨識 <b>{result.importedCount}</b> 筆資料：新建 <b>{result.createdCount}</b> 筆、回填既有戰績 <b>{result.updatedCount}</b> 筆，另有 <b>{result.rejectedCount}</b> 筆未建立。已建立或回填的戰績會保留來源資料；匯入批次保留可追溯摘要。</p>
            {result.failure && <p className="warning-line">注意：第 {result.failure.current} / {result.failure.total} 批失敗；前 {result.completedChunks} 批已完成並保存。錯誤：{result.failure.message}</p>}
            {result.warnings.map((warning, index) => <p className="warning-line" key={index}>注意：{warning}</p>)}
          </div>
        </section>
      )}

      <section className="batch-history">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">RECENT IMPORT BATCHES</p>
            <h2>最近匯入批次</h2>
          </div>
        </header>
        {imports.isLoading ? (
          <div className="loading-block">讀取匯入歷程…</div>
        ) : imports.data?.length ? (
          <div className="batch-list technical-frame">
            {imports.data.map(batch => (
              <article key={batch.id}>
                <span><time>{formatLocalDateTime(batch.receivedAt)}</time><b>{batch.label}</b></span>
                <span className="batch-count"><strong>{batch.recognizedCount}</strong> 已辨識 · <strong>{batch.rejectedCount}</strong> 未建立</span>
                {batch.warnings.length ? <small>{batch.warnings[0]}</small> : <small>未回報辨識警告。</small>}
              </article>
            ))}
          </div>
        ) : (
          <EmptyData title="尚未匯入任何資料" description="完成第一個 JSON 匯入後，這裡會顯示可回查的批次摘要。" />
        )}
      </section>
    </div>
  );
}
