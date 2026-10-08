"use client";
// 一則聊天室貼文：作者、時間、類型標籤、附的陣容、置頂／編輯／刪除、回覆列表。
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { deleteMessage, editMessage, setPinned, type LineupRow, type Message } from "@/lib/api";
import { canDeleteMessage, canEditMessage, kindLabel, relativeTime, type Thread } from "@/lib/chat";
import { message as statusMessage } from "@/lib/status";
import { ConfirmButton } from "./confirm-button";
import { ErrorBox, useToast } from "./ui";

const KIND_STYLE = { note: { background: "rgba(96,165,250,.16)", color: "#BFDBFE" }, tactic: { background: "rgba(245,165,36,.18)", color: "#FFD38A" } } as const;

function Row({ m, teamId, myUserId, isCoach, nameOf, lineups, now, onChanged, isReply }: {
  m: Message; teamId: string; myUserId: string; isCoach: boolean; nameOf: (userId: string) => string;
  lineups: LineupRow[]; now: Date; onChanged: () => void; isReply: boolean;
}) {
  const say = useToast();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(m.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const author = m.author_id ? nameOf(m.author_id) : "（已離開的成員）";
  const lineup = m.lineup_id ? lineups.find((l) => l.id === m.lineup_id) ?? null : null;
  const label = kindLabel(m.kind);

  const saveEdit = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true); setError("");
    const r = await editMessage(m.id, text);
    setBusy(false);
    if (r.status === "ok") { setEditing(false); onChanged(); } else setError(statusMessage(r));
  };

  const onDelete = async () => {
    const r = await deleteMessage(m.id);
    if (r.status === "ok") { say("已刪除"); onChanged(); } else say(statusMessage(r));
  };
  const togglePin = async () => {
    const r = await setPinned(m.id, !m.pinned_at);
    if (r.status === "ok") onChanged(); else say(statusMessage(r));
  };

  if (m.deleted_at) {
    return <p className="faint" style={{ margin: 0, fontSize: 14, fontStyle: "italic" }}>這則訊息已刪除</p>;
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <b style={{ fontSize: isReply ? 14 : 16 }}>{author}</b>
        {label && <span className="tag" style={{ ...KIND_STYLE[m.kind as "note" | "tactic"], border: "none" }}>{label}</span>}
        {m.pinned_at && !isReply && <span className="tag" style={{ border: "1px solid #F5A524", color: "#F5A524" }}>已置頂</span>}
        <span className="faint" style={{ fontSize: 13 }}>{relativeTime(m.created_at, now)}{m.edited_at ? "（已編輯）" : ""}</span>
      </div>

      {error && <ErrorBox text={error} />}
      {editing ? (
        <div className="stack" style={{ gap: 8 }}>
          <textarea className="field" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={isReply ? 2 : 3} autoFocus />
          <div className="chips">
            <button type="button" className="btn btn-main btn-sm" disabled={busy || !body.trim()} onClick={saveEdit}>{busy ? "儲存中…" : "儲存"}</button>
            <button type="button" className="btn btn-line btn-sm" onClick={() => { setEditing(false); setBody(m.body); setError(""); }}>取消</button>
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</p>
      )}

      {lineup && !editing && (
        <Link className="pill" href={`/t/${teamId}/lineup?open=${lineup.id}`} style={{ alignSelf: "flex-start" }}>
          ▦ {lineup.name || "（未命名）"} · {lineup.size} 人制 {lineup.formation}
        </Link>
      )}

      {!editing && (
        <div className="chips">
          {canEditMessage(m, myUserId) && <button type="button" className="btn btn-text btn-sm" onClick={() => setEditing(true)}>編輯</button>}
          {canDeleteMessage(m, myUserId, isCoach) && <ConfirmButton label="刪除" confirm="確定刪除？" className="btn btn-text btn-sm" onConfirm={onDelete} />}
          {isCoach && !isReply && <button type="button" className="btn btn-text btn-sm" onClick={togglePin}>{m.pinned_at ? "取消置頂" : "置頂"}</button>}
        </div>
      )}
    </div>
  );
}

export function ChatMessage({ thread, teamId, myUserId, isCoach, nameOf, lineups, now, onChanged, open, onToggleOpen, reply }: {
  thread: Thread; teamId: string; myUserId: string; isCoach: boolean; nameOf: (userId: string) => string;
  lineups: LineupRow[]; now: Date; onChanged: () => void; open: boolean; onToggleOpen: () => void;
  reply: ReactNode;
}) {
  const { post, replies } = thread;
  return (
    <article className="panel pad stack" style={{ gap: 10, borderLeft: post.pinned_at ? "3px solid #F5A524" : undefined }}>
      <Row m={post} teamId={teamId} myUserId={myUserId} isCoach={isCoach} nameOf={nameOf} lineups={lineups} now={now} onChanged={onChanged} isReply={false} />
      <button type="button" className="btn btn-text btn-sm" style={{ alignSelf: "flex-start" }} onClick={onToggleOpen}>
        {open ? "收起回覆" : replies.length > 0 ? `${replies.length} 則回覆` : "回覆"}
      </button>
      {open && (
        <div className="stack" style={{ gap: 10, marginLeft: 16, paddingLeft: 12, borderLeft: "1px solid #22304A" }}>
          {replies.map((r) => (
            <Row key={r.id} m={r} teamId={teamId} myUserId={myUserId} isCoach={isCoach} nameOf={nameOf} lineups={lineups} now={now} onChanged={onChanged} isReply />
          ))}
          {reply}
        </div>
      )}
    </article>
  );
}
