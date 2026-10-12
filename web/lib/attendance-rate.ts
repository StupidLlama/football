// 出席率（v2.8）：純計算。比賽和練習分開算（決定 7）。
// 規則（決定 8）：只算已經結束的場次；請假不算進分母；已結束卻沒回覆的算沒到。
import type { Attendance, Match, Practice, PracticeAttendance } from "./api.ts";
import { gameStatus } from "./matches.ts";
import { practiceStatus } from "./practices.ts";

export type Rate = {
  /** 已結束的場次總數 */
  events: number;
  /** 分母：已結束場次 − 我請假的 */
  counted: number;
  attended: number;
  leave: number;
  /** 已結束、沒回覆（算沒到） */
  missed: number;
  /** 0–100 整數；分母是 0（沒場次或全請假）時是 null，畫面顯示「—」 */
  pct: number | null;
};

function tally(statuses: ("in" | "out" | null)[]): Rate {
  const events = statuses.length;
  const attended = statuses.filter((s) => s === "in").length;
  const leave = statuses.filter((s) => s === "out").length;
  const missed = statuses.filter((s) => s === null).length;
  const counted = events - leave;
  return { events, counted, attended, leave, missed, pct: counted > 0 ? Math.round((attended / counted) * 100) : null };
}

export function matchRate(playerId: string, matches: Match[], rows: Attendance[], now: Date): Rate {
  const mine = new Map(rows.filter((a) => a.player_id === playerId).map((a) => [a.match_id, a.status]));
  return tally(matches.filter((m) => gameStatus(m, now) === "done").map((m) => mine.get(m.id) ?? null));
}

export function practiceRate(playerId: string, practices: Practice[], rows: PracticeAttendance[], now: Date): Rate {
  const mine = new Map(rows.filter((a) => a.player_id === playerId).map((a) => [a.practice_id, a.status]));
  return tally(practices.filter((p) => practiceStatus(p, now) === "done").map((p) => mine.get(p.id) ?? null));
}

export type TeamRateRow = { playerId: string; match: Rate; practice: Rate };

/** 全隊出席率表（球隊管理員看）：照練習出席率由低到高排，方便找出常缺席的人；沒有數字的排最後。 */
export function teamRates(playerIds: string[], matches: Match[], mRows: Attendance[],
  practices: Practice[], pRows: PracticeAttendance[], now: Date): TeamRateRow[] {
  return playerIds.map((id) => ({ playerId: id, match: matchRate(id, matches, mRows, now), practice: practiceRate(id, practices, pRows, now) }))
    .sort((a, b) => (a.practice.pct ?? 101) - (b.practice.pct ?? 101));
}

export function rateText(r: Rate): string {
  return r.pct === null ? "—" : `${r.pct}%`;
}
