// v2.5 比賽列表＋出賽登記：lib/matches.ts 純計算的測試。
import test from "node:test";
import assert from "node:assert/strict";
import {
  answerOf, bucketOf, countdown, countsFor, fromLocalInput, gameStatus, groupPlayers, importableFixtures,
  isLocked, kickoffLabel, meetLabel, resultOf, scoreLabel, splitGames, toLocalInput,
} from "../lib/matches.ts";
import type { Attendance, Fixture, Match } from "../lib/api.ts";

const now = new Date("2026-10-10T12:00:00Z");

function match(over: Partial<Match> = {}): Match {
  return {
    id: "m1", team_id: "t1", opponent: "對手隊", kickoff: "2026-10-16T11:00:00Z", meet_at: null,
    location: "", jersey: "", size: 11, note: "", our_score: null, their_score: null, fixture_id: null,
    created_by: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...over,
  };
}

function att(over: Partial<Attendance> = {}): Attendance {
  return { match_id: "m1", player_id: "p1", team_id: "t1", status: "in", note: "", updated_by: null, updated_at: "2026-10-02T00:00:00Z", ...over };
}

test("gameStatus：開賽前且沒比分 = 即將進行；過了開賽時間或填了比分 = 已結束", () => {
  assert.equal(gameStatus(match({ kickoff: "2026-10-16T11:00:00Z" }), now), "upcoming");
  assert.equal(gameStatus(match({ kickoff: "2026-10-01T00:00:00Z" }), now), "done");
  assert.equal(gameStatus(match({ kickoff: "2026-10-16T11:00:00Z", our_score: 2, their_score: 1 }), now), "done");
});

test("isLocked 跟 gameStatus 一致（已結束就鎖住）", () => {
  assert.equal(isLocked(match(), now), false);
  assert.equal(isLocked(match({ our_score: 1, their_score: 1 }), now), true);
});

test("answerOf：找得到回傳狀態，沒登記過回傳 null", () => {
  const rows = [att({ player_id: "p1", status: "in" }), att({ player_id: "p2", status: "out" })];
  assert.equal(answerOf(rows, "m1", "p1"), "in");
  assert.equal(answerOf(rows, "m1", "p2"), "out");
  assert.equal(answerOf(rows, "m1", "p3"), null);
  assert.equal(answerOf(rows, "m2", "p1"), null, "比賽 id 不對也要是 null");
});

test("countsFor：出席／請假／還沒回覆的人數加起來等於全隊", () => {
  const rows = [att({ player_id: "p1", status: "in" }), att({ player_id: "p2", status: "in" }), att({ player_id: "p3", status: "out" })];
  assert.deepEqual(countsFor(rows, "m1", 5), { in: 2, out: 1, pending: 2 });
  assert.deepEqual(countsFor(rows, "m1", 2), { in: 2, out: 1, pending: 0 }, "人數算錯也不會變負數");
});

test("bucketOf / groupPlayers：分三組，沒回覆的進 pending", () => {
  const rows = [att({ player_id: "p1", status: "in" }), att({ player_id: "p2", status: "out" })];
  assert.equal(bucketOf(rows, "m1", "p1"), "in");
  assert.equal(bucketOf(rows, "m1", "p3"), "pending");
  const players = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
  const g = groupPlayers(players, rows, "m1");
  assert.deepEqual(g.in.map((p) => p.id), ["p1"]);
  assert.deepEqual(g.out.map((p) => p.id), ["p2"]);
  assert.deepEqual(g.pending.map((p) => p.id), ["p3"]);
});

test("splitGames：即將進行照時間排（最近在前）；已結束也照時間排但倒序（最近結束的在前）", () => {
  const games = [
    match({ id: "a", kickoff: "2026-10-20T11:00:00Z" }),
    match({ id: "b", kickoff: "2026-10-16T11:00:00Z" }),
    match({ id: "c", kickoff: "2026-10-01T00:00:00Z" }),
    match({ id: "d", kickoff: "2026-09-20T00:00:00Z" }),
  ];
  const { upcoming, done } = splitGames(games, now);
  assert.deepEqual(upcoming.map((m) => m.id), ["b", "a"]);
  assert.deepEqual(done.map((m) => m.id), ["c", "d"]);
});

test("kickoffLabel / meetLabel：日期時間格式", () => {
  assert.equal(kickoffLabel("2026-10-16T11:00:00Z"), kickoffLabel(new Date("2026-10-16T11:00:00Z").toISOString()));
  const label = kickoffLabel("2026-10-16T11:00:00.000Z");
  assert.match(label, /^\d{2}\/\d{2}（.）\d{2}:\d{2}$/);
  // 集合時間跟開賽同一天只顯示時刻
  const sameDay = meetLabel("2026-10-16T10:20:00.000Z", "2026-10-16T11:00:00.000Z");
  assert.match(sameDay, /^\d{2}:\d{2}$/);
});

test("scoreLabel / resultOf：沒填比分不算輸贏", () => {
  assert.equal(scoreLabel(match()), "");
  assert.equal(resultOf(match()), null);
  assert.equal(scoreLabel(match({ our_score: 2, their_score: 1 })), "2 – 1");
  assert.equal(resultOf(match({ our_score: 2, their_score: 1 })), "W");
  assert.equal(resultOf(match({ our_score: 1, their_score: 2 })), "L");
  assert.equal(resultOf(match({ our_score: 1, their_score: 1 })), "D");
});

test("countdown：天數小時數不會是負的", () => {
  assert.deepEqual(countdown(now.toISOString(), now), { days: 0, hours: 0 });
  const past = countdown("2026-10-01T00:00:00Z", now);
  assert.deepEqual(past, { days: 0, hours: 0 }, "已經過去的時間不會變負數");
});

test("toLocalInput / fromLocalInput：互相轉換（datetime-local 輸入框）", () => {
  const iso = "2026-10-16T11:30:00.000Z";
  const local = toLocalInput(iso);
  assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(toLocalInput(null), "");
  assert.equal(fromLocalInput(""), null);
  const back = fromLocalInput(local);
  assert.ok(back && new Date(back).getTime() === new Date(iso).getTime());
});

function fixture(over: Partial<Fixture> = {}): Fixture {
  return {
    id: "f1", day: "2026-10-20", start_time: "19:00:00", end_time: null, home: "資訊", away: "機械",
    round: 3, match_no: 1, home_score: null, away_score: null, referee: "", linesmen: [], note: "", ...over,
  };
}

test("importableFixtures：只挑我們隊、還沒建立、還沒開賽的場次，照時間排", () => {
  const fixtures = [
    fixture({ id: "f1", day: "2026-10-20" }),
    fixture({ id: "f2", day: "2026-10-18", home: "土木", away: "資訊" }),   // 我們是客場，也算
    fixture({ id: "f3", day: "2026-10-05" }),                              // 已經過了，不列
    fixture({ id: "f4", day: "2026-11-01", home: "化工", away: "機械" }),   // 不是我們隊
    fixture({ id: "f5", day: "2026-11-05", start_time: null }),            // 沒開賽時間
  ];
  const matches = [match({ id: "m1", fixture_id: "f1" })];                 // f1 已經建立過了
  const out = importableFixtures(fixtures, matches, "資訊", now);
  assert.deepEqual(out.map((f) => f.id), ["f2"]);
  assert.deepEqual(importableFixtures(fixtures, [], "資訊", now).map((f) => f.id), ["f2", "f1"], "照時間排，最近的在前");
  assert.deepEqual(importableFixtures(fixtures, [], null, now), [], "還沒設定聯賽隊名就什麼都不給");
});
