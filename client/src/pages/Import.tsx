import { BlueprintTag, EmptyData } from "@/components/PvpUi";
import { Button } from "@/components/ui/button";
import { formatLocalDateTime } from "@/lib/localTime";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ClipboardPaste, Database, FileJson, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ImportResult = {
  importedCount: number;
  rejectedCount: number;
  warnings: string[];
};

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export default function Import() {
  const utils = trpc.useUtils();
  const [label, setLabel] = useState("PVP 守衛 JSON 匯出");
  const [dataText, setDataText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const imports = trpc.pvp.listImports.useQuery();

  const upload = trpc.pvp.importJson.useMutation({
    onSuccess: async data => {
      setResult(data);
      setDataText("");
      await utils.pvp.invalidate();
      toast.success(`已建立匯入批次；辨識 ${data.importedCount} 筆對戰。`);
    },
    onError: error => toast.error(error.message),
  });

  const readFile = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      toast.error("JSON 檔案超過 5MB 安全上限，請先縮小或分批匯入。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDataText(String(reader.result || ""));
    reader.onerror = () => toast.error("無法讀取此檔案。");
    reader.readAsText(file);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    upload.mutate({ label, dataText });
  };

  return (
    <div className="page-enter">
      <section className="page-titlebar compact-titlebar">
        <div>
          <p className="eyebrow">IMPORT / PRESERVED RAW PAYLOAD</p>
          <h1>匯入資料<span className="title-underscore">_</span></h1>
          <p>可貼上或上傳 PVP 守衛腳本匯出的 JSON；無法辨識的欄位與原始內容會一併保存。</p>
        </div>
      </section>

      <section className="import-grid">
        <form className="import-form technical-frame" onSubmit={submit}>
          <header>
            <FileJson size={21} />
            <div>
              <h2>JSON 匯入入口</h2>
              <p>系統會建立一個可回查的匯入批次，最多解析 100 筆候選資料；完整原始封包匯出支援至 5MB。</p>
            </div>
          </header>
          <label>
            <span>批次名稱 <b>*</b></span>
            <input value={label} onChange={event => setLabel(event.target.value)} required maxLength={120} />
          </label>
          <label className="file-drop">
            <span>從檔案載入</span>
            <input type="file" accept="application/json,.json" onChange={event => readFile(event.target.files?.[0])} />
            <Upload size={17} />選擇 .json 檔案
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
            <p><b>辨識原則：</b>系統只在時間、模式與雙方非空隊伍可對應時建立戰績。`1v1`／`3v3` 會保留為遊戲模式，終局快照中的完整角色陣容不會被截斷；其他資料不會被丟棄，而是原樣保留在這個匯入批次中。</p>
          </div>
          <Button type="submit" className="blueprint-button primary-button" disabled={upload.isPending || !dataText.trim()}>
            {upload.isPending ? "驗證與保存中…" : <><ClipboardPaste size={16} />驗證並匯入</>}
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
          <BlueprintTag>RAW PAYLOAD RETAINED</BlueprintTag>
        </aside>
      </section>

      {result && (
        <section className="import-result technical-frame">
          <Database size={18} />
          <div>
            <h2>本次匯入已完成</h2>
            <p>建立 <b>{result.importedCount}</b> 筆戰績，另有 <b>{result.rejectedCount}</b> 筆未建立。未建立的原始資料仍在匯入批次中完整保留。</p>
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
