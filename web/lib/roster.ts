// 名單管理（v2.6.1）：送出前先在瀏覽器檢查一次，規則跟資料庫的 roster_problem（0010_roster.sql）一樣。
// 資料庫還是會再檢查一次（瀏覽器的檢查只是讓錯誤早點出現、少跑一趟）。純計算，不 import React / Supabase。

export type Badge = "C" | "VC" | null;
export type RosterRow = { id: string; name: string; jersey_number: string | null; badge: Badge };
export type RosterInput = { name: string; jersey: string; badge: Badge };

export const BADGE_LABEL: Record<"C" | "VC", string> = { C: "隊長", VC: "副隊長" };

/** 背號整理：空白 = 還沒決定（null）；純數字去掉前面的 0（07 → 7）。 */
export function cleanJersey(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return /^[0-9]{1,3}$/.test(t) ? String(Number(t)) : t;
}

/**
 * 有問題就回傳一句話，沒問題回傳 null。
 * self = 正在編輯的那一列（新增時不傳）：只有「有改到」的欄位才檢查，舊資料本來就重複也不會卡住。
 */
export function rosterProblem(rows: RosterRow[], input: RosterInput, self?: RosterRow): string | null {
  const name = input.name.trim();
  const jersey = cleanJersey(input.jersey);
  const others = rows.filter((r) => r.id !== self?.id);

  if (!name || [...name].length > 40) return "姓名要 1–40 字";
  if (name !== self?.name && others.some((r) => r.name === name)) return `名單上已經有「${name}」了`;

  if (jersey !== null && jersey !== (self?.jersey_number ?? null)) {
    if (!/^[0-9]{1,3}$/.test(jersey)) return "背號只能是 0–999 的數字";
    const holder = others.find((r) => r.jersey_number === jersey);
    if (holder) return `背號 ${jersey} 已經是「${holder.name}」在用`;
  }

  if (input.badge && input.badge !== (self?.badge ?? null)) {
    const holder = others.find((r) => r.badge === input.badge);
    if (holder) return `${BADGE_LABEL[input.badge]}目前是「${holder.name}」，請先把他的標記拿掉`;
  }
  return null;
}

/** 名單排序：隊長、副隊長在前，再照背號（沒有背號的排最後），最後照名字。 */
export function sortRoster<T extends RosterRow>(rows: T[]): T[] {
  const rank = (b: Badge) => (b === "C" ? 0 : b === "VC" ? 1 : 2);
  const num = (j: string | null) => (j !== null && /^[0-9]+$/.test(j) ? Number(j) : Infinity);
  return rows.slice().sort((a, b) =>
    rank(a.badge) - rank(b.badge) || num(a.jersey_number) - num(b.jersey_number) || a.name.localeCompare(b.name, "zh-Hant"));
}
