"use client";
// 發文／回覆的輸入框。主貼文：球員只能發「一般」，球隊管理員可以選類型、附正式陣容；回覆一律「一般」、沒有附件。
import { useState } from "react";
import { postMessage, type LineupRow, type MessageKind } from "@/lib/api";
import { message } from "@/lib/status";
import { ErrorBox } from "./ui";

const KINDS: [MessageKind, string][] = [["general", "一般"], ["note", "筆記"], ["tactic", "戰術"]];
const MAX = 2000;

export function ChatComposer({ teamId, isCoach, lineups, parentId, onPosted, onCancel, autoFocus }: {
  teamId: string; isCoach: boolean; lineups: LineupRow[]; parentId?: string;
  onPosted: (id: string) => void; onCancel?: () => void; autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<MessageKind>("general");
  const [lineupId, setLineupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isReply = !!parentId;

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    if (text.length > MAX) { setError(`最多 ${MAX} 個字`); return; }
    setBusy(true); setError("");
    const r = await postMessage(teamId, text, isReply ? "general" : kind, parentId ?? null, isReply ? null : (lineupId || null));
    setBusy(false);
    if (r.status === "ok" && r.id) {
      setBody(""); setKind("general"); setLineupId("");
      onPosted(r.id);
    } else {
      setError(message(r));
    }
  };

  return (
    <div className={isReply ? "stack" : "panel pad stack"} style={{ gap: 8 }}>
      {error && <ErrorBox text={error} />}
      {!isReply && isCoach && (
        <div className="seg" role="radiogroup" aria-label="訊息類型">
          {KINDS.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
      )}
      <textarea className="field" value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX}
        placeholder={isReply ? "回覆…" : "想跟隊友說什麼？"} autoFocus={autoFocus} rows={isReply ? 2 : 3} />
      {!isReply && isCoach && lineups.length > 0 && (
        <label className="label" style={{ fontSize: 13 }}>附上正式陣容（選填）
          <select className="field" value={lineupId} onChange={(e) => setLineupId(e.target.value)} style={{ minHeight: 40 }}>
            <option value="">不附陣容</option>
            {lineups.map((l) => <option key={l.id} value={l.id}>{l.name || "（未命名）"} · {l.size} 人制 {l.formation}</option>)}
          </select>
        </label>
      )}
      <div className="chips">
        <button type="button" className="btn btn-main btn-sm" disabled={busy || !body.trim()} onClick={submit}>
          {busy ? "送出中…" : isReply ? "回覆" : "發文"}
        </button>
        {onCancel && <button type="button" className="btn btn-line btn-sm" onClick={onCancel}>取消</button>}
      </div>
    </div>
  );
}
