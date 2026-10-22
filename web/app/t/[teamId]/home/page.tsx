"use client";
// 球隊首頁（v2.11 戰情室）：待辦、下一場（大區塊＋倒數＋出席比例）、近期戰績、即將比賽、比賽結果、裁判任務、球員名單。
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { setAttendance, type AttendanceAnswer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { answerOf, countdown, countsFor, isLocked, kickoffLabel, meetLabel, splitGames } from "@/lib/matches";
import { useTeamView } from "@/lib/team";
import { record, whenLabel, type MatchView } from "@/lib/teamview";
import { todosFor } from "@/lib/todos";
import { AttendanceButtons } from "@/components/attendance-buttons";
import { TodoCards } from "@/components/todos";
import { AttendBar, CaptainBadge, PosTag, ResultChip, RoleBadge, useNow, useToast } from "@/components/ui";

function Countdown({ iso, now }: { iso: string; now: Date }) {
  const { days, hours } = countdown(iso, now);
  return (
    <p style={{ margin: 0, display: "flex", gap: 6, alignItems: "baseline" }} aria-label={`還有 ${days} 天 ${hours} 小時`}>
      <span className="num" style={{ fontSize: 64, lineHeight: 1, fontWeight: 600 }}>{days}</span><span className="muted">天</span>
      <span className="num" style={{ fontSize: 64, lineHeight: 1, fontWeight: 600, marginLeft: 8 }}>{String(hours).padStart(2, "0")}</span><span className="muted">小時</span>
    </p>
  );
}

/** 我們自己建立的下一場比賽（v2.5）：有這個就優先顯示，旁邊直接放出席／請假按鈕。 */
function NextGame({ teamId, now }: { teamId: string; now: Date }) {
  const v = useTeamView();
  const say = useToast();
  const m = splitGames(v.data.matches, now).upcoming[0];
  if (!m) return null;
  const myId = v.myPlayer?.id ?? null;
  const answer = myId ? answerOf(v.data.attendance, m.id, myId) : null;

  const onAnswer = async (next: AttendanceAnswer | null) => {
    if (!myId) return;
    const r = await setAttendance(m.id, next);
    if (r.status === "ok") { say(next === "in" ? "已登記出席" : next === "out" ? "已登記請假" : "已清掉登記"); await v.reload(); }
    else say(r.detail ?? "登記失敗");
  };

  return (
    <section aria-labelledby="next-h" className="panel hero">
      <div style={{ flex: "2 1 300px", minWidth: 0 }}>
        <h2 id="next-h" className="hero-kicker">下一場</h2>
        <Link href={`/t/${teamId}/matches/${m.id}`} className="hero-title">vs {m.opponent}</Link>
        <dl className="dl-grid">
          <div><dt>開賽</dt><dd className="num" style={{ fontSize: 18 }}>{kickoffLabel(m.kickoff)}</dd></div>
          {m.meet_at && <div><dt>集合</dt><dd className="num" style={{ fontSize: 18 }}>{meetLabel(m.meet_at, m.kickoff)}</dd></div>}
          {m.location && <div><dt>地點</dt><dd>{m.location}</dd></div>}
          <div><dt>球衣・賽制</dt><dd>{m.jersey ? `${m.jersey} · ` : ""}{m.size} 人制</dd></div>
        </dl>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 20 }}>
          {myId && <AttendanceButtons answer={answer} locked={isLocked(m, now)} onAnswer={onAnswer} />}
          {!v.archived && <Link href={`/t/${teamId}/lineup?match=${m.id}`} style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 8px" }}>排這場的陣容 ›</Link>}
        </div>
      </div>
      <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 20 }}>
        <Countdown iso={m.kickoff} now={now} />
        <AttendBar c={countsFor(v.data.attendance, m.id, v.players.length)} />
      </div>
    </section>
  );
}

