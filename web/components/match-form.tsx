"use client";
// 建立／編輯比賽（只有球隊管理員會看到用這個）：對手、開賽時間、集合時間、地點、球衣顏色、賽制、備註、比分。
import { useState, type FormEvent } from "react";
import { saveMatch, type Match } from "@/lib/api";
import { fromLocalInput, toLocalInput } from "@/lib/matches";
import { message } from "@/lib/status";
import { ErrorBox } from "./ui";

const SIZES = [11, 8] as const;

export function MatchForm({ teamId, match, onSaved, onCancel }: {
  teamId: string; match: Match | null; onSaved: (id: string) => void; onCancel: () => void;
}) {
  const [opponent, setOpponent] = useState(match?.opponent ?? "");
  const [kickoff, setKickoff] = useState(toLocalInput(match?.kickoff ?? null));
  const [meetAt, setMeetAt] = useState(toLocalInput(match?.meet_at ?? null));
  const [location, setLocation] = useState(match?.location ?? "");
  const [jersey, setJersey] = useState(match?.jersey ?? "");
  const [size, setSize] = useState<8 | 11>(match?.size ?? 11);
  const [note, setNote] = useState(match?.note ?? "");
  const [ourScore, setOurScore] = useState(match?.our_score?.toString() ?? "");
  const [theirScore, setTheirScore] = useState(match?.their_score?.toString() ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!opponent.trim()) { setError("請填對手"); return; }
    if (!kickoff) { setError("請填開賽時間"); return; }
    if ((ourScore === "") !== (theirScore === "")) { setError("比分要兩邊都填，或兩邊都不填"); return; }
    setBusy(true); setError("");
    try {
      const r = await saveMatch({
        team: teamId, match: match?.id ?? null, opponent: opponent.trim(),
        kickoff: fromLocalInput(kickoff) ?? "", meetAt: fromLocalInput(meetAt), location: location.trim(),
        jersey: jersey.trim(), size, note: note.trim(),
        ourScore: ourScore === "" ? null : Number(ourScore), theirScore: theirScore === "" ? null : Number(theirScore),
      });
      if (r.status === "ok" && r.id) onSaved(r.id);
      else setError(message(r));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel pad stack" style={{ gap: 12 }}>
      {error && <ErrorBox text={error} />}
      <label className="label">對手<input className="field" value={opponent} maxLength={40} required
        onChange={(e) => setOpponent(e.target.value)} placeholder="例如：機械系" /></label>
      <div className="grid2" style={{ gap: 12 }}>
        <label className="label">開賽時間<input className="field" type="datetime-local" value={kickoff} required
          onChange={(e) => setKickoff(e.target.value)} /></label>
        <label className="label">集合／熱身時間（選填）<input className="field" type="datetime-local" value={meetAt}
          onChange={(e) => setMeetAt(e.target.value)} /></label>
      </div>
      <div className="grid2" style={{ gap: 12 }}>
        <label className="label">地點（選填）<input className="field" value={location} maxLength={60}
          onChange={(e) => setLocation(e.target.value)} placeholder="例如：成功操場" /></label>
        <label className="label">球衣顏色（選填）<input className="field" value={jersey} maxLength={20}
          onChange={(e) => setJersey(e.target.value)} placeholder="例如：白色" /></label>
      </div>
      <label className="label">賽制
        <div role="radiogroup" aria-label="賽制" className="seg">
          {SIZES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={size === s} onClick={() => setSize(s)}>{s} 人制</button>
          ))}
        </div>
      </label>
      <label className="label">備註（選填）<textarea className="field" value={note} maxLength={200} rows={2}
        style={{ height: "auto", padding: "10px 12px" }} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="grid2" style={{ gap: 12 }}>
        <label className="label">我們進球（比賽結束後再填）<input className="field" type="number" min={0} max={99} value={ourScore}
          onChange={(e) => setOurScore(e.target.value)} /></label>
        <label className="label">對手進球<input className="field" type="number" min={0} max={99} value={theirScore}
          onChange={(e) => setTheirScore(e.target.value)} /></label>
      </div>
      <div className="chips">
        <button type="submit" className="btn btn-main" disabled={busy}>{busy ? "儲存中…" : match ? "儲存" : "建立比賽"}</button>
        <button type="button" className="btn btn-line" onClick={onCancel} disabled={busy}>取消</button>
      </div>
    </form>
  );
}
