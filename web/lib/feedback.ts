// v2.9 意見回饋（SPEC F10）的純計算：裝置名稱、狀態文字、未讀回覆。
// 不 import React / Supabase，node --test 可以直接測。

export type FeedbackStatus = "new" | "doing" | "done";

export const FEEDBACK_STATUS: [FeedbackStatus, string][] = [
  ["new", "新的"], ["doing", "處理中"], ["done", "已解決"],
];

export function statusLabel(s: string): string {
  return FEEDBACK_STATUS.find(([k]) => k === s)?.[1] ?? s;
}

/**
 * 粗略的裝置名稱，例如「手機 · Safari」「平板 · Chrome」「電腦 · Edge」。
 * 刻意不存完整的 User-Agent（裡面有作業系統版本這類細節，修 bug 用不到，少存一點個資）。
 * iPadOS 13 以後的 Safari 會假裝自己是 Mac：有觸控（maxTouchPoints > 1）的 Mac 當成平板。
 */
export function deviceLabel(ua: string, touchPoints = 0): string {
  const s = ua || "";
  let kind = "電腦";
  if (/iPad|Tablet/i.test(s) || (/Macintosh/.test(s) && touchPoints > 1) || (/Android/i.test(s) && !/Mobile/i.test(s))) kind = "平板";
  else if (/iPhone|iPod|Android.*Mobile|Mobile Safari|Windows Phone/i.test(s)) kind = "手機";
  let browser = "其他瀏覽器";
  if (/Line\//i.test(s)) browser = "LINE 內建瀏覽器";
  else if (/Instagram|FBAN|FBAV/i.test(s)) browser = "IG／FB 內建瀏覽器";
  else if (/Edg\//.test(s)) browser = "Edge";
  else if (/SamsungBrowser/i.test(s)) browser = "Samsung";
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera";
  else if (/Firefox|FxiOS/i.test(s)) browser = "Firefox";
  else if (/Chrome|CriOS/i.test(s)) browser = "Chrome";
  else if (/Safari/i.test(s)) browser = "Safari";
  return `${kind} · ${browser}`.slice(0, 60);
}

/** 網址只留路徑（不留 ?後面的參數，可能有 Team ID 這類東西），最多 200 字。 */
export function pagePath(href: string): string {
  try {
    return new URL(href, "https://x.invalid").pathname.slice(0, 200);
  } catch {
    return "";
  }
}

export type FeedbackLike = {
  user_id: string | null; status: string; reply: string;
  replied_at: string | null; reply_read_at: string | null;
};

/** 有回覆、本人還沒看過（或看過之後又回覆了）。 */
export function hasUnreadReply(m: FeedbackLike): boolean {
  if (!m.replied_at || !m.reply) return false;
  return !m.reply_read_at || m.reply_read_at < m.replied_at;
}

/** 側邊欄小圓點的數字：自己沒看過的回覆；網站管理員再加上「新的」回饋。 */
export function feedbackBadge(list: FeedbackLike[], me: string, isAdmin: boolean): number {
  const mine = list.filter((m) => m.user_id === me && hasUnreadReply(m)).length;
  const fresh = isAdmin ? list.filter((m) => m.status === "new").length : 0;
  return mine + fresh;
}

/** 回饋管理的排序：新的 → 處理中 → 已解決；同一種狀態新的在前。 */
export function sortFeedback<T extends { status: string; created_at: string }>(list: T[]): T[] {
  const rank: Record<string, number> = { new: 0, doing: 1, done: 2 };
  return [...list].sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || b.created_at.localeCompare(a.created_at));
}
