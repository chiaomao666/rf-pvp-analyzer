import { BlueprintTag, EmptyData } from "@/components/PvpUi";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatLocalDateTime } from "@/lib/localTime";
import {
  clearLocalData,
  exportLocalBackup,
  importPvpJson,
  listImports,
  restoreLocalBackup,
  type ImportSummary,
  type LocalImportBatch,
} from "@/lib/localPvpStore";
import {
  AlertTriangle,
  ClipboardPaste,
  Database,
  Download,
  FileJson,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

function downloadJson(value: unknown, filename: string) {
  const href = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

export default function Import() {
  const [label, setLabel] = useState("PVP 守衛 JSON 匯出");
  const [dataText, setDataText] = useState("");
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [imports, setImports] = useState<LocalImportBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [clearDialog, setClearDialog] = useState(false);
  const backupInput = useRef<HTMLInputElement>(null);

  const refresh = () => {
    listImports().then(setImports);
  };

  useEffect(() => {
    refresh();
    window.addEventListener("rf-pvp-store-change", refresh);
    return () => window.removeEventListener("rf-pvp-store-change", refresh);
  }, []);

  const readFile = async (file?: File) => {
    if (!file) return;
    try {
      setDataText(await file.text());
      if (file.size > 25_000_000) {
        toast.info(
          `已在瀏覽器載入 ${(file.size / 1_000_000).toFixed(1)}MB JSON；請在匯入完成前不要關閉此頁。`,
        );
      }
    } catch {
      toast.error("無法讀取此檔案。");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const summary = await importPvpJson(label, dataText);
      setResult(summary);
      setDataText("");
      toast.success(`匯入完成：新建 ${summary.createdCount} 筆、更新 ${summary.updatedCount} 筆。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "匯入失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async () => {
    setBusy(true);
    try {
      const backup = await exportLocalBackup();
      downloadJson(
        backup,
        `rf-pvp-local-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      );
      toast.success(`已下載 ${backup.recordCount} 筆本機戰績的完整備份。`);
    } catch {
      toast.error("建立本機備份失敗。");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const summary = await restoreLocalBackup(await file.text(), false);
      toast.success(
        `已還原 ${summary.restored} 筆本機備份資料${summary.skipped ? `；略過 ${summary.skipped} 筆重複或無效資料` : ""}。`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "還原備份失敗。");
    } finally {
      setBusy(false);
      if (backupInput.current) backupInput.current.value = "";
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await clearLocalData();
      toast.success("已清除目前瀏覽器的所有本機戰績與匯入歷程。");
      setClearDialog(false);
    } catch {
      toast.error("清除本機資料失敗。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-enter">
      <section className="page-titlebar compact-titlebar">
        <div>
          <p className="eyebrow">IMPORT / INDEXEDDB LOCAL STORE</p>
          <h1>
            匯入資料<span className="title-underscore">_</span>
          </h1>
          <p>資料只保存於目前瀏覽器。匯入重要戰績後請下載完整備份；清除網站資料或改用其他瀏覽器前務必先備份。</p>
        </div>
        <div className="button-cluster">
          <Button type="button" variant="outline" className="blueprint-button" onClick={() => void exportBackup()} disabled={busy}>
            <Download size={16} />下載完整備份
          </Button>
          <Button type="button" variant="outline" className="blueprint-button" onClick={() => backupInput.current?.click()} disabled={busy}>
            <RotateCcw size={16} />還原本機備份
          </Button>
          <input ref={backupInput} className="sr-only" type="file" accept="application/json,.json" onChange={event => void restore(event.target.files?.[0])} />
        </div>
      </section>

      <section className="import-grid">
        <form className="import-form technical-frame" onSubmit={submit}>
          <header>
            <FileJson size={21} />
            <div>
              <h2>守衛 JSON 一般匯入</h2>
              <p>用於 PVP 守衛匯出的戰績 JSON；只會建立或更新戰績。若檔案是 `rf-pvp-analyzer/local-backup-v1` 完整備份，請改用上方「還原本機備份」，以一併還原匯入歷程。</p>
            </div>
          </header>
          <label>
            <span>批次名稱 <b>*</b></span>
            <input value={label} onChange={event => setLabel(event.target.value)} required maxLength={120} />
          </label>
          <label className="file-drop">
            <span>從檔案載入</span>
            <input type="file" accept="application/json,.json" onChange={event => void readFile(event.target.files?.[0])} />
            <Upload size={17} />選擇 PVP 守衛 .json 檔案（大型檔案會在本機處理）
          </label>
          <label className="wide-label">
            <span>JSON 內容 <b>*</b></span>
            <textarea value={dataText} onChange={event => setDataText(event.target.value)} required placeholder="貼上 PVP 守衛輸出的 JSON。完整本機備份請用上方「還原本機備份」。" />
          </label>
          <div className="import-note">
            <AlertTriangle size={16} />
            <p><b>隱私提醒：</b>本頁不會發送你的戰績資料到網路。資料受目前瀏覽器與 GitHub Pages 網域限制；請定期下載完整備份 JSON。</p>
          </div>
          <Button type="submit" className="blueprint-button primary-button" disabled={busy || !dataText.trim()}>
            {busy ? "本機處理中…" : <><ClipboardPaste size={16} />驗證並匯入</>}
          </Button>
        </form>

        <aside className="import-guide technical-frame">
          <p className="panel-kicker">LOCAL DATA CONTRACT</p>
          <h2>純前端資料保存</h2>
          <dl>
            <div><dt>儲存位置</dt><dd>IndexedDB（目前瀏覽器）</dd></div>
            <div><dt>一般匯入</dt><dd>PVP 守衛 JSON（只建立／更新戰績）</dd></div>
            <div><dt>完整備份</dt><dd>按「還原本機備份」匯入 local-backup-v1（含匯入歷程）</dd></div>
            <div><dt>跨裝置同步</dt><dd>不支援；請手動下載與還原備份</dd></div>
          </dl>
          <BlueprintTag>LOCAL ONLY · BACKUP OFTEN</BlueprintTag>
        </aside>
      </section>

      {result && (
        <section className="import-result technical-frame">
          <Database size={18} />
          <div>
            <h2>本次匯入已完成</h2>
            <p>辨識 <b>{result.importedCount}</b> 筆資料：新建 <b>{result.createdCount}</b> 筆、更新 <b>{result.updatedCount}</b> 筆，另有 <b>{result.rejectedCount}</b> 筆未建立。</p>
            {result.warnings.map((warning, index) => <p className="warning-line" key={index}>注意：{warning}</p>)}
          </div>
        </section>
      )}

      <section className="batch-history">
        <header className="panel-header">
          <div><p className="panel-kicker">RECENT LOCAL IMPORTS</p><h2>最近匯入批次</h2></div>
          <Button type="button" variant="outline" className="danger-button" onClick={() => setClearDialog(true)} disabled={busy}>
            <Trash2 size={15} />清除本機資料
          </Button>
        </header>
        {imports.length ? (
          <div className="batch-list technical-frame">
            {imports.map(batch => (
              <article key={batch.id}>
                <span><time>{formatLocalDateTime(batch.receivedAt)}</time><b>{batch.label}</b></span>
                <span className="batch-count"><strong>{batch.recognizedCount}</strong> 已辨識 · <strong>{batch.rejectedCount}</strong> 未建立</span>
                {batch.warnings.length ? <small>{batch.warnings[0]}</small> : <small>未回報辨識警告。</small>}
              </article>
            ))}
          </div>
        ) : (
          <EmptyData title="尚未匯入任何資料" description="完成第一個 JSON 匯入後，這裡會顯示本機可回查的批次摘要。" />
        )}
      </section>

      <AlertDialog open={clearDialog} onOpenChange={open => !open && !busy && setClearDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清除所有本機資料？</AlertDialogTitle>
            <AlertDialogDescription>這會刪除目前瀏覽器的所有戰績與匯入歷程，無法復原。請先下載完整備份。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void clear(); }}>
              {busy ? "清除中…" : "確認清除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
