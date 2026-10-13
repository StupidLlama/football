// v2.9：意見回饋（裝置、狀態、未讀回覆）、加到日曆（.ics）。執行：npm test（在 web 資料夾）
import test from "node:test";
import assert from "node:assert/strict";
import { deviceLabel, feedbackBadge, hasUnreadReply, pagePath, sortFeedback, statusLabel } from "../lib/feedback.ts";
import { buildIcs, escapeText, foldLine, icsFileName, icsTime, matchEvent, practiceEvent, seasonEvents } from "../lib/ics.ts";
import type { Match, Practice } from "../lib/api.ts";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  androidTab: "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0",
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0",
};

// ---------- 意見回饋 ----------
test("裝置：手機、平板（包含假裝是 Mac 的 iPad）、電腦，加上瀏覽器", () => {
  assert.equal(deviceLabel(UA.iphone), "手機 · Safari");
  assert.equal(deviceLabel(UA.ipad, 5), "平板 · Safari");
  assert.equal(deviceLabel(UA.ipad, 0), "電腦 · Safari");
  assert.equal(deviceLabel(UA.android), "手機 · Chrome");
  assert.equal(deviceLabel(UA.androidTab), "平板 · Chrome");
  assert.equal(deviceLabel(UA.edge), "電腦 · Edge");
  assert.equal(deviceLabel(UA.line), "手機 · LINE 內建瀏覽器");
  assert.equal(deviceLabel(""), "電腦 · 其他瀏覽器");
  assert.ok(deviceLabel("x".repeat(500)).length <= 60);
});

test("頁面只留路徑，不留 ? 後面的參數", () => {
  assert.equal(pagePath("https://example.com/t/abc/players?tab=x#y"), "/t/abc/players");
  assert.equal(pagePath("/settings?team=1"), "/settings");
  assert.ok(pagePath("/" + "a".repeat(500)).length <= 200);
});

test("狀態文字", () => {
  assert.equal(statusLabel("new"), "新的");
  assert.equal(statusLabel("doing"), "處理中");
  assert.equal(statusLabel("done"), "已解決");
});

const fb = (over: Partial<Parameters<typeof feedbackBadge>[0][number]> & { created_at?: string }) => ({
  user_id: "me", status: "new", reply: "", replied_at: null, reply_read_at: null, created_at: "2026-10-13T00:00:00Z", ...over,
});

test("未讀回覆：有回覆、沒看過或看過之後又回覆", () => {
  assert.equal(hasUnreadReply(fb({})), false, "沒有回覆");
  assert.equal(hasUnreadReply(fb({ reply: "好", replied_at: "2026-10-13T01:00:00Z" })), true);
  assert.equal(hasUnreadReply(fb({ reply: "好", replied_at: "2026-10-13T01:00:00Z", reply_read_at: "2026-10-13T02:00:00Z" })), false);
  assert.equal(hasUnreadReply(fb({ reply: "又補充", replied_at: "2026-10-13T03:00:00Z", reply_read_at: "2026-10-13T02:00:00Z" })), true);
});

test("小圓點：自己沒看過的回覆；網站管理員再加上新的回饋", () => {
  const list = [
    fb({ reply: "好", replied_at: "2026-10-13T01:00:00Z" }),                 // 我的、沒看過的回覆
    fb({ user_id: "other", status: "new" }),                                 // 別人的新回饋
    fb({ user_id: "other", status: "done", reply: "x", replied_at: "2026-10-13T01:00:00Z" }), // 別人的回覆不算我的
  ];
  assert.equal(feedbackBadge(list, "me", false), 1);
  // 網站管理員：我的未讀 1 ＋ 狀態是「新的」的 2（我的那則也是 new）
  assert.equal(feedbackBadge(list, "me", true), 3);
  assert.equal(feedbackBadge([], "me", true), 0);
});

test("回饋管理排序：新的 → 處理中 → 已解決，同狀態新的在前", () => {
  const sorted = sortFeedback([
    { id: "a", status: "done", created_at: "2026-10-13T05:00:00Z" },
    { id: "b", status: "new", created_at: "2026-10-12T00:00:00Z" },
    { id: "c", status: "doing", created_at: "2026-10-13T00:00:00Z" },
    { id: "d", status: "new", created_at: "2026-10-13T00:00:00Z" },
  ]);
  assert.deepEqual(sorted.map((x) => x.id), ["d", "b", "c", "a"]);
});

