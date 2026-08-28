import { useEffect, useState } from "react";
import { getBridgeSyncSnapshot, BridgeSyncSnapshot } from "@/lib/localBridge";

const initialBuild = { version: "dev", timestamp: "" };
type BuildMeta = typeof initialBuild;

function formatTime(value?: number | string) {
  if (!value) return "尚未同步";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? "尚未同步" : date.toLocaleString("zh-TW", { hour12: false });
}

function statusText(snapshot: BridgeSyncSnapshot) {
  if (snapshot.mode === "remote") {
    if (snapshot.status === "online") return "Worker 已連線";
    if (snapshot.status === "checking") return "Worker 連線檢查中";
    if (snapshot.status === "offline") return "Worker 無法連線";
    return "Worker 尚未啟用";
  }
  if (snapshot.status === "online") return "本機 bridge 已連線";
  if (snapshot.status === "checking") return "本機 bridge 檢查中";
  if (snapshot.status === "offline") return "本機 bridge 離線";
  return "本機 bridge 未啟用";
}

export default function BuildStatusFooter() {
  const [build, setBuild] = useState<BuildMeta>(initialBuild);
  const [snapshot, setSnapshot] = useState(getBridgeSyncSnapshot());
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}__manus__/version.json`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : initialBuild)
      .then(value => { if (alive && value && typeof value === "object") setBuild({ version: String(value.version ?? "dev"), timestamp: String(value.timestamp ?? "") }); })
      .catch(() => undefined);
    const update = (event: Event) => setSnapshot((event as CustomEvent<BridgeSyncSnapshot>).detail ?? getBridgeSyncSnapshot());
    const modeChange = () => setSnapshot(getBridgeSyncSnapshot());
    window.addEventListener("rf-pvp-bridge-status", update);
    window.addEventListener("rf-pvp-bridge-change", modeChange);
    return () => { alive = false; window.removeEventListener("rf-pvp-bridge-status", update); window.removeEventListener("rf-pvp-bridge-change", modeChange); };
  }, []);
  return (
    <footer className="app-footer">
      <span>RF PVP ANALYZER</span><i />
      <span className="sync-indicator"><b className={`sync-dot sync-${snapshot.status}`} />{statusText(snapshot)}</span>
      <span>最後同步：{formatTime(snapshot.lastSyncAt)}</span>
      <i /><span>版本 {build.version}</span>
      <span>更新：{formatTime(build.timestamp)}</span>
      <span className="site-owner">網站擁有者&管理者：俏貓</span>
    </footer>
  );
}
