// v2.8：賽季進步、出席率。執行：npm test（在 web 資料夾）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { abilities, type Rules, type Scores } from "../lib/rating.ts";
import { buildProgress, categoryTrend, compareTwo, latestChange, teamRanking, trendOf, type ProgressSeason } from "../lib/progress.ts";
import { matchRate, practiceRate, rateText, teamRates } from "../lib/attendance-rate.ts";
import type { Attendance, Match, Practice, PracticeAttendance } from "../lib/api.ts";

const rules: Rules = JSON.parse(readFileSync(new URL("../lib/config.json", import.meta.url), "utf-8"));
const all = (v: number): Scores => Object.fromEntries(abilities(rules).map((a) => [a.key, v]));
const firstKey = abilities(rules)[0].key;

function season(over: Partial<ProgressSeason>): ProgressSeason {
  return { team_id: "t", team_name: "資訊", season: null, started_at: "2026-01-01T00:00:00Z", archived_at: null,
           player_id: "p", jersey_number: null, ratings: [], ...over };
}

test("進步：每季用最後一份能力表，其他份留在 earlier", () => {
  const p = buildProgress([
    season({ team_id: "a", season: "2026 春", archived_at: "2026-09-01T00:00:00Z",
             ratings: [{ scores: all(3), submitted_at: "2026-03-01T00:00:00Z" }, { scores: all(2), submitted_at: "2026-02-01T00:00:00Z" }] }),
    season({ team_id: "b", season: "2026 秋", ratings: [{ scores: all(4), submitted_at: "2026-10-01T00:00:00Z" }] }),
  ], rules);
  assert.equal(p.seasons[0].last?.avg, 3);
  assert.equal(p.seasons[0].earlier.length, 1);
  assert.equal(p.seasons[0].earlier[0].avg, 2);
  assert.equal(p.seasons[0].archived, true);
  assert.equal(p.seasons[1].archived, false);
  assert.deepEqual(trendOf(p).map((x) => x.avg), [3, 4]);
});

test("進步：沒填能力表的季不進趨勢圖，也不會當成 0 分", () => {
  const p = buildProgress([
    season({ team_id: "a", season: "2026 春", ratings: [{ scores: all(3), submitted_at: "2026-03-01T00:00:00Z" }] }),
    season({ team_id: "b", season: "2026 秋", ratings: [] }),
  ], rules);
  assert.equal(p.seasons.length, 2);
  assert.equal(p.withData.length, 1);
  assert.equal(latestChange(p, rules), null);
  const bad = buildProgress([season({ ratings: [{ scores: {}, submitted_at: "2026-03-01T00:00:00Z" }] })], rules);
  assert.equal(bad.withData.length, 0);
});

test("進步：最新一季跟上一季比，整體和各類別", () => {
  const p = buildProgress([
    season({ team_id: "a", season: "1", ratings: [{ scores: all(2), submitted_at: "2026-03-01T00:00:00Z" }] }),
    season({ team_id: "b", season: "2", ratings: [] }),
    season({ team_id: "c", season: "3", ratings: [{ scores: all(3), submitted_at: "2026-10-01T00:00:00Z" }] }),
  ], rules);
  const ch = latestChange(p, rules)!;
  assert.equal(ch.from.teamId, "a");
  assert.equal(ch.to.teamId, "c");
  assert.deepEqual(ch.avg, { d: 1, kind: "up" });
  assert.ok(rules.categories.every((c) => ch.cat[c.name].kind === "up"));
  assert.deepEqual(categoryTrend(p, rules.categories[0].name), [2, 3]);
});

test("進步：退步與持平", () => {
  const down = buildProgress([
    season({ team_id: "a", ratings: [{ scores: all(4), submitted_at: "2026-03-01T00:00:00Z" }] }),
    season({ team_id: "b", ratings: [{ scores: all(3), submitted_at: "2026-10-01T00:00:00Z" }] }),
  ], rules);
  assert.equal(latestChange(down, rules)!.avg.kind, "down");
  const same = buildProgress([
    season({ team_id: "a", ratings: [{ scores: all(3), submitted_at: "2026-03-01T00:00:00Z" }] }),
    season({ team_id: "b", ratings: [{ scores: all(3), submitted_at: "2026-10-01T00:00:00Z" }] }),
  ], rules);
  assert.equal(latestChange(same, rules)!.avg.kind, "same");
});

