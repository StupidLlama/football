"use client";
// 比賽列表（F7 出賽登記 + F4 的「即將進行／已結束」部分）。
// 已分析、跑動數據、表現評分是 v3/v4 影片分析的事，這裡不做。
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { matchFromFixture, setAttendance, type AttendanceAnswer } from "@/lib/api";
import { answerOf, countsFor, importableFixtures, isLocked, kickoffLabel, scoreLabel, splitGames } from "@/lib/matches";
import { useTeamView } from "@/lib/team";
import { AttendanceButtons } from "@/components/attendance-buttons";
import { MatchForm } from "@/components/match-form";
import { useNow, useToast } from "@/components/ui";

type Tab = "upcoming" | "done";

export default function MatchesPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const router = useRouter();
  const v = useTeamView();
  const say = useToast();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [creating, setCreating] = useState(false);

  const { upcoming, done } = splitGames(v.data.matches, now);
  const importable = v.isCoach ? importableFixtures(v.data.fixtures, v.data.matches, v.data.team.league_name, now) : [];
  const myId = v.myPlayer?.id ?? null;
  const roster = v.players.length;
  const list = tab === "upcoming" ? upcoming : done;

  const onAnswer = async (matchId: string, next: AttendanceAnswer | null) => {
    const r = await setAttendance(matchId, next);
    if (r.status === "ok") { say(next === "in" ? "已登記出席" : next === "out" ? "已登記請假" : "已清掉登記"); await v.reload(); }
    else say(r.detail ?? "登記失敗");
  };

  const onImport = async (fixtureId: string) => {
    const r = await matchFromFixture(teamId, fixtureId);
    if (r.status === "ok") { say(r.existed ? "這場比賽已經建立過了" : "已建立比賽"); await v.reload(); }
    else say(r.detail ?? "建立失敗");
  };

  return (
    <section className="stack" style={{ gap: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 className="hide-sm" style={{ margin: 0, fontSize: 30 }}>比賽</h1>
        {v.isCoach && !creating && <button type="button" className="btn btn-main btn-sm" onClick={() => setCreating(true)}>＋ 新增比賽</button>}
      </header>

      {creating && (
        <MatchForm teamId={teamId} match={null}
          onSaved={(id) => { setCreating(false); say("已建立比賽"); v.reload(); router.push(`/t/${teamId}/matches/${id}`); }}
          onCancel={() => setCreating(false)} />
      )}

      {v.isCoach && importable.length > 0 && (
        <details className="panel pad">
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>從系際聯賽賽程帶入（{importable.length}）</summary>
          <p className="faint" style={{ fontSize: 13, margin: "8px 0" }}>
            聯賽賽程表上還沒建立成比賽的場次；建立後兩邊會連起來，之後聯賽賽程改了比分不會自動同步過來。
          </p>
          <div className="stack" style={{ gap: 2 }}>
            {importable.map((f) => (
              <div key={f.id} className="row" style={{ flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>vs {f.home === v.data.team.league_name ? f.away : f.home}</b>
                  <span className="faint" style={{ marginLeft: 8, fontSize: 14 }}>
                    {f.day.slice(5).replace("-", "/")} {f.start_time?.slice(0, 5)}{f.round !== null ? ` · 第 ${f.round} 輪` : ""}
                  </span>
                </span>
                <button type="button" className="btn btn-line btn-sm" onClick={() => onImport(f.id)}>建立比賽</button>
              </div>
            ))}
          </div>
        </details>
      )}

      <div role="radiogroup" aria-label="比賽狀態" className="seg">
        <button type="button" role="radio" aria-checked={tab === "upcoming"} onClick={() => setTab("upcoming")}>即將進行（{upcoming.length}）</button>
        <button type="button" role="radio" aria-checked={tab === "done"} onClick={() => setTab("done")}>已結束（{done.length}）</button>
      </div>

      {list.length === 0 && <p className="faint">{tab === "upcoming" ? "目前沒有排定的比賽。" : "還沒有比賽結束。"}</p>}

      <div className="stack" style={{ gap: 12 }}>
        {list.map((m) => {
          const c = countsFor(v.data.attendance, m.id, roster);
          const mine = myId ? answerOf(v.data.attendance, m.id, myId) : null;
          return (
            <div key={m.id} className="panel pad stack" style={{ gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <Link href={`/t/${teamId}/matches/${m.id}`} style={{ fontSize: 20, fontWeight: 700 }}>vs {m.opponent}</Link>
                {tab === "done" && scoreLabel(m) && <span className="num" style={{ fontSize: 20 }}>{scoreLabel(m)}</span>}
              </div>
              <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <span className="pill">{kickoffLabel(m.kickoff)}</span>
                {m.jersey && <span className="pill">球衣 {m.jersey}</span>}
                {m.location && <span className="pill">{m.location}</span>}
                <span className="pill">{m.size} 人制</span>
              </p>
              <p className="faint" style={{ margin: 0, fontSize: 13 }}>出席 {c.in}・請假 {c.out}・還沒回覆 {c.pending}</p>
              {tab === "upcoming" && myId && <AttendanceButtons answer={mine} locked={isLocked(m, now)} onAnswer={(next) => onAnswer(m.id, next)} />}
              <div className="chips">
                <Link className="btn btn-line btn-sm" href={`/t/${teamId}/matches/${m.id}`}>詳情</Link>
                {tab === "upcoming" && <Link className="btn btn-line btn-sm" href={`/t/${teamId}/lineup?match=${m.id}`}>去排陣容</Link>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