// ---------- 加到日曆 ----------
const practice = (over: Partial<Practice> = {}): Practice => ({
  id: "p1", team_id: "t", starts_at: "2026-10-20T11:00:00Z", ends_at: "2026-10-20T13:00:00Z", meet_at: null,
  location: "成大光復操場", title: "", content: "傳接球, 小場對抗", note: "", series_id: null,
  created_by: null, created_at: "", updated_at: "", ...over,
});
const match = (over: Partial<Match> = {}): Match => ({
  id: "m1", team_id: "t", opponent: "電機", kickoff: "2026-10-22T10:00:00Z", meet_at: null, location: "成大足球場",
  jersey: "白", size: 11, note: "", our_score: null, their_score: null, fixture_id: null,
  created_by: null, created_at: "", updated_at: "", ...over,
});

test("時間一律寫成 UTC", () => {
  assert.equal(icsTime("2026-10-20T11:00:00Z"), "20261020T110000Z");
  assert.equal(icsTime("2026-10-20T19:00:00+08:00"), "20261020T110000Z");
});

test("文字跳脫：分號、逗號、反斜線、換行", () => {
  assert.equal(escapeText("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne");
});

test("超過 75 個位元組要折行，中文不能從中間切開", () => {
  const line = "DESCRIPTION:" + "練習".repeat(40);
  const folded = foldLine(line);
  const parts = folded.split("\r\n");
  assert.ok(parts.length > 1);
  for (const [i, p] of parts.entries()) {
    assert.ok(new TextEncoder().encode(p).length <= 75, `第 ${i + 1} 行太長`);
    if (i > 0) assert.ok(p.startsWith(" "));
  }
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(""), line, "接回去要一模一樣");
  assert.equal(foldLine("SHORT"), "SHORT");
});

test("練習和比賽變成日曆行程", () => {
  const p = practiceEvent(practice({ meet_at: "2026-10-20T10:45:00Z", note: "帶水" }), "資訊系足");
  assert.equal(p.title, "資訊系足｜練習");
  assert.equal(p.location, "成大光復操場");
  assert.match(p.description ?? "", /^集合 \d{2}:\d{2}\n傳接球, 小場對抗\n帶水$/);
  const m = matchEvent(match(), "資訊系足");
  assert.equal(m.title, "資訊系足｜比賽 vs 電機");
  assert.equal(m.end, "2026-10-22T12:00:00.000Z", "比賽預設 2 小時");
  assert.match(m.description ?? "", /球衣 白\n11 人制/);
});

test("整份 .ics：格式正確、每個行程都有 UID、用 CRLF", () => {
  const ics = buildIcs([practiceEvent(practice(), "資訊系足"), matchEvent(match(), "資訊系足")], "資訊系足",
    new Date("2026-10-13T00:00:00Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.ok(ics.includes("UID:practice-p1@football-analysis-potato"));
  assert.ok(ics.includes("UID:match-m1@football-analysis-potato"));
  assert.ok(ics.includes("DTSTAMP:20261013T000000Z"));
  assert.ok(ics.includes("DTSTART:20261020T110000Z") && ics.includes("DTEND:20261020T130000Z"));
  assert.ok(ics.includes("DESCRIPTION:傳接球\\, 小場對抗"));
  assert.ok(!ics.includes("VALARM"), "提醒等接 LINE 機器人再做");
  assert.ok(!/[^\r]\n/.test(ics), "每一行都要用 CRLF 結尾");
});

test("整季：只放還沒結束的，依時間排", () => {
  const now = new Date("2026-10-21T00:00:00Z");
  const list = seasonEvents(
    [practice({ id: "old", starts_at: "2026-10-01T11:00:00Z", ends_at: "2026-10-01T13:00:00Z" }),
     practice({ id: "late", starts_at: "2026-10-25T11:00:00Z", ends_at: "2026-10-25T13:00:00Z" })],
    [match({ id: "m1" }), match({ id: "gone", kickoff: "2026-10-10T10:00:00Z" })],
    "資訊系足", now);
  assert.deepEqual(list.map((e) => e.uid), ["match-m1", "practice-late"]);
  // 正在進行的比賽（開始了、還沒過 2 小時）還算
  assert.equal(seasonEvents([], [match({ kickoff: "2026-10-20T23:00:00Z" })], "x", now).length, 1);
});

test("檔名不能有斜線這類符號", () => {
  assert.equal(icsFileName("資訊系足/2026 秋"), "資訊系足-2026-秋.ics");
  assert.equal(icsFileName("///"), "calendar.ics");
});
