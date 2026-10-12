// v2.7 練習行事曆：lib/calendar.ts、lib/practices.ts、待辦的測試（純計算）。
import test from "node:test";
import assert from "node:assert/strict";
import type { Match, Practice, PracticeAttendance } from "../lib/api.ts";
import { addDays, dayLabel, monthGrid, monthRange, shiftMonth, weekHeader, weekdayOf } from "../lib/calendar.ts";
import {
  announceText, answerOfPractice, expandSeries, groupByDay, groupPracticePlayers, isPracticeLocked, nextPractice,
  practiceCounts, practiceStatus, restOfSeriesCount, timeRange, titleOf, type SeriesInput,
} from "../lib/practices.ts";
import { todosFor } from "../lib/todos.ts";
import { buildTeamView } from "../lib/teamview.ts";
import { readFileSync } from "node:fs";
import type { Rules } from "../lib/rating.ts";

const RULES: Rules = JSON.parse(readFileSync(new URL("../lib/config.json", import.meta.url), "utf-8"));

const at = (y: number, m: number, d: number, h = 19, mi = 0) => new Date(y, m - 1, d, h, mi).toISOString();
const prac = (id: string, start: string, end: string, extra: Partial<Practice> = {}): Practice => ({
  id, team_id: "t", starts_at: start, ends_at: end, meet_at: null, location: "", title: "", content: "", note: "",
  series_id: null, created_by: null, created_at: start, updated_at: start, ...extra,
});

test("月曆：2026 年 10 月，週一開頭，整週整週排、前後補相鄰月份", () => {
  const g = monthGrid(2026, 10, "2026-10-12");
  assert.equal(g.length, 5);
  assert.ok(g.every((w) => w.length === 7));
  assert.equal(g[0][0].day, "2026-09-28");           // 10/1 是週四 → 前面補 9/28–9/30
  assert.equal(g[0][3].day, "2026-10-01");
  assert.equal(g[4][6].day, "2026-11-01");
  assert.deepEqual(g[0].map((c) => c.inMonth), [false, false, false, true, true, true, true]);
  assert.deepEqual(g.flat().filter((c) => c.today).map((c) => c.day), ["2026-10-12"]);
  assert.equal(weekdayOf(g[0][0].day), 1);
});

test("月曆：週日開頭、剛好 4 週的二月、要 6 週的月份", () => {
  assert.equal(monthGrid(2026, 10, "", 0)[0][0].day, "2026-09-27");
  assert.equal(monthGrid(2026, 2, "").length, 5);     // 2026/2/1 是週日、共 28 天 → 週一開頭前面要補 6 天，所以 5 週
  assert.equal(monthGrid(2026, 2, "", 0).length, 4);
  assert.equal(monthGrid(2026, 8, "").length, 6);     // 2026/8/1 是週六、31 天
  assert.deepEqual(weekHeader(), ["一", "二", "三", "四", "五", "六", "日"]);
  assert.deepEqual(weekHeader(0)[0], "日");
});

test("月份切換、日期加減、標籤", () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 10, 14), { year: 2027, month: 12 });
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(dayLabel("2026-10-13"), "10/13（二）");
  assert.deepEqual(monthRange(2026, 2), { from: "2026-02-01", to: "2026-02-28" });
});

test("狀態與鎖定：開始的那一刻起球員就不能改", () => {
  const p = prac("a", at(2026, 10, 13), at(2026, 10, 13, 21));
  assert.equal(practiceStatus(p, new Date(2026, 9, 13, 18, 59)), "upcoming");
  assert.equal(practiceStatus(p, new Date(2026, 9, 13, 19, 0)), "done");
  assert.equal(isPracticeLocked(p, new Date(2026, 9, 13, 18, 59)), false);
  assert.equal(isPracticeLocked(p, new Date(2026, 9, 13, 19, 0)), true);
  assert.equal(titleOf(p), "練習");
  assert.equal(titleOf({ title: " 體能 " }), "體能");
  assert.equal(timeRange(p), "19:00–21:00");
});

