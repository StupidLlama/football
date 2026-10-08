// 比賽列表＋出賽登記（純計算，不碰畫面和資料庫）。
// 球隊自己的比賽（matches 表）跟系際聯賽賽程（fixtures，見 lib/teamview.ts 的 matches / MatchView）是兩件事，
// 這裡故意不叫「matches」而叫「games」，才不會跟 teamview.ts 原本的命名搞混。
import type { Attendance, AttendanceAnswer, Fixture, Match } from "./api.ts";

export type GameStatus = "upcoming" | "done";

/** 狀態不存欄位，用時間和比分算：開賽前（還沒填比分）＝即將進行，過了開賽時間或填了比分＝已結束。 */
export function gameStatus(m: Pick<Match, "kickoff" | "our_score">, now: Date): GameStatus {
  return now.getTime() >= new Date(m.kickoff).getTime() || m.our_score !== null ? "done" : "upcoming";
}

/** 球員能不能自己改出賽登記：開賽後或已經填了比分就鎖住（球隊管理員不受這個限制，見 set_attendance）。 */
export function isLocked(m: Pick<Match, "kickoff" | "our_score">, now: Date): boolean {
  return gameStatus(m, now) === "done";
}

export function answerOf(rows: Attendance[], matchId: string, playerId: string): AttendanceAnswer | null {
  return rows.find((a) => a.match_id === matchId && a.player_id === playerId)?.status ?? null;
}

export type Counts = { in: number; out: number; pending: number };

/** 出席／請假／還沒回覆的人數（還沒回覆 = 全隊人數減掉已經回覆的）。 */
export function countsFor(rows: Attendance[], matchId: string, rosterSize: number): Counts {
  const forMatch = rows.filter((a) => a.match_id === matchId);
  const inN = forMatch.filter((a) => a.status === "in").length;
  const outN = forMatch.filter((a) => a.status === "out").length;
  return { in: inN, out: outN, pending: Math.max(0, rosterSize - inN - outN) };
}

export type Bucket = "in" | "out" | "pending";

export function bucketOf(rows: Attendance[], matchId: string, playerId: string): Bucket {
  return answerOf(rows, matchId, playerId) ?? "pending";
}

/** 名單依出席／請假／還沒回覆分組（給比賽詳情頁用）。 */
export function groupPlayers<P extends { id: string }>(players: P[], rows: Attendance[], matchId: string): Record<Bucket, P[]> {
  const out: Record<Bucket, P[]> = { in: [], out: [], pending: [] };
  for (const p of players) out[bucketOf(rows, matchId, p.id)].push(p);
  return out;
}

/** 即將進行的照時間排（最近的在前）；已結束的照時間排（最近的在前，也就是倒序）。 */
export function splitGames<T extends Pick<Match, "kickoff" | "our_score">>(games: T[], now: Date): { upcoming: T[]; done: T[] } {
  const byKickoff = (a: T, b: T) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  const upcoming = games.filter((m) => gameStatus(m, now) === "upcoming").sort(byKickoff);
  const done = games.filter((m) => gameStatus(m, now) === "done").sort(byKickoff).reverse();
  return { upcoming, done };
}

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const pad = (n: number) => String(n).padStart(2, "0");

/** 「10/16（五）19:00」 */
export function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}（${WEEK[d.getDay()]}）${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 集合時間：跟開賽同一天就只顯示時刻，不同天（少見，例如跨夜出發）才顯示完整日期。 */
export function meetLabel(meetIso: string, kickoffIso: string): string {
  const m = new Date(meetIso), k = new Date(kickoffIso);
  const sameDay = m.getFullYear() === k.getFullYear() && m.getMonth() === k.getMonth() && m.getDate() === k.getDate();
  return sameDay ? `${pad(m.getHours())}:${pad(m.getMinutes())}` : kickoffLabel(meetIso);
}

export function scoreLabel(m: Pick<Match, "our_score" | "their_score">): string {
  return m.our_score === null || m.their_score === null ? "" : `${m.our_score} – ${m.their_score}`;
}

export type Result = "W" | "D" | "L";
export function resultOf(m: Pick<Match, "our_score" | "their_score">): Result | null {
  if (m.our_score === null || m.their_score === null) return null;
  return m.our_score > m.their_score ? "W" : m.our_score < m.their_score ? "L" : "D";
}

/** 倒數天數和小時（首頁「下一場」用）。 */
export function countdown(iso: string, now: Date): { days: number; hours: number } {
  const ms = Math.max(0, new Date(iso).getTime() - now.getTime());
  return { days: Math.floor(ms / 86_400_000), hours: Math.floor((ms % 86_400_000) / 3_600_000) };
}

// ---------- <input type="datetime-local"> 的轉換（當地時間，不帶時區）----------
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 系際聯賽賽程裡看起來是我們隊、還沒建立成比賽、而且還沒開賽的場次（最近的在前），給「從聯賽帶入」用。 */
export function importableFixtures(fixtures: Fixture[], matches: Match[], leagueName: string | null, now: Date): Fixture[] {
  const us = (leagueName ?? "").trim();
  if (!us) return [];
  const imported = new Set(matches.map((m) => m.fixture_id).filter((x): x is string => !!x));
  return fixtures
    .filter((f) => (f.home === us || f.away === us) && !imported.has(f.id) && f.start_time)
    .filter((f) => new Date(`${f.day}T${(f.start_time ?? "00:00").slice(0, 5)}:00`).getTime() > now.getTime())
    .sort((a, b) => `${a.day}${a.start_time}`.localeCompare(`${b.day}${b.start_time}`));
}
