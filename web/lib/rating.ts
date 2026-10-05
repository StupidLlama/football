// 評分規則（純計算，不碰畫面和資料庫）。
// 跟 Python 的 domain/rating.py、stats/ranking.py 同一套算法：
//   平均能力、類別分數、位置適合度（相關能力加權平均 ÷ 滿分 × 100）、推薦位置、隊內排名（同分同名次）。
// 規則（能力清單、權重）從 config.json 傳進來，這個檔案不 import 任何東西，所以 node --test 可以直接測。

export type AbilityDef = { key: string; label: string };
export type CategoryDef = { name: string; color: string; abilities: AbilityDef[] };
export type Rules = {
  maxScore: number;
  topN: number;
  categories: CategoryDef[];
  positions: Record<string, Record<string, number>>;
};
export type Ability = AbilityDef & { category: string; color: string };
export type Scores = Record<string, number>;

const EPS = 1e-9;

export function round(x: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round((x + Number.EPSILON) * f) / f;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** 所有能力（照設定檔的順序），附上所屬類別。 */
export function abilities(rules: Rules): Ability[] {
  return rules.categories.flatMap((c) => c.abilities.map((a) => ({ ...a, category: c.name, color: c.color })));
}

export function positionList(rules: Rules): string[] {
  return Object.keys(rules.positions);
}

/** 這份自評有沒有填完所有能力。 */
export function isComplete(scores: Scores | null | undefined, rules: Rules): boolean {
  return !!scores && abilities(rules).every((a) => typeof scores[a.key] === "number");
}

/** 平均能力（只算有填的項目），小數 2 位。 */
export function average(scores: Scores, rules: Rules): number {
  return round(mean(abilities(rules).filter((a) => a.key in scores).map((a) => scores[a.key])));
}

/** 每個類別的平均，例如 {技術: 3.17, 進攻: 2.67, ...}。 */
export function categoryScores(scores: Scores, rules: Rules): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of rules.categories) {
    out[c.name] = round(mean(c.abilities.filter((a) => a.key in scores).map((a) => scores[a.key])));
  }
  return out;
}

/** 每個位置的適合度 0–100（小數 1 位）。 */
export function fitness(scores: Scores, rules: Rules): Record<string, number> {
  const scale = 100 / rules.maxScore;
  const out: Record<string, number> = {};
  for (const [pos, weights] of Object.entries(rules.positions)) {
    let t = 0;
    for (const [k, w] of Object.entries(weights)) t += (scores[k] ?? 0) * w;
    out[pos] = round(t * scale, 1);
  }
  return out;
}

/** 數據推薦位置：適合度最高的前 N 個（同分照設定檔順序）。 */
export function recommended(scores: Scores, rules: Rules, top?: number): string[] {
  const fit = fitness(scores, rules);
  const order = positionList(rules);
  return order.slice().sort((a, b) => fit[b] - fit[a] || order.indexOf(a) - order.indexOf(b)).slice(0, top ?? rules.topN);
}

/** 隊內排名：1 = 最高，同分同名次。 */
export function rank(value: number, values: number[]): number {
  return 1 + values.filter((v) => v > value + EPS).length;
}

/** 由低到高時的名次：1 = 最低。 */
export function rankAsc(value: number, values: number[]): number {
  return 1 + values.filter((v) => v < value - EPS).length;
}

/** 全隊平均：每項能力的平均（不四捨五入，畫雷達圖用）。 */
export function teamAverage(all: Scores[], rules: Rules): Scores {
  const out: Scores = {};
  for (const a of abilities(rules)) {
    const xs = all.filter((s) => a.key in s).map((s) => s[a.key]);
    if (xs.length) out[a.key] = mean(xs);
  }
  return out;
}

/** 強項 / 待加強：分數高（低）的前 n 項，同分看隊內名次。 */
export function strengths(scores: Scores, team: Scores[], rules: Rules, n = 5) {
  const list = abilities(rules)
    .filter((a) => a.key in scores)
    .map((a) => ({ key: a.key, label: a.label, category: a.category, score: scores[a.key],
                   rank: rank(scores[a.key], team.filter((s) => a.key in s).map((s) => s[a.key])) }));
  return {
    strong: list.slice().sort((x, y) => y.score - x.score || x.rank - y.rank).slice(0, n),
    weak: list.slice().sort((x, y) => x.score - y.score || y.rank - x.rank).slice(0, n),
  };
}

/** 從同一位球員的多筆自評裡挑最新的一筆（submitted_at 最大）。 */
export function latestByPlayer<T extends { player_id: string; submitted_at: string }>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) {
    const cur = out.get(r.player_id);
    if (!cur || Date.parse(r.submitted_at) > Date.parse(cur.submitted_at)) out.set(r.player_id, r);
  }
  return out;
}

/** 位置字串比對：「LB」算在「LB/RB」裡，反過來也算。 */
export function samePosition(a: string, b: string): boolean {
  if (a === b) return true;
  const pa = a.split("/"), pb = b.split("/");
  return pa.some((x) => pb.includes(x));
}

// ---------- 球員列表的排序（排行榜合併進來）----------
export type SortKey = "avg" | "num" | "name" | `col:${number}`;
export type SortDir = "asc" | "desc";

/** 背號字串 → 數字；沒有背號回傳 null（永遠排最後）。 */
export function jerseyValue(num: string | null | undefined): number | null {
  if (!num) return null;
  const n = parseInt(num, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * 依排序值排列。null 永遠在最後；同分再比平均能力（高的前面）；字串用中文筆畫排序。
 * 回傳新陣列，不改原本的。
 */
export function sortBy<T>(rows: T[], value: (r: T) => number | string | null, avg: (r: T) => number, dir: SortDir): T[] {
  return rows.slice().sort((a, b) => {
    const va = value(a), vb = value(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    let d = typeof va === "string" ? va.localeCompare(String(vb), "zh-Hant-TW-u-co-stroke") : va - (vb as number);
    if (Math.abs(d) < EPS) {
      d = 0;
      const tie = avg(b) - avg(a);
      return Math.abs(tie) < EPS ? 0 : tie;
    }
    return dir === "asc" ? d : -d;
  });
}

// ---------- 雷達圖座標（viewBox 0 0 100 100，中心 50,50，半徑 40）----------
export function radarPoints(values: number[], max: number, radius = 40): string {
  const n = values.length;
  return values.map((v, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = (radius * Math.max(0, Math.min(v, max))) / max;
    return `${(50 + r * Math.cos(ang)).toFixed(2)},${(50 + r * Math.sin(ang)).toFixed(2)}`;
  }).join(" ");
}
