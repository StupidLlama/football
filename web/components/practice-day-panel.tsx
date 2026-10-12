"use client";
// 月曆上點一天之後的詳細內容：那天的練習（完整資訊、自己的出席、全隊登記狀況、管理員可以編輯／刪除／代登記），
// 以及那天的本隊比賽（只連過去，不能在這裡改）。
import Link from "next/link";
import { useState } from "react";
import { deletePractice, setPracticeAttendance, type AttendanceAnswer, type Match, type Practice } from "@/lib/api";
import { dayLabel } from "@/lib/calendar";
import { kickoffLabel } from "@/lib/matches";
import {
  answerOfPractice, groupPracticePlayers, hhmm, isPracticeLocked, practiceCounts, restOfSeriesCount, timeRange, titleOf,
} from "@/lib/practices";
import { useTeamView } from "@/lib/team";
import { AttendanceButtons } from "./attendance-buttons";
import { ConfirmButton } from "./confirm-button";
import { useToast } from "./ui";

const BUCKET_LABEL = { in: "出席", out: "請假", pending: "還沒回覆" } as const;

function AdminRow({ practiceId, playerId, name, status, onChanged }: {
  practiceId: string; playerId: string; name: string; status: AttendanceAnswer | null; onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const set = async (next: AttendanceAnswer | null) => {
    setBusy(true);
    try { await setPracticeAttendance(practiceId, next, "", playerId); await onChanged(); } finally { setBusy(false); }
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

function PracticeCard({ p, canManage, now, onEdit }: { p: Practice; canManage: boolean; now: Date; onEdit: (p: Practice) => void }) {
  const v = useTeamView();
  const say = useToast();
  const myId = v.myPlayer?.id ?? null;
  const rows = v.data.practiceAttendance;
  const locked = isPracticeLocked(p, now);
  const counts = practiceCounts(rows, p.id, v.players.length);
  const groups = groupPracticePlayers(v.players, rows, p.id);
  const rest = restOfSeriesCount(v.data.practices, p);

  const onAnswer = async (next: AttendanceAnswer | null) => {
    if (!myId) return;
    const r = await setPracticeAttendance(p.id, next);
    if (r.status === "ok") { say(next === "in" ? "已登記出席" : next === "out" ? "已登記請假" : "已清掉登記"); await v.reload(); }
    else say(r.detail ?? "登記失敗");
  };

  const remove = async (restOfSeries: boolean) => {
    const r = await deletePractice(p.id, restOfSeries);
    if (r.status === "ok") { say(`已刪除 ${r.deleted ?? 1} 次練習`); await v.reload(); }
    else say(r.detail ?? "刪除失敗");
  };

  return (
    <article className="panel pad stack" style={{ gap: 10, background: "var(--panel-2)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>{titleOf(p)}</h3>
        <span className="num" style={{ fontSize: 18 }}>{timeRange(p)}</span>
      </header>
      <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {p.meet_at && <span className="pill">集合 {hhmm(p.meet_at)}</span>}
        {p.location && <span className="pill">{p.location}</span>}
        {p.series_id && <span className="pill">固定練習</span>}
        <span className="pill">{locked ? "已開始" : "即將進行"}</span>
      </p>
      {p.content && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{p.content}</p>}
      {p.note && <p className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{p.note}</p>}
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>出席 {counts.in}・請假 {counts.out}・還沒回覆 {counts.pending}</p>

      {myId && (
        <div className="stack" style={{ gap: 6 }}>
          <b>你的出席登記</b>
          <AttendanceButtons answer={answerOfPractice(rows, p.id, myId)} locked={locked} onAnswer={onAnswer} what="練習" />
        </div>
      )}

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>全隊登記狀況</summary>
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          {(["in", "out", "pending"] as const).map((b) => (
            <details key={b} open={b !== "pending" || groups.pending.length <= 8}>
              <summary style={{ cursor: "pointer" }}>{BUCKET_LABEL[b]}（{groups[b].length}）</summary>
              {groups[b].length === 0 && <p className="faint" style={{ margin: "4px 0" }}>沒有人。</p>}
              <div className="stack" style={{ gap: 0 }}>
                {groups[b].map((pl) => canManage ? (
                  <AdminRow key={pl.id} practiceId={p.id} playerId={pl.id} name={pl.name}
                    status={answerOfPractice(rows, p.id, pl.id)} onChanged={v.reload} />
                ) : (
                  <div key={pl.id} className="row">
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {pl.name}{pl.id === myId && <span className="faint" style={{ marginLeft: 8, fontSize: 13 }}>（你）</span>}
                      {(() => { const n = rows.find((a) => a.practice_id === p.id && a.player_id === pl.id)?.note; return n ? <span className="faint" style={{ marginLeft: 8, fontSize: 13 }}>{n}</span> : null; })()}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </details>

      {canManage && (
        <div className="chips" style={{ borderTop: "1px solid #22304A", paddingTop: 10 }}>
          <button type="button" className="btn btn-line btn-sm" onClick={() => onEdit(p)}>編輯這次</button>
          <ConfirmButton label="刪除這次" confirm="確定刪除？" onConfirm={() => remove(false)} />
          {p.series_id && rest > 1 && (
            <ConfirmButton label={`刪除這次和之後 ${rest - 1} 次`} confirm={`確定刪 ${rest} 次？`} onConfirm={() => remove(true)} />
          )}
        </div>
      )}
    </article>
  );
}

export function PracticeDayPanel({ teamId, day, practices, matches, canManage, now, onEdit, onAdd }: {
  teamId: string; day: string; practices: Practice[]; matches: Match[]; canManage: boolean; now: Date;
  onEdit: (p: Practice) => void; onAdd: (day: string) => void;
}) {
  const empty = practices.length === 0 && matches.length === 0;
  return (
    <aside className="stack" style={{ gap: 12 }} aria-label={`${dayLabel(day)}的內容`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{dayLabel(day)}</h2>
        {canManage && <button type="button" className="btn btn-line btn-sm" onClick={() => onAdd(day)}>＋ 這天新增練習</button>}
      </div>
      {empty && <p className="faint" style={{ margin: 0 }}>這天沒有練習或比賽。</p>}
      {practices.map((p) => <PracticeCard key={p.id} p={p} canManage={canManage} now={now} onEdit={onEdit} />)}
      {matches.map((m) => (
        <Link key={m.id} href={`/t/${teamId}/matches/${m.id}`} className="panel pad" style={{ display: "block", color: "var(--text)", textDecoration: "none", borderColor: "#6B4A12" }}>
          <b>比賽 vs {m.opponent}</b>
          <span className="faint" style={{ display: "block", fontSize: 14 }}>
            {kickoffLabel(m.kickoff)}{m.location ? ` · ${m.location}` : ""}　去比賽頁看詳情 ›
          </span>
        </Link>
      ))}
    </aside>
  );
}