test("月曆每一天：練習和比賽分開、依時間排", () => {
  const ps = [prac("late", at(2026, 10, 13, 21), at(2026, 10, 13, 22)), prac("early", at(2026, 10, 13, 8), at(2026, 10, 13, 9)),
              prac("other", at(2026, 10, 15), at(2026, 10, 15, 21))];
  const ms = [{ id: "m", kickoff: at(2026, 10, 15, 20) } as Match];
  const g = groupByDay(ps, ms);
  assert.deepEqual(g.get("2026-10-13")!.practices.map((p) => p.id), ["early", "late"]);
  assert.equal(g.get("2026-10-15")!.matches.length, 1);
  assert.equal(g.get("2026-10-15")!.practices.length, 1);
  assert.equal(g.get("2026-10-14"), undefined);
});

test("出席人數、分組、自己的回覆", () => {
  const rows: PracticeAttendance[] = [
    { practice_id: "a", player_id: "p1", team_id: "t", status: "in", note: "", updated_by: null, updated_at: "" },
    { practice_id: "a", player_id: "p2", team_id: "t", status: "out", note: "", updated_by: null, updated_at: "" },
    { practice_id: "b", player_id: "p3", team_id: "t", status: "in", note: "", updated_by: null, updated_at: "" },
  ];
  assert.deepEqual(practiceCounts(rows, "a", 5), { in: 1, out: 1, pending: 3 });
  assert.equal(answerOfPractice(rows, "a", "p2"), "out");
  assert.equal(answerOfPractice(rows, "a", "p3"), null);
  const g = groupPracticePlayers([{ id: "p1" }, { id: "p2" }, { id: "p3" }], rows, "a");
  assert.deepEqual([g.in.length, g.out.length, g.pending.length], [1, 1, 1]);
});

test("下一次還沒開始的練習", () => {
  const ps = [prac("past", at(2026, 10, 1), at(2026, 10, 1, 21)), prac("n2", at(2026, 10, 20), at(2026, 10, 20, 21)),
              prac("n1", at(2026, 10, 13), at(2026, 10, 13, 21))];
  assert.equal(nextPractice(ps, new Date(2026, 9, 12))!.id, "n1");
  assert.equal(nextPractice(ps, new Date(2026, 9, 30)), null);
});

const series: SeriesInput = {
  weekdays: [2, 4], from: "2026-10-12", to: "2026-12-31", start: "19:00", end: "21:00", meet: "18:45",
  location: "光復操場", title: "", content: "", note: "",
};

test("固定練習：每週二、四到 12/31，共 24 次", () => {
  const r = expandSeries(series, []);
  assert.equal(r.problem, null);
  assert.equal(r.drafts.length, 24);
  assert.equal(r.drafts[0].date, "2026-10-13");
  assert.equal(r.drafts[1].date, "2026-10-15");
  assert.equal(r.drafts.at(-1)!.date, "2026-12-31");
  assert.ok(r.drafts.every((d) => [2, 4].includes(weekdayOf(d.date))));
  assert.deepEqual(r.skipped, []);
});

test("固定練習：那天已經有練習就跳過、列出來", () => {
  const r = expandSeries({ ...series, to: "2026-10-22" }, ["2026-10-15", "2026-10-17"]);
  assert.deepEqual(r.drafts.map((d) => d.date), ["2026-10-13", "2026-10-20", "2026-10-22"]);
  assert.deepEqual(r.skipped, ["2026-10-15"]);
});

