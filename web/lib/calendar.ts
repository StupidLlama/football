// 月曆格子（純計算，不碰畫面）。日期一律用 "YYYY-MM-DD" 字串（當地時間），字串比較就是日期先後。
const pad = (n: number) => String(n).padStart(2, "0");

export const WEEK_NAMES = ["日", "一", "二", "三", "四", "五", "六"] as const;

export type Cell = { day: string; inMonth: boolean; today: boolean };

export function dayString(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Date → "YYYY-MM-DD"（當地時間）。 */
export function dayOf(d: Date): string {
  return dayString(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** "YYYY-MM-DD" → 那天中午的 Date（用中午避免夏令時間的邊界問題）。 */
export function dateOf(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(day: string, n: number): string {
  const d = dateOf(day);
  d.setDate(d.getDate() + n);
  return dayOf(d);
}

/** 0 = 日 … 6 = 六。 */
export function weekdayOf(day: string): number {
  return dateOf(day).getDay();
}

/**
 * 一個月的格子，整週整週排（前後補上相鄰月份的日子，inMonth = false），每週 7 格。
 * month 是 1–12；weekStart 預設 1（週一開頭），0 = 週日開頭。
 */
export function monthGrid(year: number, month: number, today: string, weekStart: 0 | 1 = 1): Cell[][] {
  const first = dayString(year, month, 1);
  const lead = (weekdayOf(first) - weekStart + 7) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const weeks: Cell[][] = [];
  let cur = addDays(first, -lead);
  for (let i = 0; i < total; i++) {
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ day: cur, inMonth: Number(cur.slice(5, 7)) === month, today: cur === today });
    cur = addDays(cur, 1);
  }
  return weeks;
}

/** 月曆最上面的星期標題，跟 monthGrid 同一個 weekStart。 */
export function weekHeader(weekStart: 0 | 1 = 1): string[] {
  return Array.from({ length: 7 }, (_, i) => WEEK_NAMES[(i + weekStart) % 7]);
}

export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + by;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function monthLabel(year: number, month: number): string {
  return `${year} 年 ${month} 月`;
}

/** 「10/13（二）」 */
export function dayLabel(day: string): string {
  return `${day.slice(5, 7)}/${day.slice(8, 10)}（${WEEK_NAMES[weekdayOf(day)]}）`;
}

/** 一個月的第一天和最後一天（含），給「這個月有幾次練習」這類統計用。 */
export function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: dayString(year, month, 1), to: dayString(year, month, new Date(year, month, 0).getDate()) };
}
