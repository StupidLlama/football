// v2.4 組隊：網站版（lib/lineup.ts、lib/assignment.ts）要跟 Python 版（stats/lineup.py）排出一樣的陣容。
// 題目和 Python 的答案在 fixtures/lineup_cases.json（py web/scripts/lineup_fixture.py 產生）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maxAssignment } from "../lib/assignment.ts";
import {
  assign, autoLineup, candidates, carryOver, cleanLocked, findFormation, formationsOf, LineupError, manualLineup,
  picksOf, reason, shortageText, swapSlots, type Formation, type Lineup, type LineupPlayer, type LineupRules,
} from "../lib/lineup.ts";

const rules: LineupRules & { formations: Formation[] } = JSON.parse(readFileSync(new URL("../lib/config.json", import.meta.url), "utf-8"));
const fx = JSON.parse(readFileSync(new URL("./fixtures/lineup_cases.json", import.meta.url), "utf-8"));
const ALL: Formation[] = rules.formations;

type FxPlayer = { id: string; name: string; scores: Record<string, number>; good: string[]; bad: string[] };
const toPlayers = (ps: FxPlayer[]): LineupPlayer[] =>
  ps.map((p) => ({ id: p.id, name: p.name, scores: p.scores, good_positions: p.good, bad_positions: p.bad }));
const dump = (lu: Lineup) => ({
  starters: lu.starters.map((o) => [o.slot, o.name, o.score]),
  empty: lu.empty.map((s) => s.code),
  bench: lu.bench.map((o) => [o.slot, o.name, o.score]),
  total: lu.total,
});

const all3 = (): Record<string, number> => Object.fromEntries(rules.categories.flatMap((c) => c.abilities.map((a) => [a.key, 3])));
const p = (id: string, good: string[] = [], bad: string[] = [], scores: Record<string, number> | null = all3()): LineupPlayer =>
  ({ id, name: id, scores, good_positions: good, bad_positions: bad });

test("加分扣分和 Python 用同一份設定", () => {
  assert.equal(rules.lineup.goodBonus, fx.goodBonus);
  assert.equal(rules.lineup.badPenalty, fx.badPenalty);
});

test("陣型：11 人制 6 種、8 人制 4 種，每種剛好一個門將", () => {
  assert.deepEqual(formationsOf(ALL, 11).map((f) => f.name), ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "3-4-3", "5-3-2"]);
  assert.deepEqual(formationsOf(ALL, 8).map((f) => f.name), ["3-3-1", "3-2-2", "2-3-2", "2-4-1"]);
  for (const f of ALL) {
    assert.equal(f.slots.length, f.size, f.name);
    assert.equal(f.slots.filter((s) => s.role === "GK").length, 1, f.name);
    for (const s of f.slots) assert.ok(s.role in rules.positions, `${f.name} ${s.code}`);
  }
});

test("匈牙利演算法：每一題都跟 Python 的答案一樣", () => {
  for (const m of fx.matrices) assert.deepEqual(maxAssignment(m.scores), m.result, JSON.stringify(m.scores));
  assert.deepEqual(maxAssignment([]), []);
  assert.deepEqual(maxAssignment([[], []]), [-1, -1]);
});

test("自動排人、手動調整：每一題都跟 Python 排的一樣", () => {
  for (const c of fx.cases) {
    const f = findFormation(ALL, c.size, c.formation)!;
    const players = toPlayers(c.players);
    const label = `${c.size} 人 ${c.formation}，${players.length} 位`;
    assert.deepEqual(dump(autoLineup(players, f, rules, c.locked)), c.auto, `自動：${label}`);
    assert.deepEqual(dump(manualLineup(players, f, rules, c.manual_picks)), c.manual, `手動：${label}`);
  }
});

test("同樣的人換個順序，排出來一樣", () => {
  const c = fx.cases[5];
  const f = findFormation(ALL, c.size, c.formation)!;
  const a = toPlayers(c.players);
  assert.deepEqual(dump(autoLineup(a, f, rules)), dump(autoLineup(a.slice().reverse(), f, rules)));
});

