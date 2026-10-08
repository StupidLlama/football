// v2.6.1 名單管理：lib/roster.ts 純計算的測試（規則跟 0010_roster.sql 的 roster_problem 一樣）。
import test from "node:test";
import assert from "node:assert/strict";
import { cleanJersey, rosterProblem, sortRoster, type RosterRow } from "../lib/roster.ts";

const rows: RosterRow[] = [
  { id: "a", name: "阿明", jersey_number: "7", badge: "C" },
  { id: "b", name: "小華", jersey_number: "10", badge: "VC" },
  { id: "c", name: "大雄", jersey_number: null, badge: null },
];

test("cleanJersey：空白 = 還沒決定，07 → 7，其他原樣", () => {
  assert.equal(cleanJersey(""), null);
  assert.equal(cleanJersey("   "), null);
  assert.equal(cleanJersey(" 07 "), "7");
  assert.equal(cleanJersey("0"), "0");
  assert.equal(cleanJersey("十"), "十");
});

test("新增：姓名、背號、隊長都不能跟別人重複", () => {
  assert.equal(rosterProblem(rows, { name: "新人", jersey: "", badge: null }), null);
  assert.equal(rosterProblem(rows, { name: "  ", jersey: "", badge: null }), "姓名要 1–40 字");
  assert.equal(rosterProblem(rows, { name: "x".repeat(41), jersey: "", badge: null }), "姓名要 1–40 字");
  assert.match(rosterProblem(rows, { name: " 阿明 ", jersey: "", badge: null }) ?? "", /已經有「阿明」/);
  assert.match(rosterProblem(rows, { name: "新人", jersey: "07", badge: null }) ?? "", /背號 7 已經是「阿明」/);
  assert.equal(rosterProblem(rows, { name: "新人", jersey: "十號", badge: null }), "背號只能是 0–999 的數字");
  assert.equal(rosterProblem(rows, { name: "新人", jersey: "1000", badge: null }), "背號只能是 0–999 的數字");
  assert.match(rosterProblem(rows, { name: "新人", jersey: "", badge: "C" }) ?? "", /隊長目前是「阿明」/);
  assert.match(rosterProblem(rows, { name: "新人", jersey: "", badge: "VC" }) ?? "", /副隊長目前是「小華」/);
});

test("編輯：自己原本的值不算重複；只檢查有改到的欄位", () => {
  const me = rows[0];
  assert.equal(rosterProblem(rows, { name: "阿明", jersey: "7", badge: "C" }, me), null, "沒改東西");
  assert.match(rosterProblem(rows, { name: "阿明", jersey: "10", badge: "C" }, me) ?? "", /背號 10 已經是「小華」/);
  assert.match(rosterProblem(rows, { name: "大雄", jersey: "7", badge: "C" }, me) ?? "", /已經有「大雄」/);
  // 舊資料本來就重複（例如 v1 匯入兩個人都是 9 號）：只改名字不會被擋
  const old: RosterRow[] = [...rows, { id: "d", name: "胖虎", jersey_number: "9", badge: null }, { id: "e", name: "小夫", jersey_number: "9", badge: null }];
  assert.equal(rosterProblem(old, { name: "胖虎改名", jersey: "9", badge: null }, old[3]), null);
  // 隊長交接：原本的人先改成無，新的人才能當
  assert.match(rosterProblem(rows, { name: "大雄", jersey: "", badge: "C" }, rows[2]) ?? "", /請先把他的標記拿掉/);
  const after = rows.map((r) => (r.id === "a" ? { ...r, badge: null } : r));
  assert.equal(rosterProblem(after, { name: "大雄", jersey: "", badge: "C" }, after[2]), null);
});

test("sortRoster：隊長、副隊長在前，再照背號，沒背號最後", () => {
  const extra: RosterRow[] = [...rows, { id: "d", name: "胖虎", jersey_number: "3", badge: null }];
  assert.deepEqual(sortRoster(extra).map((r) => r.id), ["a", "b", "d", "c"]);
});
