"use client";
// 球隊首頁：待辦、下一場（黃框倒數）、近期戰績、即將比賽、比賽結果、裁判任務、球員名單。
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTeamView } from "@/lib/team";
import { record, whenLabel, type MatchView, type Result } from "@/lib/teamview";
import { todosFor } from "@/lib/todos";
import { TodoCards } from "@/components/todos";
import { CaptainBadge, PosTag, RoleBadge } from "@/components/ui";

const RES: Record<Result, [string, string, string]> = { W: ["勝", "#2DD4BF", "#06201C"], D: ["和", "#64748B", "#FFFFFF"], L: ["負", "#FB7185", "#2A0A10"] };

function ResultChip({ r }: { r: Result }) {
  return (
    <span title={RES[r][0]} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, flex: "none",
      borderRadius: 8, fontWeight: 700, fontSize: 14, background: RES[r][1], color: RES[r][2] }}>
      <span aria-hidden="true">{r}</span><span className="sr-only">{RES[r][0]}</span>
    </span>
  );
}

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

function NextMatch({ m, now }: { m: MatchView; now: Date }) {
  const ms = Math.max(0, m.kickoff.getTime() - now.getTime());
  const days = Math.floor(ms / 86_400_000), hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return (
    <section aria-labelledby="next-h" className="panel" style={{ marginTop: 24, padding: 24, border: "2px solid #F5A524",
      boxShadow: "0 0 0 4px rgba(245,165,36,.12)", display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ minWidth: 0 }}>
        <h2 id="next-h" className="accent" style={{ margin: "0 0 4px", fontSize: 22 }}>下一場</h2>
        <p style={{ margin: "0 0 12px", fontSize: 36, fontWeight: 700, lineHeight: 1.2 }}>vs {m.opp}</p>
        <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span className="pill">{whenLabel(m.fixture, true)}</span><span className="pill">{m.side}</span>
          {m.fixture.round !== null && <span className="pill">第 {m.fixture.round} 輪</span>}
        </p>
      </div>
      <p style={{ margin: 0, display: "flex", gap: 16, alignItems: "flex-end" }} aria-label={`還有 ${days} 天 ${hours} 小時`}>
        <span style={{ textAlign: "center" }}><span className="num" style={{ display: "block", fontSize: 64, lineHeight: 1 }}>{days}</span><span className="faint" style={{ fontSize: 14 }}>天</span></span>
        <span style={{ textAlign: "center" }}><span className="num" style={{ display: "block", fontSize: 64, lineHeight: 1 }}>{String(hours).padStart(2, "0")}</span><span className="faint" style={{ fontSize: 14 }}>小時</span></span>
      </p>
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

  return (
    <>
      <header className="hide-sm" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 30 }}>{v.data.team.name}</h1>
        <RoleBadge coach={v.isCoach} long />
      </header>

      <section aria-labelledby="todo-h" style={{ marginTop: 16 }}>
        <h2 id="todo-h" className="accent" style={{ margin: "0 0 12px", fontSize: 22 }}>我的待辦</h2>
        <TodoCards todos={todos} />
      </section>

      {upcoming[0] ? <NextMatch m={upcoming[0]} now={now} /> : (
        <section className="panel" style={{ marginTop: 24, padding: 20, border: "2px dashed #F5A52466" }}>
          <h2 className="accent" style={{ margin: "0 0 4px", fontSize: 22 }}>下一場</h2>
          <p className="muted" style={{ margin: 0 }}>{noLeague ? "這一隊還沒設定聯賽隊名，賽程對不起來。請球隊管理員在管理專區設定。" : "目前沒有排定的比賽。"}</p>
        </section>
      )}

      {last5.length > 0 && (
        <section aria-label="近期戰績" style={{ marginTop: 16, padding: "12px 24px", borderRadius: 16, border: "1px solid #22304A", display: "flex",
          flexWrap: "wrap", gap: "12px 24px", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, marginRight: 4 }}>近 {last5.length} 場</span>
            {last5.map((m) => <ResultChip key={m.fixture.id} r={m.result!} />)}
          </div>
          <span className="muted">{rec.w} 勝 {rec.d} 和 {rec.l} 負，進 {rec.gf} 失 {rec.ga}，積分 {rec.points}</span>
        </section>
      )}

      <div className="grid2" style={{ marginTop: 16 }}>
        <section aria-labelledby="up-h" className="panel" style={{ padding: "16px 24px" }}>
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
        <section aria-labelledby="res-h" className="panel" style={{ padding: "16px 24px" }}>
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

      <section aria-labelledby="duty-h" className="panel" style={{ marginTop: 16, padding: "16px 24px" }}>
        <h2 id="duty-h" style={{ margin: "0 0 8px", fontSize: 20 }}>裁判任務</h2>
        {duties.length === 0 && <p className="faint" style={{ margin: 0 }}>接下來沒有裁判任務。</p>}
        {duties.slice(0, 8).map((d) => {
          const mine = !!d.player_id && d.player_id === v.me.player_id;
          return (
            <div key={d.id} className="row" style={{ flexWrap: "wrap" }}>
              <span className="faint" style={{ width: 128, flex: "none", fontSize: 14 }}>{d.fixture ? whenLabel(d.fixture) : ""}</span>
              <span style={{ flex: "1 1 160px", minWidth: 0 }}><b>{d.fixture ? `${d.fixture.home} vs ${d.fixture.away}` : "比賽"}</b><br />
                <span className="faint" style={{ fontSize: 14 }}>{d.role}</span></span>
              <span className="tag" style={mine ? { background: "#F5A524", color: "#1A1206", fontWeight: 700 }
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
