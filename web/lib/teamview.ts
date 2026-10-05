// 把一支球隊的原始資料（TeamData）整理成畫面要用的樣子：每位球員的最新自評、平均、適合度、
// 全隊平均、我是誰、比賽結果、裁判任務。純計算，不碰資料庫，node --test 可以直接測。
import type { Duty, Fixture, Membership, Player, TeamData } from "./api.ts";
import {
  abilities, average, categoryScores, fitness, latestByPlayer, recommended, teamAverage, type Rules, type Scores,
} from "./rating.ts";

export type PlayerView = Player & {
  scores: Scores | null; submittedAt: string | null; source: string;
  avg: number; cat: Record<string, number>; fit: Record<string, number>; rec: string[];
  accountId: string | null;          // 連到哪個帳號（沒有 = 還沒有人認領）
};
export type Result = "W" | "D" | "L";
export type MatchView = {
  fixture: Fixture; opp: string; side: "主場" | "客場"; kickoff: Date;
  result: Result | null; score: string;
};
export type DutyView = Duty & { fixture: Fixture | null; kickoff: Date | null; playerName: string };
export type TeamView = {
  data: TeamData;
  players: PlayerView[];             // 全部球員（照名字）
  rated: PlayerView[];               // 有填能力表的
  teamScores: Scores;                // 全隊每項能力平均
  teamCat: Record<string, number>;
  teamAvg: number;
  me: Membership;
  myPlayer: PlayerView | null;
  isCoach: boolean;
  claims: Membership[];              // 等球隊管理員確認的認領
  nameOf: (userId: string) => string;
  matches: MatchView[];              // 我們隊的比賽（照時間）
  duties: DutyView[];                // 裁判任務（照時間）
};

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

export function kickoffOf(f: Pick<Fixture, "day" | "start_time">): Date {
  return new Date(`${f.day}T${(f.start_time ?? "00:00").slice(0, 5)}:00`);
}

/** 「10/08（四）19:00」 */
export function whenLabel(f: Pick<Fixture, "day" | "start_time" | "end_time">, withEnd = false): string {
  const d = kickoffOf(f);
  const md = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}（${WEEK[d.getDay()]}）`;
  if (!f.start_time) return md;
  return md + f.start_time.slice(0, 5) + (withEnd && f.end_time ? `–${f.end_time.slice(0, 5)}` : "");
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function buildTeamView(data: TeamData, rules: Rules): TeamView {
  const latest = latestByPlayer(data.ratings);
  const accountOf = new Map(data.members.filter((m) => m.player_id).map((m) => [m.player_id as string, m.user_id]));
  const players: PlayerView[] = data.players.map((p) => {
    const r = latest.get(p.id) ?? null;
    const s = r && r.scores && typeof r.scores === "object" && Object.keys(r.scores).length ? r.scores : null;
    return {
      ...p, good_positions: p.good_positions ?? [], bad_positions: p.bad_positions ?? [],
      scores: s, submittedAt: r?.submitted_at ?? null, source: r?.source ?? "",
      avg: s ? average(s, rules) : 0, cat: s ? categoryScores(s, rules) : {},
      fit: s ? fitness(s, rules) : {}, rec: s ? recommended(s, rules) : [],
      accountId: accountOf.get(p.id) ?? null,
    };
  });
  const rated = players.filter((p) => p.scores);
  const teamScores = teamAverage(rated.map((p) => p.scores as Scores), rules);
  const teamCat: Record<string, number> = {};
  for (const c of rules.categories) teamCat[c.name] = mean(rated.map((p) => p.cat[c.name]));

  const names = new Map(data.profiles.map((p) => [p.user_id, p.display_name]));
  const playerName = new Map(players.map((p) => [p.id, p.name]));
  const nameOf = (userId: string) => {
    const m = data.members.find((x) => x.user_id === userId);
    return (m?.player_id && playerName.get(m.player_id)) || names.get(userId)?.trim() || "（還沒取名字）";
  };

  const us = data.team.league_name ?? "";
  const matches: MatchView[] = data.fixtures
    .filter((f) => us && (f.home === us || f.away === us))
    .map((f) => {
      const home = f.home === us;
      const done = f.home_score !== null && f.away_score !== null;
      const ours = home ? f.home_score ?? 0 : f.away_score ?? 0;
      const theirs = home ? f.away_score ?? 0 : f.home_score ?? 0;
      return {
        fixture: f, opp: home ? f.away : f.home, side: home ? "主場" as const : "客場" as const, kickoff: kickoffOf(f),
        result: done ? (ours > theirs ? "W" : ours < theirs ? "L" : "D") as Result : null,
        score: done ? `${ours} – ${theirs}` : "",
      };
    })
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());

  const fixtureById = new Map(data.fixtures.map((f) => [f.id, f]));
  const duties: DutyView[] = data.duties.map((d) => {
    const f = fixtureById.get(d.fixture_id) ?? null;
    return { ...d, fixture: f, kickoff: f ? kickoffOf(f) : null, playerName: d.player_id ? playerName.get(d.player_id) ?? "" : "" };
  }).sort((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0) || a.role.localeCompare(b.role) || a.slot - b.slot);

  const myPlayer = players.find((p) => p.id === data.me.player_id) ?? null;
  return {
    data, players, rated, teamScores, teamCat, teamAvg: mean(rated.map((p) => p.avg)),
    me: data.me, myPlayer, isCoach: data.me.role === "coach",
    claims: data.members.filter((m) => !m.player_id && (m.claim_player_id || m.claim_new_name)),
    nameOf, matches, duties,
  };
}

/** 近 N 場的戰績摘要：勝和負、進球失球、積分（勝 3 和 1）。 */
export function record(matches: MatchView[]) {
  const done = matches.filter((m) => m.result);
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const m of done) {
    if (m.result === "W") w++; else if (m.result === "D") d++; else l++;
    const [a, b] = m.score.split("–").map((x) => parseInt(x, 10));
    gf += a; ga += b;
  }
  return { played: done.length, w, d, l, gf, ga, points: w * 3 + d };
}

/** 一位球員有沒有填完全部能力（用來算「能力表進度」）。 */
export function filledAll(p: PlayerView, rules: Rules): boolean {
  return !!p.scores && abilities(rules).every((a) => typeof p.scores?.[a.key] === "number");
}
