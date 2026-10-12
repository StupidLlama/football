// v2.7 AI 匯入練習：lib/practice-import.ts 的測試。
// 完成標準：照指令格式回傳的文字 100% 解析；AI 常見的「多餘東西」也要吃得下；格式錯的行標出原因、不影響其他行。
import test from "node:test";
import assert from "node:assert/strict";
import {
  HEADER, buildPrompt, clashIndexes, okDrafts, parseDate, parseImport, parseTime, toRpcRows,
  type ImportInfo, type ParsedLine,
} from "../lib/practice-import.ts";

const today = new Date(2026, 9, 12); // 2026-10-12（一）
const term = { termStart: "2026-09-14", termEnd: "2027-01-15", today };
const info: ImportInfo = {
  teamName: "資工系隊", termStart: "2026-09-14", termEnd: "2027-01-15",
  location: "光復操場", usual: "每週二、四 19:00–21:00", extra: "期中考週停練",
};

const errorsOf = (l: ParsedLine) => (l.ok ? [] : l.errors);

test("指令裡有格式、規則和基本資訊", () => {
  const p = buildPrompt(info);
  assert.ok(p.includes(HEADER));
  assert.ok(p.includes("資工系隊") && p.includes("2026-09-14 到 2027-01-15") && p.includes("光復操場"));
  assert.ok(p.includes("不要猜"));
  assert.ok(p.includes("每週二、四 19:00–21:00") && p.includes("期中考週停練"));
});

/** 指令最後的範例區塊（``` 之間）。 */
const exampleOf = (p: string) => p.slice(p.lastIndexOf("```", p.length - 4), p.length);

test("指令自己的範例貼回來，100% 解析", () => {
  const r = parseImport(exampleOf(buildPrompt(info)), term);
  const data = r.lines;
  assert.equal(data.length, 2);
  assert.ok(data.every((l) => l.ok), JSON.stringify(data));
  assert.equal(r.comments.length, 1);
});

test("沒填的資訊也能產生指令", () => {
  const p = buildPrompt({ teamName: "", termStart: "", termEnd: "", location: "", usual: "", extra: "" });
  assert.ok(p.includes("我們的球隊") && p.includes("（沒有）"));
  assert.equal(parseImport(exampleOf(p), { today }).lines.filter((l) => !l.ok).length, 0);
});

test("AI 把整段指令照抄回來：規則裡的「|」不會被當成資料，只留範例那兩行", () => {
  const r = parseImport(buildPrompt(info), term);
  assert.equal(r.lines.length, 2);
  assert.ok(r.lines.every((l) => l.ok));
});

test("打錯的日期（有數字）還是標成錯誤，不會被當成說明略過", () => {
  const r = parseImport("2026-1O-13|19:00|21:00\n|19:00|21:00", term);
  assert.deepEqual(r.lines.map((l) => l.ok), [false, false]);
  assert.ok(errorsOf(r.lines[1]).includes("沒有日期"));
});

test("標準格式：每個欄位都對到", () => {
  const r = parseImport(`${HEADER}\n2026-10-13|19:00|21:00|光復操場|18:45|練習|傳接球、分組對抗|帶水和護脛`, term);
  assert.deepEqual(okDrafts(r), [{
    date: "2026-10-13", start: "19:00", end: "21:00", location: "光復操場", meet: "18:45",
    title: "練習", content: "傳接球、分組對抗", note: "帶水和護脛",
  }]);
});

test("AI 常見的多餘東西：說明文字、程式碼框、BOM、CRLF、空行、空白", () => {
  const text = "﻿好的！以下是整理好的練習：\r\n\r\n```text\r\n" + HEADER + "\r\n"
    + "  2026-10-13 | 19:00 | 21:00 | 光復操場 |  |  |  |  \r\n"
    + "2026-10-15|19:00|21:00||||體能|\r\n```\r\n希望有幫助，有問題再告訴我。";
  const r = parseImport(text, term);
  assert.equal(r.lines.length, 2);
  assert.ok(r.lines.every((l) => l.ok));
  assert.equal(r.ignored.length, 2);
  assert.equal(okDrafts(r)[1].content, "體能");
});

test("markdown 表格（頭尾有 |、分隔線）也吃得下", () => {
  const text = "| 日期 | 開始 | 結束 | 地點 | 集合 | 標題 | 內容 | 備註 |\n|---|---|---|---|---|---|---|---|\n"
    + "| 2026-10-13 | 19:00 | 21:00 | 光復操場 |  | 練習 |  |  |";
  const d = okDrafts(parseImport(text, term));
  assert.equal(d.length, 1);
  assert.equal(d[0].location, "光復操場");
  assert.equal(d[0].note, "");
});

test("全形的｜、：、數字", () => {
  const d = okDrafts(parseImport("２０２６－１０－１３｜１９：００｜２１：００｜操場", term));
  assert.deepEqual([d[0].date, d[0].start, d[0].end, d[0].location], ["2026-10-13", "19:00", "21:00", "操場"]);
});

test("少寫後面的欄位 = 空的；內容的中文標點不會被改掉", () => {
  const d = okDrafts(parseImport("2026-10-13|19:00|21:00|操場||練習|傳球，（分組）", term));
  assert.equal(d[0].content, "傳球，（分組）");
  assert.equal(d[0].note, "");
});

test("日期的各種寫法", () => {
  for (const s of ["2026-10-13", "2026/10/13", "2026.10.13", "2026年10月13日", "10/13", "10月13日", "2026-10-13(二)",
                   "2026-10-13（週二）", "2026/10/13 星期二", "10/13(二)", "10月13日（二）"]) {
    assert.deepEqual(parseDate(s, term.termStart, today), { day: "2026-10-13" }, s);
  }
});

