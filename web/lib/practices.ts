// 練習行事曆＋出席（v2.7 F11）：純計算，不碰畫面和資料庫。
// 規則跟資料庫一致：開始後球員就不能改出席（球隊管理員不受限制，見 set_practice_attendance / attendance_who）。
import type { Match, Practice, PracticeAttendance, AttendanceAnswer } from "./api.ts";
import { addDays, dayLabel, dayOf, weekdayOf } from "./calendar.ts";
import { localDay, MAX_ROWS, type Draft } from "./practice-import.ts";

const pad = (n: number) => String(n).padStart(2, "0");

export type PracticeStatus = "upcoming" | "done";

/** 狀態不存欄位：開始前 = 即將進行；過了開始時間 = 已結束。 */
export function practiceStatus(p: Pick<Practice, "starts_at">, now: Date): PracticeStatus {
  return now.getTime() >= new Date(p.starts_at).getTime() ? "done" : "upcoming";
}

/** 球員能不能自己改出席：開始後就鎖住。 */
export function isPracticeLocked(p: Pick<Practice, "starts_at">, now: Date): boolean {
  return practiceStatus(p, now) === "done";
}

export function titleOf(p: Pick<Practice, "title">): string {
  return p.title.trim() || "練習";
}

export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 「19:00–21:00」 */
export function timeRange(p: Pick<Practice, "starts_at" | "ends_at">): string {
  return `${hhmm(p.starts_at)}–${hhmm(p.ends_at)}`;
}

/** 「10/13（二）19:00–21:00」 */
export function whenText(p: Pick<Practice, "starts_at" | "ends_at">): string {
  return `${dayLabel(localDay(p.starts_at))}${timeRange(p)}`;
}

export function practiceDay(p: Pick<Practice, "starts_at">): string {
  return localDay(p.starts_at);
}

export function byStart<T extends { starts_at: string }>(a: T, b: T): number {
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
}

// ---------------------------------------------------------------- 月曆上每一天有什麼

export type DayItems = { practices: Practice[]; matches: Match[] };

/** 依「當地日期」分組：練習和本隊的比賽（比賽在月曆上不同顏色、不能在這裡改）。 */
export function groupByDay(practices: Practice[], matches: Match[]): Map<string, DayItems> {
  const out = new Map<string, DayItems>();
  const at = (day: string) => {
    let x = out.get(day);
    if (!x) { x = { practices: [], matches: [] }; out.set(day, x); }
    return x;
  };
  for (const p of practices) at(localDay(p.starts_at)).practices.push(p);
  for (const m of matches) at(localDay(m.kickoff)).matches.push(m);
  for (const x of out.values()) {
    x.practices.sort(byStart);
    x.matches.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  }
  return out;
}

// ---------------------------------------------------------------- 出席

export function answerOfPractice(rows: PracticeAttendance[], practiceId: string, playerId: string): AttendanceAnswer | null {
  return rows.find((a) => a.practice_id === practiceId && a.player_id === playerId)?.status ?? null;
}

export type Counts = { in: number; out: number; pending: number };

export function practiceCounts(rows: PracticeAttendance[], practiceId: string, rosterSize: number): Counts {
  const mine = rows.filter((a) => a.practice_id === practiceId);
  const inN = mine.filter((a) => a.status === "in").length;
  const outN = mine.filter((a) => a.status === "out").length;
  return { in: inN, out: outN, pending: Math.max(0, rosterSize - inN - outN) };
}

export type Bucket = "in" | "out" | "pending";

/** 名單依出席／請假／還沒回覆分組。 */
export function groupPracticePlayers<P extends { id: string }>(players: P[], rows: PracticeAttendance[], practiceId: string):
  Record<Bucket, P[]> {
  const out: Record<Bucket, P[]> = { in: [], out: [], pending: [] };
  for (const p of players) out[answerOfPractice(rows, practiceId, p.id) ?? "pending"].push(p);
  return out;
}

/** 下一次還沒開始的練習（首頁待辦用）。 */
export function nextPractice(practices: Practice[], now: Date): Practice | null {
  return [...practices].sort(byStart).find((p) => practiceStatus(p, now) === "upcoming") ?? null;
}

// ---------------------------------------------------------------- 固定練習（每週幾、到哪天）

export type SeriesInput = {
  weekdays: number[];     // 0 = 日 … 6 = 六
  from: string;           // 第一天（含）YYYY-MM-DD
  to: string;             // 最後一天（含）
  start: string;          // HH:MM
  end: string;            // HH:MM
  meet: string;           // HH:MM 或空字串
  location: string;
  title: string;
  content: string;
  note: string;
};

