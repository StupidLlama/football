"use client";
// 管理專區「賽季」分頁（v2.8，球隊管理員）：全隊出席率、全隊進步排行、開新賽季。
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getTeamProgress, startNewSeason } from "@/lib/api";
import { rateText, teamRates } from "@/lib/attendance-rate";
import { useAuth } from "@/lib/auth";
import { RULES } from "@/lib/config";
import { teamRanking, type TeamProgressResult } from "@/lib/progress";
import { message } from "@/lib/status";
import { useTeamView } from "@/lib/team";
import { useLeaveGuard } from "@/components/back-button";
import { ConfirmButton } from "@/components/confirm-button";
import { ErrorBox, Loading } from "@/components/ui";

export function SeasonPanel() {
  const v = useTeamView();
  return (
    <div className="stack" style={{ gap: 20 }}>
      <NewSeason />
      {!v.archived && <Rates />}
      <Ranking />
    </div>
  );
}

// ---------------------------------------------------------------- 全隊出席率
function Rates() {
  const v = useTeamView();
  const now = new Date();
  const rows = useMemo(
    () => teamRates(v.players.map((p) => p.id), v.data.matches, v.data.attendance, v.data.practices, v.data.practiceAttendance, now),
    [v.players, v.data.matches, v.data.attendance, v.data.practices, v.data.practiceAttendance], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const name = (id: string) => v.players.find((p) => p.id === id)?.name ?? "?";
  const cols = "minmax(0, 1fr) 88px 88px";
  return (
    <section className="panel pad" aria-labelledby="rates-h">
      <h2 id="rates-h" style={{ margin: "0 0 4px", fontSize: 20 }}>全隊出席率</h2>
      <p className="faint" style={{ margin: "0 0 8px", fontSize: 13 }}>
        只有球隊管理員看得到全隊；球員只看得到自己的。排序：練習出席率低的在前面。只算已經結束的場次，請假不算進去，已結束卻沒回覆的算沒到。
      </p>
      <div className="tbl" role="table" aria-label="全隊出席率">
        <div className="tr head" role="row" style={{ gridTemplateColumns: cols }}>
          <span role="columnheader">球員</span><span role="columnheader" style={{ textAlign: "right" }}>練習</span><span role="columnheader" style={{ textAlign: "right" }}>比賽</span>
        </div>
        {rows.map((r) => (
          <div key={r.playerId} className="tr" role="row" style={{ gridTemplateColumns: cols }}>
            <span role="cell">{name(r.playerId)}</span>
            <span role="cell" className="num" style={{ textAlign: "right" }} title={`出席 ${r.practice.attended} / 算 ${r.practice.counted} 次`}>{rateText(r.practice)}</span>
            <span role="cell" className="num" style={{ textAlign: "right" }} title={`出席 ${r.match.attended} / 算 ${r.match.counted} 場`}>{rateText(r.match)}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="faint pad" style={{ margin: 0 }}>名單上還沒有人。</p>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 全隊進步排行
function Ranking() {
  const v = useTeamView();
  const [res, setRes] = useState<TeamProgressResult | null>(null);
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    setRes(null); setError("");
    getTeamProgress(v.data.team.id)
      .then((r) => { if (!alive) return; if (r.status === "ok") setRes(r); else setError(message(r)); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [v.data.team.id, tries]);
  const rank = useMemo(() => (res?.players ? teamRanking(res.players, RULES) : null), [res]);
  const name = (id: string) => v.players.find((p) => p.id === id)?.name ?? "?";
  const cols = "28px minmax(0, 1fr) 64px 64px 72px";

  return (
    <section className="panel pad" aria-labelledby="rank-h">
      <h2 id="rank-h" style={{ margin: "0 0 4px", fontSize: 20 }}>全隊進步排行</h2>
      <p className="faint" style={{ margin: "0 0 8px", fontSize: 13 }}>
        每個人「最新一季」跟「上一季」的平均能力差；只有一季有能力表的人不排。只有球隊管理員看得到這張表。
      </p>
      {error && <ErrorBox text={error} onRetry={() => setTries((t) => t + 1)} />}
      {!error && !rank && <Loading />}
      {rank && rank.rows.length === 0 && <p className="faint" style={{ margin: 0 }}>目前還沒有人有兩季以上的能力表。開了新賽季、大家重填之後，這裡就會有排行。</p>}
      {rank && rank.rows.length > 0 && (
        <div className="tbl" role="table" aria-label="全隊進步排行">
          <div className="tr head" role="row" style={{ gridTemplateColumns: cols }}>
            <span role="columnheader">#</span><span role="columnheader">球員</span>
            <span role="columnheader" style={{ textAlign: "right" }}>上季</span><span role="columnheader" style={{ textAlign: "right" }}>這季</span>
            <span role="columnheader" style={{ textAlign: "right" }}>變化</span>
          </div>
          {rank.rows.map((r, i) => {
            const kind = r.delta > 0.005 ? "up" : r.delta < -0.005 ? "down" : "same";
            return (
              <div key={r.playerId} className="tr fade-up" role="row" style={{ gridTemplateColumns: cols, animationDelay: `${Math.min(i, 10) * 0.04}s` }}>
                <span role="cell" className="faint num">{i + 1}</span>
                <span role="cell">{name(r.playerId)}</span>
                <span role="cell" className="num faint" style={{ textAlign: "right" }}>{r.from.toFixed(2)}</span>
                <span role="cell" className="num" style={{ textAlign: "right" }}>{r.to.toFixed(2)}</span>
                <span role="cell" className="num" style={{ textAlign: "right", color: kind === "up" ? "#2DD4BF" : kind === "down" ? "#F5A524" : "#8A97AD" }}>
                  <span aria-hidden="true">{kind === "up" ? "▲" : kind === "down" ? "▼" : "＝"} </span>{r.delta > 0 ? "+" : ""}{r.delta.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {rank && rank.noData.length > 0 && rank.rows.length > 0 && (
        <p className="faint" style={{ margin: "8px 0 0", fontSize: 13 }}>另外 {rank.noData.length} 人只有一季有能力表，沒有排進去。</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 開新賽季
function NewSeason() {
  const v = useTeamView();
  const auth = useAuth();
  const t = v.data.team;
  const [season, setSeason] = useState("");
  const [name, setName] = useState(t.name);
  const [keepJersey, setKeepJersey] = useState(true);
  const [keepBadge, setKeepBadge] = useState(true);
  const [announce, setAnnounce] = useState(true);
  const [text, setText] = useState("");
  const [discord, setDiscord] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ id: string; code: string; players: number; members: number; chat: boolean } | null>(null);
  const seasonName = season.trim();
  const defaultText = `新賽季「${seasonName || "…"}」開始了！名單和帳號都已經帶過來，不用重新加入。請到「能力表」重填這一季的能力表（舊的還在，球員報告的「進步」分頁會拿來比較）。`;
  const shownText = text || defaultText;
  const guard = useLeaveGuard(!done && seasonName !== "");

  if (t.archived_at) {
    return (
      <section className="panel pad">
        <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>開新賽季</h2>
        <p className="muted" style={{ margin: 0 }}>這一季已經封存了，只能看。要開新的一季，請到最新的賽季的管理專區。</p>
      </section>
    );
  }
  if (!v.isCoach) return null;

  if (done) {
    return (
      <section className="panel pad" role="status" style={{ borderLeft: "4px solid #2DD4BF" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>新賽季開好了</h2>
        <p style={{ margin: "0 0 8px" }}>帶過去 {done.players} 位球員、{done.members} 個帳號{done.chat ? "；已在新賽季的聊天室發出通知" : ""}。舊賽季已經封存（只能看）。</p>
        <p className="faint" style={{ margin: "0 0 12px", fontSize: 14 }}>新賽季的 Team ID：<b className="num" style={{ color: "#E9EDF3", letterSpacing: "0.06em" }}>{done.code}</b>（舊的 Team ID 不能再用來加入）。</p>
        <Link className="btn btn-main" href={`/t/${done.id}/coach?tab=roster`}>進入新賽季，檢查名單</Link>
      </section>
    );
  }

  async function submit() {
    setBusy(true); setError("");
    const r = await startNewSeason({ team: t.id, season: seasonName, teamName: name.trim() || null, keepJersey, keepBadge,
      notice: announce ? shownText : "", toDiscord: announce && discord });
    setBusy(false);
    if (r.status !== "ok" || !r.team_id) { setError(message(r)); return; }
    await auth.reload();
    setDone({ id: r.team_id, code: r.code ?? "", players: r.players ?? 0, members: r.members ?? 0, chat: !!r.chat });
  }

  const onForm = (e: FormEvent) => { e.preventDefault(); };
  const ready = seasonName.length >= 1 && seasonName.length <= 20 && seasonName !== (t.season ?? "").trim();

  return (
    <section className="panel pad" aria-labelledby="ns-h">
      {guard}
      <h2 id="ns-h" style={{ margin: "0 0 4px", fontSize: 20 }}>開新賽季</h2>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
        一季結束後，把這一季封存、開新的一季。名單（{v.players.length} 位）和所有帳號會自動帶過去，不用重新加入；
        比賽、練習、聊天室、陣容留在舊賽季。能力表<b>不</b>複製：新賽季大家重填，舊的留著，之後在球員報告的「進步」分頁比較。
      </p>
      {error && <ErrorBox text={error} />}
      <form onSubmit={onForm} className="stack" style={{ gap: 12, maxWidth: 560 }}>
        <label className="label">新賽季的名稱（例如 2027 春）
          <input className="field" value={season} onChange={(e) => setSeason(e.target.value)} maxLength={20} placeholder={t.season ? `現在是「${t.season}」` : "2027 春"} />
        </label>
        <label className="label">隊名（要改才改）
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <div className="stack" style={{ gap: 6 }}>
          <label className="check"><input type="checkbox" checked={keepJersey} onChange={(e) => setKeepJersey(e.target.checked)} /> 背號沿用上一季</label>
          <label className="check"><input type="checkbox" checked={keepBadge} onChange={(e) => setKeepBadge(e.target.checked)} /> 隊長、副隊長沿用上一季</label>
        </div>
        <label className="check"><input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} /> 在新賽季的聊天室發通知</label>
        {announce && (
          <>
            <label className="label">通知內容（可以改）
              <textarea className="field" rows={4} value={shownText} maxLength={2000} onChange={(e) => setText(e.target.value)} />
            </label>
            <label className="check"><input type="checkbox" checked={discord} onChange={(e) => setDiscord(e.target.checked)} /> 也推到 Discord（要先在「球隊設定」設好 Webhook）</label>
          </>
        )}
        <div className="panel" style={{ padding: "12px 16px", background: "var(--panel-2)" }}>
          <p style={{ margin: 0, fontWeight: 700 }}>按下去會發生什麼</p>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 14 }}>
            <li>建立「{seasonName || "新賽季"}」，產生新的 Team ID</li>
            <li>名單 {v.players.length} 位、帳號 {v.data.members.length} 個帶到新賽季（還沒處理的認領申請不帶）</li>
            <li>這一季封存：<b>只能看、不能再改</b>，舊的管理員碼作廢，舊 Team ID 不能再加入</li>
            <li>這個動作不能復原</li>
          </ul>
        </div>
        <ConfirmButton className="btn btn-main" label={busy ? "建立中…" : "開新賽季"} confirm="再按一次確認：封存這一季、開新的一季" disabled={busy || !ready}
          onConfirm={submit} />
        {!ready && seasonName !== "" && <p className="faint" style={{ margin: 0, fontSize: 13 }}>新賽季的名稱要 1–20 個字，而且不能跟這一季一樣。</p>}
      </form>
    </section>
  );
}
