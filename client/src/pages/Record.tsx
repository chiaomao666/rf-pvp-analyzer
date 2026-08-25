import { BlueprintTag } from "@/components/PvpUi";
import { Button } from "@/components/ui/button";
import { getLocalDateTimeInputValue } from "@/lib/localTime";
import { getActiveProfileId, getProfile, saveMatch, type LocalProfile, type PvpOutcome } from "@/lib/localPvpStore";
import { Check, ClipboardPenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type EditableMember = { name: string; level: string; power: string; role: string };
const TEAM_SIZE = 5;
const blankMember = (): EditableMember => ({ name: "", level: "", power: "", role: "" });
const createTeam = () => Array.from({ length: TEAM_SIZE }, blankMember);
const toNumber = (value: string) => value.trim() ? Number(value) : undefined;

export default function Record() {
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [outcome, setOutcome] = useState<PvpOutcome>("win");
  const [battleAt, setBattleAt] = useState(() => getLocalDateTimeInputValue());
  const [opponentName, setOpponentName] = useState("");
  const [rankBefore, setRankBefore] = useState("");
  const [rankAfter, setRankAfter] = useState("");
  const [scoreBefore, setScoreBefore] = useState("");
  const [scoreAfter, setScoreAfter] = useState("");
  const [notes, setNotes] = useState("");
  const [playerTeam, setPlayerTeam] = useState<EditableMember[]>(createTeam);
  const [opponentTeam, setOpponentTeam] = useState<EditableMember[]>(createTeam);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const refreshProfile = () => {
      const id = getActiveProfileId();
      if (!id) { setProfile(null); return; }
      void getProfile(id).then(item => setProfile(item ?? null));
    };
    refreshProfile();
    window.addEventListener("rf-pvp-account-change", refreshProfile);
    return () => window.removeEventListener("rf-pvp-account-change", refreshProfile);
  }, []);

  const updateMember = (side: "player" | "opponent", index: number, field: keyof EditableMember, value: string) => {
    const update = (members: EditableMember[]) => members.map((member, memberIndex) => memberIndex === index ? { ...member, [field]: value } : member);
    if (side === "player") setPlayerTeam(update); else setOpponentTeam(update);
  };
  const normalizeTeam = (team: EditableMember[]) => team.map(member => ({
    name: member.name.trim(),
    ...(toNumber(member.level) ? { level: toNumber(member.level) } : {}),
    ...(toNumber(member.power) !== undefined ? { power: toNumber(member.power) } : {}),
    ...(member.role.trim() ? { role: member.role.trim() } : {}),
  }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) { toast.error("請先至帳號工作區登入、選取已存帳號或開啟示範模式。 "); return; }
    const timestamp = new Date(battleAt).getTime();
    if (!timestamp) { toast.error("請填寫有效的對戰時間。 "); return; }
    setSaving(true);
    try {
      await saveMatch({
        battleAt: timestamp,
        mode: "5v5",
        outcome,
        playerTeam: normalizeTeam(playerTeam),
        opponentTeam: normalizeTeam(opponentTeam),
        ...(opponentName.trim() ? { opponentName: opponentName.trim() } : {}),
        ...(toNumber(rankBefore) ? { rankBefore: toNumber(rankBefore) } : {}),
        ...(toNumber(rankAfter) ? { rankAfter: toNumber(rankAfter) } : {}),
        ...(toNumber(scoreBefore) !== undefined ? { scoreBefore: toNumber(scoreBefore) } : {}),
        ...(toNumber(scoreAfter) !== undefined ? { scoreAfter: toNumber(scoreAfter) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      toast.success("5v5 排名戰紀錄已保存到目前帳號工作區。 ");
      navigate("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存本機資料失敗。 ");
    } finally {
      setSaving(false);
    }
  };

  return <div className="page-enter">
    <section className="page-titlebar compact-titlebar"><div><p className="eyebrow">MANUAL ENTRY / 5V5 RANKED BATTLE</p><h1>新增對戰<span className="title-underscore">_</span></h1><p>{profile ? "此紀錄只會儲存於目前帳號工作區。" : "請先選取帳號工作區；尚未選取時不能保存戰績。"}</p></div></section>
    <form className="record-form" onSubmit={submit}>
      <section className="form-section technical-frame"><header><span>01</span><div><h2>戰鬥條件</h2><p>排名戰固定為雙方各五名角色的 5v5 編制。</p></div></header><div className="form-grid"><label><span>對戰時間 <b>*</b></span><input type="datetime-local" value={battleAt} onChange={event => setBattleAt(event.target.value)} required /></label><label><span>對戰編制</span><div className="fixed-mode-field">5v5 · 雙方各 5 名</div></label><label><span>對戰結果 <b>*</b></span><select value={outcome} onChange={event => setOutcome(event.target.value as PvpOutcome)}><option value="win">勝利</option><option value="loss">敗北</option><option value="draw">平手</option><option value="unknown">待確認</option></select></label><label><span>對手名稱</span><input maxLength={120} value={opponentName} onChange={event => setOpponentName(event.target.value)} placeholder="選填" /></label><label><span>賽前積分</span><input inputMode="numeric" value={scoreBefore} onChange={event => setScoreBefore(event.target.value)} placeholder="例如 6740" /></label><label><span>賽後積分</span><input inputMode="numeric" value={scoreAfter} onChange={event => setScoreAfter(event.target.value)} placeholder="例如 6860" /></label><label><span>賽前排名</span><input inputMode="numeric" value={rankBefore} onChange={event => setRankBefore(event.target.value)} placeholder="例如 120" /></label><label><span>賽後排名</span><input inputMode="numeric" value={rankAfter} onChange={event => setRankAfter(event.target.value)} placeholder="例如 112" /></label></div></section>
      <section className="team-entry-grid"><TeamForm title="我的隊伍" index="02" members={playerTeam} onChange={(index, field, value) => updateMember("player", index, field, value)} /><TeamForm title="對手隊伍" index="03" members={opponentTeam} onChange={(index, field, value) => updateMember("opponent", index, field, value)} opponent /></section>
      <section className="form-section technical-frame"><header><span>04</span><div><h2>備註與保存</h2><p>備註可記錄配隊策略、異常情況或賽後觀察。</p></div></header><label className="wide-label"><span>對戰備註</span><textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={3000} placeholder="選填；最多 3,000 字。" /></label><div className="form-confirm"><span><Check size={15} />{profile ? "將保存雙方各五名角色到目前帳號工作區。" : "尚未選取帳號工作區。"}</span><Button type="submit" className="blueprint-button primary-button" disabled={saving || !profile}>{saving ? "保存中…" : <><ClipboardPenLine size={16} />保存 5v5 排名戰</>}</Button></div></section>
    </form>
  </div>;
}

function TeamForm({ title, index, members, onChange, opponent = false }: { title: string; index: string; members: EditableMember[]; onChange: (index: number, field: keyof EditableMember, value: string) => void; opponent?: boolean }) {
  return <section className={`team-form technical-frame ${opponent ? "team-form-opponent" : ""}`}><header><span>{index}</span><div><h2>{title}</h2><p>固定 5 名角色 · 所有角色名稱皆為必填。</p></div><BlueprintTag>SQUAD / 5</BlueprintTag></header>{members.map((member, memberIndex) => <div className="member-form" key={memberIndex}><span className="member-number">{String(memberIndex + 1).padStart(2, "0")}</span><label><span>角色名稱 <b>*</b></span><input value={member.name} onChange={event => onChange(memberIndex, "name", event.target.value)} required placeholder={`角色 ${memberIndex + 1}`} maxLength={100} /></label><label><span>等級</span><input inputMode="numeric" value={member.level} onChange={event => onChange(memberIndex, "level", event.target.value)} placeholder="Lv." /></label><label><span>戰力</span><input inputMode="numeric" value={member.power} onChange={event => onChange(memberIndex, "power", event.target.value)} placeholder="選填" /></label><label><span>職業</span><input value={member.role} onChange={event => onChange(memberIndex, "role", event.target.value)} placeholder="選填" maxLength={40} /></label></div>)}</section>;
}