export type SeriesPreview = {
  drafts: Draft[];        // 要建立的
  skipped: string[];      // 那天已經有練習，跳過（日期）
  problem: string | null; // 不能建立的原因
};

/**
 * 把「每週幾、到哪天」展開成一筆一筆。那天已經有練習（existingDays，當地日期）就跳過、列在 skipped。
 * 一批最多 60 筆（資料庫 save_practices 的上限），超過就回報問題而不是默默截斷。
 */
export function expandSeries(input: SeriesInput, existingDays: Iterable<string>): SeriesPreview {
  const fail = (problem: string): SeriesPreview => ({ drafts: [], skipped: [], problem });
  if (!input.weekdays.length) return fail("請選每週哪幾天");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to)) return fail("請填第一天和最後一天");
  if (input.to < input.from) return fail("最後一天要在第一天之後");
  if (!/^\d{2}:\d{2}$/.test(input.start) || !/^\d{2}:\d{2}$/.test(input.end)) return fail("請填開始和結束時間");
  if (input.end <= input.start) return fail("結束時間要在開始之後");
  if (input.meet && input.meet > input.start) return fail("集合時間要在開始之前");
  if (input.title.length > 20) return fail("標題最多 20 個字");

  const busy = new Set(existingDays);
  const wanted = new Set(input.weekdays);
  const drafts: Draft[] = [];
  const skipped: string[] = [];
  let guard = 0;
  for (let day = input.from; day <= input.to && guard < 800; day = addDays(day, 1), guard++) {
    if (!wanted.has(weekdayOf(day))) continue;
    if (busy.has(day)) { skipped.push(day); continue; }
    drafts.push({ date: day, start: input.start, end: input.end, meet: input.meet, location: input.location.trim(),
      title: input.title.trim(), content: input.content.trim(), note: input.note.trim() });
  }
  if (guard >= 800) return fail("日期範圍太長了，請縮短到一個學期以內");
  if (!drafts.length) return { drafts, skipped, problem: skipped.length ? "這段期間的練習日都已經有練習了" : "這段期間沒有符合的日子" };
  if (drafts.length > MAX_ROWS) return { drafts: [], skipped, problem: `一次最多建立 ${MAX_ROWS} 次練習（現在是 ${drafts.length} 次），請縮短日期範圍` };
  return { drafts, skipped, problem: null };
}

/** 練習已經有的日子（當地日期），給展開固定練習、匯入預覽比對用。 */
export function practiceDays(practices: Practice[]): Set<string> {
  return new Set(practices.map(practiceDay));
}

/** 這個系列「從這一次開始、之後」還有幾次（刪除前先告訴管理員會刪幾筆）。 */
export function restOfSeriesCount(practices: Practice[], p: Practice): number {
  if (!p.series_id) return 1;
  const t = new Date(p.starts_at).getTime();
  return practices.filter((x) => x.series_id === p.series_id && new Date(x.starts_at).getTime() >= t).length;
}

// ---------------------------------------------------------------- 通知文字（管理員可以在送出前改）

/** 要發到聊天室／Discord 的預設文字。 */
export function announceText(kind: "new" | "update" | "batch", items: Pick<Practice, "starts_at" | "ends_at" | "location" | "title" | "content">[]): string {
  if (!items.length) return "";
  if (kind === "batch" || items.length > 1) {
    const sorted = [...items].sort(byStart);
    const lines = sorted.slice(0, 12).map((p) => `• ${whenText(p)}${p.location ? ` @${p.location}` : ""}${p.title ? `　${p.title}` : ""}`);
    const more = sorted.length > 12 ? `\n…還有 ${sorted.length - 12} 次` : "";
    return `新增了 ${sorted.length} 次練習：\n${lines.join("\n")}${more}\n記得到練習頁回覆出席／請假。`;
  }
  const p = items[0];
  const head = kind === "update" ? "練習有更新" : "新增練習";
  return `${head}：${whenText(p)}${p.location ? ` @${p.location}` : ""}${p.title ? `（${p.title}）` : ""}`
    + `${p.content ? `\n${p.content}` : ""}\n記得到練習頁回覆出席／請假。`;
}

/** 目前這一天（"今天"）是哪天；放這裡讓畫面和測試用同一個。 */
export function todayOf(now: Date): string {
  return dayOf(now);
}
