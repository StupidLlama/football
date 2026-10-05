// 網站的評分計算要跟 Python（domain/rating.py、stats/ranking.py）算出一樣的結果。
// 執行：npm test（在 web 資料夾）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  abilities, average, categoryScores, fitness, isComplete, jerseyValue, latestByPlayer, rank, rankAsc,
  recommended, round, samePosition, sortBy, strengths, teamAverage, type Rules, type Scores,
} from "../lib/rating.ts";
import { groupByLine, lineOf } from "../lib/positions.ts";

const rules: Rules = JSON.parse(readFileSync(new URL("../lib/config.json", import.meta.url), "utf-8"));
const all3 = (): Scores => Object.fromEntries(abilities(rules).map((a) => [a.key, 3]));

test("設定檔有 21 項能力、5 個類別", () => {
  assert.equal(abilities(rules).length, 21);
  assert.equal(rules.categories.length, 5);
});

test("每個位置的權重加起來是 1", () => {
  for (const [pos, w] of Object.entries(rules.positions)) {
    assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9, pos);
    for (const k of Object.keys(w)) assert.ok(abilities(rules).some((a) => a.key === k), `${pos} 的 ${k} 不是能力`);
  }
});

test("全部 3 分：平均 3、每個位置適合度 60", () => {
  const s = all3();
  assert.equal(average(s, rules), 3);
  assert.deepEqual(Object.values(categoryScores(s, rules)), [3, 3, 3, 3, 3]);
  for (const v of Object.values(fitness(s, rules))) assert.equal(v, 60);
  assert.ok(isComplete(s, rules));
  assert.ok(!isComplete({ passing: 3 }, rules));
});

test("守門 5 分的人，推薦位置第一名是 GK", () => {
  const s = { ...all3(), goalkeeping: 5 };
  assert.equal(recommended(s, rules)[0], "GK");
  assert.equal(recommended(s, rules).length, rules.topN);
  // GK = 0.85 × 5 + 0.15 × 3 = 4.7 → 94
  assert.equal(fitness(s, rules).GK, 94);
});

test("平均只算有填的能力、四捨五入到 2 位", () => {
  assert.equal(average({ passing: 4, speed: 5, stamina: 4 }, rules), 4.33);
  assert.equal(round(2.675, 2), 2.68);
});

test("同分同名次（跟 stats/player.py 的 rank 一樣）", () => {
  const xs = [4, 3.5, 4, 2];
  assert.deepEqual(xs.map((x) => rank(x, xs)), [1, 3, 1, 4]);
  assert.deepEqual(xs.map((x) => rankAsc(x, xs)), [3, 2, 3, 1]);
});

test("全隊平均與強項 / 待加強", () => {
  const a = { ...all3(), passing: 5, goalkeeping: 1 };
  const b = { ...all3(), passing: 1 };
  const team = teamAverage([a, b], rules);
  assert.equal(team.passing, 3);
  assert.equal(team.goalkeeping, 2);
  const { strong, weak } = strengths(a, [a, b], rules, 3);
  assert.equal(strong[0].key, "passing");
  assert.equal(strong[0].rank, 1);
  assert.equal(weak[0].key, "goalkeeping");
});

test("最新一筆自評", () => {
  const rows = [
    { player_id: "p1", submitted_at: "2026-09-01T10:00:00Z", v: 1 },
    { player_id: "p1", submitted_at: "2026-10-01T10:00:00Z", v: 2 },
    { player_id: "p2", submitted_at: "2026-09-15T10:00:00Z", v: 3 },
  ];
  const m = latestByPlayer(rows);
  assert.equal(m.get("p1")?.v, 2);
  assert.equal(m.get("p2")?.v, 3);
});

test("排序：沒有背號的人永遠在最後，同分看平均", () => {
  const ps = [
    { name: "乙", num: "7", avg: 3 }, { name: "甲", num: "", avg: 4 },
    { name: "丙", num: "10", avg: 2 }, { name: "丁", num: "3", avg: 5 },
  ];
  const byNum = (dir: "asc" | "desc") => sortBy(ps, (p) => jerseyValue(p.num), (p) => p.avg, dir).map((p) => p.name);
  assert.deepEqual(byNum("asc"), ["丁", "乙", "丙", "甲"]);
  assert.deepEqual(byNum("desc"), ["丙", "乙", "丁", "甲"]);
  const tie = [{ v: 3, avg: 2 }, { v: 3, avg: 4 }, { v: 5, avg: 1 }];
  assert.deepEqual(sortBy(tie, (p) => p.v, (p) => p.avg, "desc").map((p) => p.avg), [1, 4, 2]);
});

test("位置分線與比對", () => {
  assert.equal(lineOf("ST").name, "進攻");
  assert.equal(lineOf("GK").name, "防守");
  assert.equal(lineOf("LB").name, "防守");
  assert.equal(lineOf("新位置").name, "中場");
  assert.ok(samePosition("LB", "LB/RB"));
  assert.ok(!samePosition("CB", "CDM"));
  const groups = groupByLine(Object.keys(rules.positions));
  assert.equal(groups.reduce((n, g) => n + g.positions.length, 0), Object.keys(rules.positions).length);
});