test("「LB」算在「LB/RB」裡：擅長加分、不擅長扣分", () => {
  const f = findFormation(ALL, 11, "4-3-3")!;
  const lb = f.slots.find((s) => s.code === "LB")!;
  const [plain] = candidates([p("A")], lb, rules);
  const [good] = candidates([p("A", ["LB"])], lb, rules);
  const [bad] = candidates([p("A", [], ["RB"])], lb, rules);
  assert.equal(good.score, plain.score + rules.lineup.goodBonus);
  assert.equal(bad.score, plain.score - rules.lineup.badPenalty);
  assert.equal(reason(good), "適合度 60 · 自評擅長");
  assert.equal(reason(bad), "適合度 60 · 自評不擅長");
  assert.equal(reason(plain), "適合度 60 · 數據推算");
});

test("還沒填能力表的人也能排，說明寫「還沒填能力表」", () => {
  const f = findFormation(ALL, 8, "3-3-1")!;
  const lu = autoLineup([p("A"), p("B", [], [], null)], f, rules);
  const b = [...lu.starters, ...lu.bench].find((o) => o.id === "B")!;
  assert.equal(b.fit, 0);
  assert.equal(reason(b), "還沒填能力表");
});

test("人數不夠：門將一定先排，並列出缺哪些位置", () => {
  const f = findFormation(ALL, 11, "4-3-3")!;
  const lu = autoLineup([p("A", ["ST"]), p("B", ["ST"]), p("C")], f, rules);
  assert.ok(lu.starters.some((o) => o.role === "GK"));
  assert.equal(lu.empty.length, 8);
  assert.match(shortageText(lu)!, /^人數不夠，還缺 8 個位置：/);
  assert.equal(shortageText(autoLineup(Array.from({ length: 11 }, (_, i) => p(`P${i}`)), f, rules)), null);
});

test("鎖定：鎖住的人不動，其他人重排；名單外或重複鎖定會報錯", () => {
  const f = findFormation(ALL, 8, "3-3-1")!;
  const team = Array.from({ length: 9 }, (_, i) => p(`P${i}`, i === 0 ? ["GK"] : []));
  const lu = autoLineup(team, f, rules, { ST: "P0" } as Record<string, string>);
  assert.equal(lu.starters.find((o) => o.slot === "ST")!.id, "P0");
  assert.throws(() => autoLineup(team, f, rules, { ST: "nobody" }), LineupError);
  assert.throws(() => autoLineup(team, f, rules, { ST: "P1", GK: "P1" }), LineupError);
  // 取消出席或換陣型時，cleanLocked 先把不能用的鎖定拿掉
  assert.deepEqual(cleanLocked({ ST: "P1", GK: "P1", XX: "P2", LB: "gone" }, team, f), { GK: "P1" });
});

test("手動換人：互換、從替補換上、清空", () => {
  const picks = { GK: "A", CB: "B", ST: null };
  assert.deepEqual(assign(picks, "GK", "B"), { picks: { GK: "B", CB: "A", ST: null }, swapped: "CB" });
  assert.deepEqual(assign(picks, "ST", "C"), { picks: { GK: "A", CB: "B", ST: "C" }, swapped: null });
  assert.deepEqual(assign(picks, "GK", null).picks, { GK: null, CB: "B", ST: null });
  assert.deepEqual(swapSlots(picks, "GK", "ST"), { GK: null, CB: "B", ST: "A" });
  assert.deepEqual(picks, { GK: "A", CB: "B", ST: null }, "不能改到傳進來的 picks");
  assert.throws(() => assign(picks, "XX", "A"), LineupError);
});

test("換陣型：同名的位置保留原本的人", () => {
  const from = findFormation(ALL, 11, "4-3-3")!, to = findFormation(ALL, 11, "4-2-3-1")!;
  const team = Array.from({ length: 14 }, (_, i) => p(`P${i}`));
  const picks = picksOf(autoLineup(team, from, rules));
  const kept = carryOver(picks, to);
  assert.deepEqual(Object.keys(kept), to.slots.map((s) => s.code));
  assert.equal(kept.GK, picks.GK);
  assert.equal(kept.CAM, null);
});

test("名單裡同一個人出現兩次會報錯", () => {
  const f = findFormation(ALL, 8, "3-3-1")!;
  assert.throws(() => autoLineup([p("A"), p("A")], f, rules), LineupError);
});