test("固定練習：輸入有問題時說明原因，不會默默截斷", () => {
  assert.match(expandSeries({ ...series, weekdays: [] }, []).problem!, /哪幾天/);
  assert.match(expandSeries({ ...series, to: "2026-10-01" }, []).problem!, /最後一天/);
  assert.match(expandSeries({ ...series, end: "18:00" }, []).problem!, /結束時間/);
  assert.match(expandSeries({ ...series, meet: "19:30" }, []).problem!, /集合時間/);
  assert.match(expandSeries({ ...series, weekdays: [0, 1, 2, 3, 4, 5, 6], to: "2027-01-31" }, []).problem!, /最多建立 60/);
  assert.match(expandSeries({ ...series, to: "2026-10-14" }, ["2026-10-13"]).problem!, /沒有符合|都已經有/);
});

test("系列刪除：算出從這一次開始之後有幾次", () => {
  const ps = [1, 2, 3, 4].map((i) => prac(`s${i}`, at(2026, 10, 10 + i), at(2026, 10, 10 + i, 21), { series_id: "S" }));
  assert.equal(restOfSeriesCount(ps, ps[1]), 3);
  assert.equal(restOfSeriesCount(ps, ps[3]), 1);
  assert.equal(restOfSeriesCount(ps, prac("solo", at(2026, 10, 1), at(2026, 10, 1, 21))), 1);
});

test("通知文字：單次新增、更新、一批", () => {
  const p = prac("a", at(2026, 10, 13), at(2026, 10, 13, 21), { location: "光復操場", title: "體能", content: "帶水" });
  assert.match(announceText("new", [p]), /^新增練習：10\/13（二）19:00–21:00 @光復操場（體能）\n帶水/);
  assert.match(announceText("update", [p]), /^練習有更新：/);
  const many = Array.from({ length: 14 }, (_, i) => prac(`x${i}`, at(2026, 10, 13 + i), at(2026, 10, 13 + i, 21)));
  const t = announceText("batch", many);
  assert.match(t, /新增了 14 次練習/);
  assert.match(t, /…還有 2 次/);
  assert.equal(announceText("batch", []), "");
});

// ---------- 首頁待辦 ----------
function viewWith(practices: Practice[], attendance: PracticeAttendance[]) {
  const data = {
    team: { id: "t", code: "X", name: "測試", season: null, league_name: null },
    me: { team_id: "t", user_id: "u1", role: "player" as const, player_id: "p1", joined_at: "", career_shared: false,
          claim_player_id: null, claim_new_name: null, claim_at: null },
    members: [], profiles: [], players: [{ id: "p1", team_id: "t", name: "甲", nickname: "", jersey_number: null, badge: null,
      good_positions: [], bad_positions: [], weak_side: "" as const, message: "" }],
    ratings: [{ player_id: "p1", scores: { passing: 3 }, submitted_at: "2026-10-01T00:00:00Z", source: "form" }],
    fixtures: [], duties: [], guards: [], matches: [], attendance: [], practices, practiceAttendance: attendance,
    chat: { lastReadAt: null, unread: 0, newPinned: false },
  };
  return buildTeamView(data, RULES);
}

test("首頁待辦：下一次練習還沒回覆才提醒，回覆了或已開始就不提醒", () => {
  const now = new Date(2026, 9, 12, 10);
  const p = prac("a", at(2026, 10, 13), at(2026, 10, 13, 21), { location: "操場" });
  const todo = todosFor(viewWith([p], []), "t", false, now).find((t) => t.key === "practice_attendance");
  assert.ok(todo);
  assert.equal(todo!.href, "/t/t/practice?day=2026-10-13");
  assert.match(todo!.detail, /操場/);
  const answered: PracticeAttendance = { practice_id: "a", player_id: "p1", team_id: "t", status: "in", note: "", updated_by: null, updated_at: "" };
  assert.equal(todosFor(viewWith([p], [answered]), "t", false, now).some((t) => t.key === "practice_attendance"), false);
  assert.equal(todosFor(viewWith([p], []), "t", false, new Date(2026, 9, 13, 19, 30)).some((t) => t.key === "practice_attendance"), false);
  assert.equal(todosFor(viewWith([], []), "t", false, now).some((t) => t.key === "practice_attendance"), false);
});
