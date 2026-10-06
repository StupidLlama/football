// v2.3：生涯時間線、同位置平均、進步退步、動畫插值。
// 執行：npm test（在 web 資料夾）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { abilities, type Rules, type Scores } from "../lib/rating.ts";
import { buildCareer, defaultPair, pointLabel, teamLabel, trendPoints, type CareerEntry } from "../lib/career.ts";
import { changes, diffs, groupAverage, playersAt, positionsWithPlayers } from "../lib/compare.ts";
import { easeOutCubic, lerpArray, progress, sameValues } from "../lib/anim.ts";

const rules: Rules = JSON.parse(readFileSync(new URL("../lib/config.json", import.meta.url), "utf-8"));
const all = (v: number): Scores => Object.fromEntries(abilities(rules).map((a) => [a.key, v]));
const firstKey = abilities(rules)[0].key;
const secondKey = abilities(rules)[1].key;

function entry(over: Partial<CareerEntry>): CareerEntry {
  return {
    team_id: "t", team_name: "隊", season: null, current: false, shared: true, joined_at: "2026-01-01T00:00:00Z",
    jersey_number: null, badge: null, good_positions: [], ratings: [], ...over,
  };
}

test("生涯：照賽季排序，每隊取最新的能力表", () => {
  const c = buildCareer([
    entry({ team_id: "now", team_name: "資訊", season: "2026-27", current: true,
            ratings: [{ scores: all(4), submitted_at: "2026-10-01T00:00:00Z" }, { scores: all(3), submitted_at: "2026-09-01T00:00:00Z" }] }),
    entry({ team_id: "old", team_name: "資訊", season: "2025-26", ratings: [{ scores: all(2), submitted_at: "2025-10-01T00:00:00Z" }] }),
  ], rules);
  assert.deepEqual(c.seasons.map((s) => s.team_id), ["old", "now"]);
  assert.equal(c.seasons[1].latest?.avg, 4);
  assert.equal(c.seasons[1].first?.avg, 3);
  assert.deepEqual(c.points.map((p) => p.avg), [2, 3, 4]);
  assert.equal(c.teamCount, 2);
});

test("生涯：沒有賽季的隊伍用第一次填表的時間排", () => {
  const c = buildCareer([
    entry({ team_id: "b", ratings: [{ scores: all(3), submitted_at: "2026-05-01T00:00:00Z" }] }),
    entry({ team_id: "a", ratings: [{ scores: all(3), submitted_at: "2025-05-01T00:00:00Z" }] }),
  ], rules);
  assert.deepEqual(c.seasons.map((s) => s.team_id), ["a", "b"]);
});

test("生涯：沒填過表的隊伍也列出來，但不產生點；壞掉的分數略過", () => {
  const c = buildCareer([
    entry({ team_id: "x", ratings: [] }),
    entry({ team_id: "y", ratings: [{ scores: {} as Scores, submitted_at: "2026-01-01T00:00:00Z" }] }),
  ], rules);
  assert.equal(c.seasons.length, 2);
  assert.equal(c.points.length, 0);
  assert.equal(defaultPair(c), null);
});

test("生涯趨勢：每隊最多兩個點（最早、最新）", () => {
  const rs = [1, 2, 3, 4].map((v, i) => ({ scores: all(v), submitted_at: `2026-0${i + 1}-01T00:00:00Z` }));
  const c = buildCareer([entry({ team_id: "a", ratings: rs })], rules);
  assert.deepEqual(trendPoints(c).map((p) => p.avg), [1, 4]);
  assert.deepEqual(defaultPair(c), [c.points[0].key, c.points[3].key]);
});

test("隊名標籤", () => {
  assert.equal(teamLabel({ season: "2025-26", team_name: "資訊" }), "2025-26 資訊");
  assert.equal(teamLabel({ season: null, team_name: "資訊" }), "資訊");
  const c = buildCareer([entry({ season: "2025-26", team_name: "資訊", ratings: [{ scores: all(3), submitted_at: "2025-12-10T12:00:00Z" }] })], rules);
  assert.match(pointLabel(c.points[0]), /^2025-26 資訊 · 2025\/12\/1[01]$/);
});

test("同位置平均：擅長位置相符（LB 算在 LB/RB 裡），可以排除自己", () => {
  const ps = [
    { id: "1", scores: all(5), good_positions: ["ST"] },
    { id: "2", scores: all(3), good_positions: ["ST", "CM"] },
    { id: "3", scores: all(1), good_positions: ["CM"] },
    { id: "4", scores: null, good_positions: ["ST"] },
    { id: "5", scores: all(2), good_positions: ["LB/RB"] },
  ];
  assert.deepEqual(playersAt(ps, "ST").map((p) => p.id), ["1", "2"]);
  assert.deepEqual(playersAt(ps, "ST", "1").map((p) => p.id), ["2"]);
  assert.deepEqual(playersAt(ps, "LB").map((p) => p.id), ["5"]);
  const g = groupAverage(playersAt(ps, "ST"), rules)!;
  assert.equal(g.n, 2);
  assert.equal(g.avg, 4);
  assert.equal(g.scores[firstKey], 4);
  assert.equal(groupAverage([], rules), null);
  assert.deepEqual(positionsWithPlayers(ps, ["GK", "CM", "ST"]), [{ pos: "CM", n: 2 }, { pos: "ST", n: 2 }]);
});

test("差距與進步退步", () => {
  const before = all(3), after = { ...all(3), [firstKey]: 5, [secondKey]: 2 };
  const d = diffs(after, before, rules);
  assert.equal(d[0].key, firstKey);
  assert.equal(d[0].d, 2);
  const c = changes(before, after, rules);
  assert.deepEqual(c.up.map((x) => x.key), [firstKey]);
  assert.deepEqual(c.down.map((x) => x.key), [secondKey]);
  assert.equal(c.same, abilities(rules).length - 2);
});

test("動畫：緩動曲線、插值、進度", () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
  assert.equal(easeOutCubic(2), 1);
  assert.deepEqual(lerpArray([0, 2], [4, 2, 6], 0.5), [2, 2, 3]);
  assert.ok(sameValues([1, 2], [1, 2]));
  assert.ok(!sameValues([1, 2], [1, 3]));
  assert.ok(!sameValues([1], [1, 1]));
  assert.equal(progress(150, 300), 0.5);
  assert.equal(progress(50, 300, 100), 0);
  assert.equal(progress(1000, 300), 1);
  assert.equal(progress(0, 0), 1);
});
