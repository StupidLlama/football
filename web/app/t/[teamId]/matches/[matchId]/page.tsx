"use client";
// 比賽詳情：完整資訊、出席登記（自己 + 球隊管理員可以幫全隊登記）、去排陣容。
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { deleteMatch, setAttendance, type AttendanceAnswer } from "@/lib/api";
import { answerOf, groupPlayers, isLocked, kickoffLabel, meetLabel, scoreLabel } from "@/lib/matches";
import { useTeamView } from "@/lib/team";
import { AttendanceButtons } from "@/components/attendance-buttons";
import { ConfirmButton } from "@/components/confirm-button";
import { MatchForm } from "@/components/match-form";
import { ErrorBox, useNow, useToast } from "@/components/ui";

const BUCKET_LABEL = { in: "出席", out: "請假", pending: "還沒回覆" } as const;

function AdminRow({ matchId, playerId, name, status, locked, onChanged }: {
  matchId: string; playerId: string; name: string; status: AttendanceAnswer | null; locked: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const set = async (next: AttendanceAnswer | null) => {
    setBusy(true);
    try { await setAttendance(matchId, next, "", playerId); await onChanged(); } finally { setBusy(false); }
  };
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 0 }}>{name}</span>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={status === "in"} disabled={busy} onClick={() => set(status === "in" ? null : "in")}>出席</button>
        <button type="button" className="chip" aria-pressed={status === "out"} disabled={busy} onClick={() => set(status === "out" ? null : "out")}>請假</button>
      </div>
    </div>
  );
}

export default function MatchDetailPage() {
  const { teamId, matchId } = useParams<{ teamId: string; matchId: string }>();
  const router = useRouter();
  const v = useTeamView();
  const say = useToast();
  const now = useNow();
  const [editing, setEditing] = useState(false);

  const m = v.data.matches.find((x) => x.id === matchId);
  if (!m) {
    return (
      <section className="stack" style={{ gap: 16 }}>
        <ErrorBox text="找不到這場比賽，可能已經被刪除了。" />
        <Link className="btn btn-line btn-sm" href={`/t/${teamId}/matches`} style={{ alignSelf: "flex-start" }}>回比賽列表</Link>
      </section>
    );
  }

  const myId = v.myPlayer?.id ?? null;
  const myAnswer = myId ? answerOf(v.data.attendance, m.id, myId) : null;
  const locked = isLocked(m, now);
  const groups = groupPlayers(v.players, v.data.attendance, m.id);
  const done = m.our_score !== null;

  const onAnswer = async (next: AttendanceAnswer | null) => {
    if (!myId) return;
    const r = await setAttendance(m.id, next);
    if (r.status === "ok") { say(next === "in" ? "已登記出席" : next === "out" ? "已登記請假" : "已清掉登記"); await v.reload(); }
    else say(r.detail ?? "登記失敗");
  };

  const onDelete = async () => {
    const r = await deleteMatch(m.id);
    if (r.status === "ok") { say("已刪除"); await v.reload(); router.push(`/t/${teamId}/matches`); }
    else say(r.detail ?? "刪除失敗");
  };

  if (editing) {
    return (
      <section className="stack" style={{ gap: 16 }}>
        <h1 className="hide-sm" style={{ margin: 0, fontSize: 30 }}>編輯比賽</h1>
        <MatchForm teamId={teamId} match={m} onSaved={async () => { setEditing(false); say("已儲存"); await v.reload(); }}
          onCancel={() => setEditing(false)} />
      </section>
    );
  }

  return (
    <section className="stack" style={{ gap: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 className="hide-sm" style={{ margin: 0, fontSize: 30 }}>vs {m.opponent}</h1>
        {v.isCoach && (
          <div className="chips">
            <button type="button" className="btn btn-line btn-sm" onClick={() => setEditing(true)}>編輯</button>
            <ConfirmButton label="刪除" confirm="確定刪除？" onConfirm={onDelete} className="btn btn-danger btn-sm" />
          </div>
        )}
      </header>

      <div className="panel pad stack" style={{ gap: 8 }}>
        <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span className="pill">{kickoffLabel(m.kickoff)}</span>
          {m.meet_at && <span className="pill">集合 {meetLabel(m.meet_at, m.kickoff)}</span>}
          {m.jersey && <span className="pill">球衣 {m.jersey}</span>}
          {m.location && <span className="pill">{m.location}</span>}
          <span className="pill">{m.size} 人制</span>
        </p>
        {done && <p style={{ margin: 0 }}>比分：<span className="num" style={{ fontSize: 22 }}>{scoreLabel(m)}</span></p>}
        {m.note && <p className="muted" style={{ margin: 0 }}>{m.note}</p>}
      </div>

      {myId && (
        <div className="panel pad stack" style={{ gap: 8 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>你的出賽登記</p>
          <AttendanceButtons answer={myAnswer} locked={locked} onAnswer={onAnswer} />
        </div>
      )}

      <div className="panel pad">
        <p style={{ margin: "0 0 4px", fontWeight: 700 }}>去排陣容</p>
        <p className="faint" style={{ margin: "0 0 8px", fontSize: 13 }}>只排得到登記「出席」的人。</p>
        <Link className="btn btn-line btn-sm" href={`/t/${teamId}/lineup?match=${m.id}`}>排這場的陣容</Link>
      </div>

      <div className="panel pad stack" style={{ gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>全隊登記狀況</p>
        {(["in", "out", "pending"] as const).map((b) => (
          <details key={b} open={b !== "pending" || groups.pending.length <= 8}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{BUCKET_LABEL[b]}（{groups[b].length}）</summary>
            {groups[b].length === 0 && <p className="faint" style={{ margin: "4px 0" }}>沒有人。</p>}
            <div className="stack" style={{ gap: 0 }}>
              {groups[b].map((p) => v.isCoach ? (
                <AdminRow key={p.id} matchId={m.id} playerId={p.id} name={p.name}
                  status={answerOf(v.data.attendance, m.id, p.id)} locked={false} onChanged={v.reload} />
              ) : (
                <div key={p.id} className="row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {p.name}
                    {p.id === myId && <span className="faint" style={{ marginLeft: 8, fontSize: 13 }}>（你）</span>}
                  </span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
