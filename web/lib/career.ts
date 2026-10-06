// 球員生涯：把同一個帳號在不同球隊（賽季）的能力表串成一條時間線。純計算，node --test 可以直接測。
// 資料來自資料庫函式 get_career（只回傳本人或已「放進生涯」的隊伍）。
import { average, categoryScores, isComplete, type Rules, type Scores } from "./rating.ts";

export type CareerRating = { scores: Scores; submitted_at: string };
export type CareerEntry = {
  team_id: string; team_name: string; season: string | null; current: boolean; shared: boolean; joined_at: string;
  jersey_number: string | null; badge: "C" | "VC" | null; good_positions: string[]; ratings: CareerRating[];
};
export type CareerResult = { status: string; self?: boolean; linked?: boolean; entries?: CareerEntry[]; detail?: string };

/** 時間線上的一個點：某一隊的某一次能力表。 */
export type CareerPoint = {
  key: string; teamId: string; teamLabel: string; date: string;
  scores: Scores; avg: number; cat: Record<string, number>; complete: boolean;
};
/** 一隊（一個賽季）的摘要：用這一隊最新的能力表。 */
export type CareerSeason = CareerEntry & {
  label: string; latest: CareerPoint | null; first: CareerPoint | null; points: CareerPoint[];
};
export type Career = { seasons: CareerSeason[]; points: CareerPoint[]; teamCount: number };

/** 「2025-26 資訊系」；沒填賽季就只有隊名。 */
export function teamLabel(e: Pick<CareerEntry, "season" | "team_name">): string {
  return e.season ? `${e.season} ${e.team_name}` : e.team_name;
}

function validScores(s: unknown): s is Scores {
  return !!s && typeof s === "object" && !Array.isArray(s) && Object.keys(s).length > 0;
}

/** 依時間排：先比賽季（字串，例如 2025-26 < 2026-27），沒有賽季的用加入時間；同賽季再比加入時間。 */
function entryOrder(a: CareerEntry, b: CareerEntry): number {
  const sa = a.season ?? "", sb = b.season ?? "";
  if (sa && sb && sa !== sb) return sa < sb ? -1 : 1;
  const ta = firstDate(a), tb = firstDate(b);
  return ta - tb;
}

function firstDate(e: CareerEntry): number {
  const ds = e.ratings.map((r) => Date.parse(r.submitted_at)).filter(Number.isFinite);
  return ds.length ? Math.min(...ds) : Date.parse(e.joined_at) || 0;
}

export function buildCareer(entries: CareerEntry[], rules: Rules): Career {
  const seasons: CareerSeason[] = entries.slice().sort(entryOrder).map((e) => {
    const label = teamLabel(e);
    const points: CareerPoint[] = (e.ratings ?? [])
      .filter((r) => validScores(r.scores))
      .slice()
      .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at))
      .map((r, i) => ({
        key: `${e.team_id}:${i}`, teamId: e.team_id, teamLabel: label, date: r.submitted_at,
        scores: r.scores, avg: average(r.scores, rules), cat: categoryScores(r.scores, rules),
        complete: isComplete(r.scores, rules),
      }));
    return {
      ...e, good_positions: e.good_positions ?? [], label, points,
      latest: points.length ? points[points.length - 1] : null, first: points[0] ?? null,
    };
  });
  return { seasons, points: seasons.flatMap((s) => s.points), teamCount: seasons.length };
}

/** 生涯趨勢圖用的點：每隊只取最新的一次（太多點擠在一起看不出變化），同一隊有多次就再加最早那次。 */
export function trendPoints(c: Career): CareerPoint[] {
  return c.seasons.flatMap((s) => {
    if (!s.latest) return [];
    return s.first && s.first.key !== s.latest.key ? [s.first, s.latest] : [s.latest];
  });
}

/** 預設比較的兩個時間點：最早和最新（只有一個點時兩個一樣）。 */
export function defaultPair(c: Career): [string, string] | null {
  if (!c.points.length) return null;
  return [c.points[0].key, c.points[c.points.length - 1].key];
}

/** 「2025-26 資訊系 · 2025/12/10」 */
export function pointLabel(p: CareerPoint): string {
  const d = new Date(p.date);
  const day = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  return `${p.teamLabel} · ${day}`;
}