test("進步：兩個時間點比較找出進步最多的能力", () => {
  const p = buildProgress([
    season({ team_id: "a", ratings: [{ scores: all(2), submitted_at: "2026-03-01T00:00:00Z" }] }),
    season({ team_id: "b", ratings: [{ scores: { ...all(2), [firstKey]: 5 }, submitted_at: "2026-10-01T00:00:00Z" }] }),
  ], rules);
  const [a, b] = trendOf(p);
  const c = compareTwo(a, b, rules);
  assert.equal(c.up[0].key, firstKey);
  assert.equal(c.up[0].d, 3);
  assert.equal(c.down.length, 0);
});

test("全隊進步排行：進步多的在前，只有一季的放 noData", () => {
  const r = teamRanking([
    { player_id: "x", seasons: [season({ team_id: "a", ratings: [{ scores: all(2), submitted_at: "2026-03-01T00:00:00Z" }] }),
                                season({ team_id: "b", ratings: [{ scores: all(3), submitted_at: "2026-10-01T00:00:00Z" }] })] },
    { player_id: "y", seasons: [season({ team_id: "a", ratings: [{ scores: all(2), submitted_at: "2026-03-01T00:00:00Z" }] }),
                                season({ team_id: "b", ratings: [{ scores: all(4), submitted_at: "2026-10-01T00:00:00Z" }] })] },
    { player_id: "z", seasons: [season({ team_id: "b", ratings: [{ scores: all(4), submitted_at: "2026-10-01T00:00:00Z" }] })] },
  ], rules);
  assert.deepEqual(r.rows.map((x) => x.playerId), ["y", "x"]);
  assert.deepEqual(r.noData, ["z"]);
});

// ---------------------------------------------------------------- 出席率
const now = new Date("2026-10-13T12:00:00Z");
const past = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const future = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

const match = (id: string, kickoff: string, our: number | null = null): Match => ({
  id, team_id: "t", opponent: "x", kickoff, meet_at: null, location: "", jersey: "", size: 11, note: "",
  our_score: our, their_score: our === null ? null : 0, fixture_id: null, created_by: null, created_at: kickoff, updated_at: kickoff,
});
const att = (match_id: string, player_id: string, status: "in" | "out"): Attendance =>
  ({ match_id, player_id, team_id: "t", status, note: "", updated_by: null, updated_at: "" });
const prac = (id: string, starts: string): Practice => ({
  id, team_id: "t", starts_at: starts, ends_at: starts, meet_at: null, location: "", title: "", content: "", note: "",
  series_id: null, created_by: null, created_at: starts, updated_at: starts,
});
const patt = (practice_id: string, player_id: string, status: "in" | "out"): PracticeAttendance =>
  ({ practice_id, player_id, team_id: "t", status, note: "", updated_by: null, updated_at: "" });

test("出席率：請假不算分母、沒回覆算沒到、還沒結束的不算", () => {
  const ms = [match("m1", past(5)), match("m2", past(4)), match("m3", past(3)), match("m4", past(2)), match("m5", future(2))];
  const rows = [att("m1", "p", "in"), att("m2", "p", "in"), att("m3", "p", "out"), att("m5", "p", "in")];
  const r = matchRate("p", ms, rows, now);
  assert.equal(r.events, 4);
  assert.equal(r.attended, 2);
  assert.equal(r.leave, 1);
  assert.equal(r.missed, 1);          // m4 沒回覆
  assert.equal(r.counted, 3);
  assert.equal(r.pct, 67);            // 2 / 3
  assert.equal(rateText(r), "67%");
});

test("出席率：沒有場次、全部請假都顯示 —，不是 0%", () => {
  assert.equal(matchRate("p", [], [], now).pct, null);
  assert.equal(rateText(matchRate("p", [], [], now)), "—");
  const ps = [prac("a", past(2)), prac("b", past(1))];
  const r = practiceRate("p", ps, [patt("a", "p", "out"), patt("b", "p", "out")], now);
  assert.equal(r.counted, 0);
  assert.equal(r.pct, null);
});

test("出席率：全部沒回覆是 0%；別人的登記不會算到我", () => {
  const ps = [prac("a", past(2))];
  assert.equal(practiceRate("p", ps, [patt("a", "q", "in")], now).pct, 0);
});

test("出席率：已填比分的比賽算已結束，比賽和練習分開算", () => {
  const ms = [match("m1", future(1), 2)];
  assert.equal(matchRate("p", ms, [att("m1", "p", "in")], now).pct, 100);
  const ps = [prac("a", past(1))];
  assert.equal(practiceRate("p", ps, [], now).pct, 0);
});

test("全隊出席率表：練習出席率低的排前面，沒數字的排最後", () => {
  const ps = [prac("a", past(2))];
  const rows = teamRates(["good", "bad", "none"], [], [], ps, [patt("a", "good", "in"), patt("a", "none", "out")], now);
  assert.deepEqual(rows.map((r) => r.playerId), ["bad", "good", "none"]);
});
