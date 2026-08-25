import { checkLocalBridge, getLocalBridgeCursor, isLocalBridgeEnabled, pollLocalBridge, setLocalBridgeCursor } from "@/lib/localBridge";
import { getActiveProfileId, ingestBridgeMatch, parsePvpJson } from "@/lib/localPvpStore";
import { getWorkspaceSession, restoreStoredWorkspace } from "@/lib/accountWorkspace";
import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * 全站被動同步：mod -> Worker -> D1 的事件不應要求使用者停留在帳號頁。
 * 不保存 token／密碼；只把 Worker 回傳的最小 match 摘要匯入目前工作區。
 */
export default function BridgeSync() {
  const [location] = useLocation();
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;

    const run = async () => {
      if (disposed || running) return;
      // Account.tsx owns the detailed status panel and its polling while visible.
      if (window.location.hash.replace(/^#/, "").split("?")[0] === "/account") return;
      running = true;
      try {
        if (!isLocalBridgeEnabled() || !getWorkspaceSession()) return;
        await restoreStoredWorkspace(getActiveProfileId());
        if (!getActiveProfileId()) return;
        await checkLocalBridge();
        const result = await pollLocalBridge(getLocalBridgeCursor());
        let cursor = getLocalBridgeCursor();
        let imported = 0;
        for (const event of result.events) {
          const parsed = parsePvpJson(JSON.stringify(event.data));
          const record = parsed.records[0];
          if (record) {
            await ingestBridgeMatch(record);
            imported += 1;
          }
          cursor = Math.max(cursor, event.id);
        }
        setLocalBridgeCursor(cursor);
        if (imported > 0 && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("rf-pvp-bridge-sync", { detail: { imported, latestEventId: result.latestEventId } }));
        }
      } catch {
        // 背景同步不可用時不阻塞分析站；帳號頁仍會顯示詳細錯誤。
      } finally {
        running = false;
        if (!disposed) timer = globalThis.setTimeout(run, 2_000);
      }
    };

    const listener = () => { void run(); };
    window.addEventListener("rf-pvp-bridge-change", listener);
    window.addEventListener("rf-pvp-account-change", listener);
    void run();
    return () => {
      disposed = true;
      if (timer) globalThis.clearTimeout(timer);
      window.removeEventListener("rf-pvp-bridge-change", listener);
      window.removeEventListener("rf-pvp-account-change", listener);
    };
  }, [location]);

  return null;
}