test("沒寫年份：跨年的 1 月算隔年", () => {
  assert.deepEqual(parseDate("1/5", "2026-09-14", today), { day: "2027-01-05" });
  assert.deepEqual(parseDate("9/20", "2026-09-14", today), { day: "2026-09-20" });
});

test("星期對不上就標出來（AI 算錯日期最常見）", () => {
  const r = parseDate("2026-10-13(三)", term.termStart, today);
  assert.ok("error" in r && r.error.includes("星期二") && r.error.includes("不是星期三"));
  assert.ok("day" in parseDate("2026-10-18(日)", term.termStart, today));
  assert.ok("day" in parseDate("2026-10-18（週日）", term.termStart, today));
});

test("不存在的日子、年份打錯、看不懂的日期", () => {
  assert.ok("error" in parseDate("2026-02-30", undefined, today));
  assert.ok("error" in parseDate("2029-10-13", undefined, today));
  assert.ok("error" in parseDate("下週二", undefined, today));
  assert.ok("error" in parseDate("13/45", undefined, today));
});

test("時間的各種寫法", () => {
  const cases: [string, string | null][] = [
    ["19:00", "19:00"], ["7:05", "07:05"], ["19:00:00", "19:00"], ["1900", "19:00"], ["19點", "19:00"],
    ["19點30分", "19:30"], ["7點半", "07:30"], ["19時", "19:00"], ["下午7:00", "19:00"], ["晚上7點", "19:00"],
    ["7:00 PM", "19:00"], ["7pm", "19:00"], ["12:30 am", "00:30"], ["上午9:00", "09:00"], ["中午12點", "12:00"],
    ["中午1點", "13:00"], ["１９：００", "19:00"], ["", null], ["25:00", null], ["19:60", null], ["晚餐後", null], ["7", null],
  ];
  for (const [raw, want] of cases) assert.equal(parseTime(raw), want, raw);
});

test("錯的那一行標出原因，其他行照常成功", () => {
  const text = [
    "2026-10-13|19:00|21:00|操場",                 // 2 行：對
    "2026-10-15|21:00|19:00|操場",                 // 3：結束在開始之前
    "2026-10-20|19:00|21:00|操場|19:30",           // 4：集合在開始之後
    "2026-10-22||21:00",                           // 5：沒有開始
    "2026-10-27|19:00|21:00|a|b|c|d|e|f",          // 6：欄位太多
    "2026-10-29 19:00 21:00 操場",                  // 7：沒有用 | 分隔
    "2026-10-13|19:00|22:00|操場",                 // 8：跟第 1 行重複
    "2026-11-03|08:00|17:00|操場",                 // 9：超過 8 小時
    "2026-11-05|19:00|21:00|操場||" + "長".repeat(21), // 10：標題太長
  ].join("\n");
  const r = parseImport(`${HEADER}\n${text}`, term);
  assert.deepEqual(r.lines.map((l) => [l.line, l.ok]), [
    [2, true], [3, false], [4, false], [5, false], [6, false], [7, false], [8, false], [9, false], [10, false],
  ]);
  const e = (n: number) => errorsOf(r.lines.find((l) => l.line === n)!).join("；");
  assert.ok(e(3).includes("結束時間要在開始之後"));
  assert.ok(e(4).includes("集合時間要在開始之前"));
  assert.ok(e(5).includes("沒有開始時間"));
  assert.ok(e(6).includes("欄位太多"));
  assert.ok(e(7).includes("「|」"));
  assert.ok(e(8).includes("跟第 2 行重複"));
  assert.ok(e(9).includes("8 小時"));
  assert.ok(e(10).includes("標題最多 20"));
});

test("# 說明收集起來、不算錯；期間外和已經過去的只提醒", () => {
  const r = parseImport("2026-10-01|19:00|21:00\n2027-02-01|19:00|21:00\n# 11/5 那週看不清楚", term);
  assert.deepEqual(r.comments, ["11/5 那週看不清楚"]);
  assert.ok(r.lines.every((l) => l.ok));
  const w = r.lines.map((l) => (l.ok ? l.warnings : []));
  assert.ok(w[0].includes("這天已經過了"));
  assert.ok(w[1].includes("在期間結束之後"));
});

test("一個學期的完整範例（每週二、四，24 次）全部解析", () => {
  const days: string[] = [];
  for (let d = new Date(2026, 9, 13); d <= new Date(2026, 11, 31); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 2 || d.getDay() === 4) {
      days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
  }
  const text = "```\n" + HEADER + "\n" + days.map((x) => `${x}|19:00|21:00|光復操場|18:45|練習||`).join("\n") + "\n```";
  const r = parseImport(text, term);
  assert.equal(r.lines.length, 24);
  assert.equal(okDrafts(r).length, 24);
});

test("送出前：變成帶時區的 ISO 時間，集合時間空的是 null", () => {
  const rows = toRpcRows(okDrafts(parseImport("2026-10-13|19:00|21:00|操場|18:45\n2026-10-15|19:00|21:00", term)),
    () => "+08:00");
  assert.equal(rows[0].starts_at, "2026-10-13T19:00:00+08:00");
  assert.equal(rows[0].ends_at, "2026-10-13T21:00:00+08:00");
  assert.equal(rows[0].meet_at, "2026-10-13T18:45:00+08:00");
  assert.equal(rows[1].meet_at, null);
  assert.equal(new Date(rows[0].starts_at).toISOString(), "2026-10-13T11:00:00.000Z");
});

test("那天已經有練習的標出來", () => {
  const drafts = okDrafts(parseImport("2026-10-13|19:00|21:00\n2026-10-15|19:00|21:00", term));
  const existing = [new Date(2026, 9, 15, 18, 0).toISOString()];
  assert.deepEqual([...clashIndexes(drafts, existing)], [1]);
});
