// v2.11：Sofascore 風格的評分顏色，分數分四級（數字一定也印出來，顏色只是輔助）。純計算，node --test 可以直接測。
export type Tier = "low" | "mid" | "good" | "great";

/** 1–5 分制：4 以上 great、3.25 以上 good、2.5 以上 mid，其他 low。 */
export function rateTier(v: number, max = 5): Tier {
  const t = Number.isFinite(v) ? v / max : 0;
  return t >= 0.8 ? "great" : t >= 0.65 ? "good" : t >= 0.5 ? "mid" : "low";
}