function NextMatch({ m, now }: { m: MatchView; now: Date }) {
  return (
    <section aria-labelledby="next-h" className="panel hero">
      <div style={{ flex: "2 1 300px", minWidth: 0 }}>
        <h2 id="next-h" className="hero-kicker">下一場（聯賽賽程）{m.fixture.round !== null && ` · 第 ${m.fixture.round} 輪`}</h2>
        <p className="hero-title">vs {m.opp}</p>
        <dl className="dl-grid">
          <div><dt>開賽</dt><dd className="num" style={{ fontSize: 18 }}>{whenLabel(m.fixture, true)}</dd></div>
          <div><dt>主客場</dt><dd>{m.side}</dd></div>
        </dl>
      </div>
      <Countdown iso={m.kickoff.toISOString()} now={now} />
    </section>
  );
}

export default function TeamHome() {
  const { teamId } = useParams<{ teamId: string }>();
  const v = useTeamView();
  const auth = useAuth();
  const router = useRouter();
  const now = useNow();
  const todos = todosFor(v, teamId, !!auth.profile?.is_admin, now).filter((t) => t.key !== "refill");
  const upcoming = v.matches.filter((m) => !m.result && m.kickoff.getTime() + 2 * 3_600_000 > now.getTime());
  const results = v.matches.filter((m) => m.result).reverse();
  const last5 = results.slice(0, 5).reverse();
  const rec = record(last5);
  const duties = v.duties.filter((d) => d.kickoff && d.kickoff.getTime() + 3_600_000 > now.getTime());
  const roster = v.players.slice().sort((a, b) => {
    const o = (x: typeof a) => (x.badge === "C" ? 0 : x.badge === "VC" ? 1 : 2);
    return o(a) - o(b) || (parseInt(a.jersey_number || "999", 10) - parseInt(b.jersey_number || "999", 10)) || a.name.localeCompare(b.name, "zh-Hant");
  });
  const noLeague = !v.data.team.league_name;
  const haveOwnGame = splitGames(v.data.matches, now).upcoming.length > 0;

  return (
    <>
      <header className="hide-sm" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 30 }}>{v.data.team.name}</h1>
        <RoleBadge coach={v.isCoach} long />
      </header>

      <section aria-labelledby="todo-h" style={{ marginTop: 16 }}>
        <h2 id="todo-h" style={{ margin: "0 0 12px", fontSize: 20 }}>我的待辦 {todos.length > 0 && <span className="num accent" style={{ fontSize: 18 }}>{todos.length}</span>}</h2>
        <TodoCards todos={todos} />
      </section>

      {haveOwnGame ? <NextGame teamId={teamId} now={now} /> : upcoming[0] ? <NextMatch m={upcoming[0]} now={now} /> : (
        <section className="panel" style={{ marginTop: 24, padding: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>下一場</h2>
          <p className="muted" style={{ margin: 0 }}>
            {noLeague ? "這一隊還沒設定聯賽隊名，賽程對不起來。" : "目前沒有排定的比賽。"}
            {v.isCoach && <> <Link href={`/t/${teamId}/matches`}>去「比賽」頁新增一場</Link>。</>}
          </p>
        </section>
      )}

      {last5.length > 0 && (
        <section aria-label="近期戰績" style={{ marginTop: 16, padding: "12px 0", borderBottom: "1px solid #1F2B42", display: "flex",
          flexWrap: "wrap", gap: "12px 24px", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, marginRight: 4 }}>近 {last5.length} 場</span>
            {last5.map((m) => <ResultChip key={m.fixture.id} r={m.result!} />)}
          </div>
          <span className="muted num" style={{ fontWeight: 600 }}>{rec.w}W {rec.d}D {rec.l}L · {rec.gf}–{rec.ga} · 積分 {rec.points}</span>
        </section>
      )}

      <div className="grid2" style={{ marginTop: 24, gap: "24px 40px" }}>
        <section aria-labelledby="up-h">
          <h2 id="up-h" style={{ margin: "0 0 8px", fontSize: 20 }}>即將比賽</h2>
          {upcoming.length === 0 && <p className="faint" style={{ margin: 0 }}>沒有排定的比賽。</p>}
          {upcoming.slice(0, 6).map((m) => (
            <div key={m.fixture.id} className="row">
              <span className="faint" style={{ width: 120, flex: "none", fontSize: 14 }}>{whenLabel(m.fixture)}</span>
              <span style={{ flex: 1, minWidth: 0 }}><b>vs {m.opp}</b>{m.fixture.round !== null && <><br /><span className="faint" style={{ fontSize: 14 }}>第 {m.fixture.round} 輪</span></>}</span>
              <span className="pill">{m.side}</span>
            </div>
          ))}
        </section>
        <section aria-labelledby="res-h">
          <h2 id="res-h" style={{ margin: "0 0 8px", fontSize: 20 }}>比賽結果</h2>
          {results.length === 0 && <p className="faint" style={{ margin: 0 }}>還沒有比賽結果。</p>}
          {results.slice(0, 6).map((m) => (
            <div key={m.fixture.id} className="row">
              <ResultChip r={m.result!} />
              <span style={{ flex: 1, minWidth: 0 }}><b>vs {m.opp}</b><br /><span className="faint" style={{ fontSize: 14 }}>{whenLabel(m.fixture)}</span></span>
              <span className="num" style={{ fontSize: 24 }}>{m.score}</span>
            </div>
          ))}
        </section>
      </div>

      <section aria-labelledby="duty-h" style={{ marginTop: 24 }}>
        <h2 id="duty-h" style={{ margin: "0 0 8px", fontSize: 20 }}>裁判任務</h2>
        {duties.length === 0 && <p className="faint" style={{ margin: 0 }}>接下來沒有裁判任務。</p>}
        {duties.slice(0, 8).map((d) => {
          const mine = !!d.player_id && d.player_id === v.me.player_id;
          return (
            <div key={d.id} className="row" style={{ flexWrap: "wrap" }}>
              <span className="faint" style={{ width: 128, flex: "none", fontSize: 14 }}>{d.fixture ? whenLabel(d.fixture) : ""}</span>
              <span style={{ flex: "1 1 160px", minWidth: 0 }}><b>{d.fixture ? `${d.fixture.home} vs ${d.fixture.away}` : "比賽"}</b><br />
                <span className="faint" style={{ fontSize: 14 }}>{d.role}</span></span>
              <span className="tag" style={mine ? { background: "#F59E0B", color: "#1A1206", fontWeight: 700 }
                : d.playerName ? { border: "1px solid #2E3D5C" } : { border: "1px dashed #FB7185", color: "#FB7185" }}>
                {mine ? "你" : d.playerName || "還沒排"}
              </span>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="roster-h" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
          <h2 id="roster-h" style={{ margin: 0, fontSize: 20 }}>球員名單（{roster.length}）</h2>
          <Link href={`/t/${teamId}/players`}>看全隊能力</Link>
        </div>
        {roster.length === 0 && <p className="faint">名單上還沒有人。隊友加入後選「申請新增名字」，球隊管理員確認就會出現在這裡。</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {roster.map((p) => (
            <button key={p.id} type="button" className="card-btn" onClick={() => router.push(`/t/${teamId}/players/${p.id}`)}
              aria-label={`打開${p.name}的球員報告`} style={p.badge ? { borderColor: "#3A4A6A" } : undefined}>
              <span aria-hidden="true" className="num" style={{ position: "absolute", right: 8, bottom: -14, fontSize: 80, lineHeight: 1, color: "rgba(233,237,243,.06)" }}>{p.jersey_number || "?"}</span>
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="num faint" style={{ fontSize: 19 }}>{p.jersey_number ? `#${p.jersey_number}` : "#—"}</span><CaptainBadge badge={p.badge} />
              </span>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{p.name}</span>
              <span className="faint" style={{ fontSize: 14, minHeight: 22 }}>{p.nickname}</span>
              <span className="tags">{p.good_positions.slice(0, 3).map((x) => <PosTag key={x} pos={x} />)}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
