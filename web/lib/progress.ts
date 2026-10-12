// 賽季進步追蹤（v2.8 F8）：把同一個人跨賽季的能力表串起來。純計算，node --test 可以直接測。
// 資料來自資料庫函式 get_progress / get_team_progress（同一個系列、照賽季順序排好）。
import { average, categoryScores, type Rules, type Scores } from "./rating.ts";
import { changes } from "./compare.ts";

export type ProgressRating = { scores: Scores; submitted_at: string };
export type ProgressSeason = {
  team_id: string; team_name: string; season: string | null; started_at: string; archived_at: string | null;
  player_id: string; jersey_number: string | null; ratings: ProgressRating[];
};
export type ProgressResult = { status: string; seasons?: ProgressSeason[]; detail?: string };
export type TeamProgressResult = { status: string; players?: { player_id: string; seasons: ProgressSeason[] }[]; detail?: string };

/** 時間線上的一個點：一季裡的一份能力表。 */
export type SeasonPoint = {
  key: string; teamId: string; label: string; date: string;
  scores: Scores; avg: number; cat: Record<string, number>;
};
/** 一個賽季：用最後一份能力表代表這一季（decision 6），其他份留在 earlier（可展開）。 */
export type SeasonSummary = {
  teamId: string; label: string; season: string | null; archived: boolean; jersey: string | null;
  last: SeasonPoint | null; earlier: SeasonPoint[];
};
export type Progress = { seasons: SeasonSummary[]; withData: SeasonSummary[] };

export function seasonLabel(s: Pick<ProgressSeason, "season" | "team_name">): string {
  return s.season ? `${s.season} ${s.team_name}` : s.team_name;
}

function validScores(s: unknown): s is Scores {
  return !!s && typeof s === "object" && !Array.isArray(s) && Object.keys(s).length > 0;
}

export function buildProgress(seasons: ProgressSeason[], rules: Rules): Progress {
  const out: SeasonSummary[] = seasons.map((s) => {
    const label = seasonLabel(s);
    const pts: SeasonPoint[] = (s.ratings ?? [])
      .filter((r) => validScores(r.scores))
      .slice()
      .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at))
      .map((r, i) => ({
        key: `${s.team_id}:${i}`, teamId: s.team_id, label, date: r.submitted_at,
        scores: r.scores, avg: average(r.scores, rules), cat: categoryScores(r.scores, rules),
      }));
    return {
      teamId: s.team_id, label, season: s.season, archived: !!s.archived_at, jersey: s.jersey_number,
      last: pts.length ? pts[pts.length - 1] : null, earlier: pts.slice(0, -1),
    };
  });
  return { seasons: out, withData: out.filter((s) => s.last) };
}

/** 趨勢圖的點：每季一個（最後一份）。 */
export function trendOf(p: Progress): SeasonPoint[] {
  return p.withData.map((s) => s.last!);
}

/** 某個類別每季的分數（折線圖一條線）。 */
export function categoryTrend(p: Progress, category: string): number[] {
  return trendOf(p).map((pt) => pt.cat[category] ?? 0);
}

export type Delta = { d: number; kind: "up" | "down" | "same" };
const kindOf = (d: number): Delta["kind"] => (d > 0.005 ? "up" : d < -0.005 ? "down" : "same");

/** 最新一季跟上一季（有能力表的）比：整體平均和各類別的變化。只有一季有資料時回傳 null。 */
export function latestChange(p: Progress, rules: Rules): { from: SeasonPoint; to: SeasonPoint; avg: Delta; cat: Record<string, Delta> } | null {
  const pts = trendOf(p);
  if (pts.length < 2) return null;
  const from = pts[pts.length - 2], to = pts[pts.length - 1];
  const cat: Record<string, Delta> = {};
  for (const c of rules.categories) {
    const d = Math.round(((to.cat[c.name] ?? 0) - (from.cat[c.name] ?? 0)) * 100) / 100;
    cat[c.name] = { d, kind: kindOf(d) };
  }
  const d = Math.round((to.avg - from.avg) * 100) / 100;
  return { from, to, avg: { d, kind: kindOf(d) }, cat };
}

/** 任意兩個時間點之間進步最多、退步最多的能力。 */
export function compareTwo(a: SeasonPoint, b: SeasonPoint, rules: Rules, n = 5) {
  return changes(a.scores, b.scores, rules, n);
}

/** 全隊進步排行：每個人「最新兩季」整體平均的差，由大到小；只有一季資料的不排（回報在 noData）。 */
export type TeamRow = { playerId: string; delta: number; from: number; to: number; seasons: number };
export function teamRanking(players: { player_id: string; seasons: ProgressSeason[] }[], rules: Rules):
  { rows: TeamRow[]; noData: string[] } {
  const rows: TeamRow[] = [];
  const noData: string[] = [];
  for (const pl of players) {
    const ch = latestChange(buildProgress(pl.seasons, rules), rules);
    if (!ch) { noData.push(pl.player_id); continue; }
    rows.push({ playerId: pl.player_id, delta: ch.avg.d, from: ch.from.avg, to: ch.to.avg, seasons: pl.seasons.length });
  }
  rows.sort((a, b) => b.delta - a.delta);
  return { rows, noData };
}
