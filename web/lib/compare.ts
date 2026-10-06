// 比較用的計算（純函式）：同位置平均、兩份能力表的差距（進步 / 退步最多的項目）。
import { abilities, categoryScores, samePosition, teamAverage, type Rules, type Scores } from "./rating.ts";

type Rated = { id: string; scores: Scores | null; good_positions: string[] };

/** 自評擅長這個位置（含「LB」算在「LB/RB」裡）的球員。exclude：比較時排除自己。 */
export function playersAt<T extends Rated>(players: T[], pos: string, exclude?: string): T[] {
  return players.filter((p) => p.scores && p.id !== exclude && (p.good_positions ?? []).some((g) => samePosition(g, pos)));
}

/** 一群人的平均：每項能力、類別、整體平均。沒有人時回傳 null。 */
export function groupAverage(group: Rated[], rules: Rules): { scores: Scores; cat: Record<string, number>; avg: number; n: number } | null {
  const list = group.map((p) => p.scores).filter((s): s is Scores => !!s);
  if (!list.length) return null;
  const scores = teamAverage(list, rules);
  const cat = categoryScores(scores, rules);
  const keys = abilities(rules).filter((a) => a.key in scores);
  const avg = keys.length ? keys.reduce((t, a) => t + scores[a.key], 0) / keys.length : 0;
  return { scores, cat, avg, n: list.length };
}

/** 有人自評擅長的位置（照設定檔順序），給「同位置平均」的選單用。 */
export function positionsWithPlayers(players: Rated[], order: string[]): { pos: string; n: number }[] {
  return order.map((pos) => ({ pos, n: playersAt(players, pos).length })).filter((x) => x.n > 0);
}

export type AbilityDiff = { key: string; label: string; category: string; a: number; b: number; d: number };

/** 每項能力 a − b，照差距絕對值排序；只算兩邊都有的項目。 */
export function diffs(a: Scores, b: Scores, rules: Rules): AbilityDiff[] {
  return abilities(rules)
    .filter((x) => x.key in a && x.key in b)
    .map((x) => ({ key: x.key, label: x.label, category: x.category, a: a[x.key], b: b[x.key], d: a[x.key] - b[x.key] }))
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
}

/** 從 before 到 after：進步最多、退步最多的前 n 項（沒變的不列）。 */
export function changes(before: Scores, after: Scores, rules: Rules, n = 5) {
  const all = diffs(after, before, rules);
  return {
    up: all.filter((x) => x.d > 0).sort((x, y) => y.d - x.d).slice(0, n),
    down: all.filter((x) => x.d < 0).sort((x, y) => x.d - y.d).slice(0, n),
    same: all.filter((x) => x.d === 0).length,
  };
}
