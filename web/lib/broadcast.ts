// v2.11.1 未登入首頁的「轉播」動畫：8 號傳 10 號、7 號前插接直塞射中橫桿、10 號補射進球。
// 純計算（世界座標 → 畫面、每個時間點球和球員在哪），不 import React，node --test 可以直接測。
// 世界座標：公尺，球場 105 × 68，進攻朝右；鏡頭在近側看台，只拍右半場（x 45～105），畫面 600 × 340。

export type Pt = [number, number];
export type Pt3 = [number, number, number];

export const VIEW = { w: 600, h: 340 } as const;
export const TOTAL = 9;      // 一輪幾秒
export const GOAL_AT = 4.7;  // 第幾秒進球
export const STILL_AT = 6;   // 減少動態效果時停在這一格（進球後、比分 1 – 0）
export const ZOOM = 1.22;    // 鏡頭放大倍率

/** 世界座標（加上離地高度 h 公尺）→ 畫面座標和遠近縮放 s（遠的小、近的大）。 */
export function project(wx: number, wy: number, h = 0): Pt3 {
  const u = (wx - 76) / 31, v = wy / 68, s = 0.6 + 0.4 * v;
  return [300 + u * 300 * s, 46 + v * 270 - h * 7.5 * s, s];
}

/** 一串世界座標點 → SVG points 字串。 */
export function points(pts: Pt[]): string {
  return pts.map(([x, y]) => project(x, y).slice(0, 2).map((n) => n.toFixed(1)).join(",")).join(" ");
}

/** 直線切成 n 段（透視下直線還是直的，但切細一點邊線比較穩）。 */
export function segment(a: Pt, b: Pt, n = 8): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n] as Pt);
}

export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export const OURS: Record<string, Pt> = { 8: [60, 40], 10: [73, 24], 7: [66, 56] };
export const THEM: Record<string, Pt> = { gk: [103, 34], d1: [86, 27], d2: [87, 41], d3: [80, 52] };
export const BAR: Pt3 = [105, 34.5, 2.44];
const REB: Pt = [91.8, 35.3], NET: Pt3 = [106.5, 32.5, 1];
export const MEET: Pt = [87.5, 45.2], SPOT10: Pt = [91.5, 35.5];
export const BALL_START: Pt = [61.5, 40];

/** 球的每一段：開始秒數、長度、從、到、弧高（公尺）、起點高度、終點高度、誰踢。 */
export type Seg = { at: number; dur: number; from: Pt; to: Pt; lift: number; h0: number; h1: number; kick: string | null };
export const SEGS: Seg[] = [
  { at: 0.6, dur: 0.9, from: BALL_START, to: [72, 25.5], lift: 0.4, h0: 0, h1: 0, kick: "8" },
  { at: 1.5, dur: 0.35, from: [72, 25.5], to: [73.2, 26.6], lift: 0, h0: 0, h1: 0, kick: null }, // 10 號停球、帶一步
  { at: 1.9, dur: 1.1, from: [73.2, 26.6], to: MEET, lift: 1.2, h0: 0, h1: 0, kick: "10" },
  { at: 3.1, dur: 0.45, from: MEET, to: [BAR[0], BAR[1]], lift: 1.0, h0: 0, h1: BAR[2], kick: "7" },
  { at: 3.55, dur: 0.75, from: [BAR[0], BAR[1]], to: REB, lift: 2.2, h0: BAR[2], h1: 0, kick: null }, // 中橫桿彈回來
  { at: 4.35, dur: 0.35, from: REB, to: [NET[0], NET[1]], lift: 0.3, h0: 0, h1: NET[2], kick: "10" },
];

/** 第 t 秒（0～TOTAL）球在哪：[x, y, 離地高度]。 */
export function ballAt(t: number): Pt3 {
  if (t < SEGS[0].at) return [BALL_START[0], BALL_START[1], 0];
  for (let i = SEGS.length - 1; i >= 0; i--) {
    const g = SEGS[i];
    if (t >= g.at) {
      const f = Math.min(1, (t - g.at) / g.dur);
      const [x, y] = lerp(g.from, g.to, f);
      return [x, y, g.h0 + (g.h1 - g.h0) * f + 4 * g.lift * f * (1 - f)];
    }
  }
  return [BALL_START[0], BALL_START[1], 0];
}

const move = (from: Pt, to: Pt, t: number, t0: number, t1: number) => lerp(from, to, ease(clamp01((t - t0) / (t1 - t0))));

/** 第 t 秒每個球員在哪（世界座標）。 */
export function playersAt(t: number): Record<string, Pt> {
  const p: Record<string, Pt> = { ...OURS, ...THEM };
  p[8] = move(OURS[8], [67, 41], t, 1.0, 3.0);                               // 傳完往前跟
  p[7] = move(OURS[7], [MEET[0] - 0.5, MEET[1] + 0.3], t, 1.0, 3.0);         // 跟直塞球同時到
  p[10] = t < 2.1 ? move(OURS[10], [73, 25.4], t, 1.2, 1.9) : move([73, 25.4], SPOT10, t, 2.1, 4.3); // 停球、傳完就插上
  p.d3 = move(THEM.d3, [84, 50], t, 1.2, 3.0);
  p.d2 = move(THEM.d2, [88.5, 43.5], t, 1.6, 3.1);                           // 追 7 號，慢半步
  p.d1 = move(THEM.d1, [89.5, 33.5], t, 2.4, 4.3);                           // 回防，追不上 10 號
  p.gk = t < 3.6 ? move(THEM.gk, [103, 38.5], t, 2.6, 3.1) : move([103, 38.5], [102.5, 35], t, 3.7, 4.3);
  // 沒在跑的人也會小小晃動
  Object.keys(p).forEach((k, i) => { p[k] = [p[k][0] + Math.sin(t * 1.3 + i * 1.7) * 0.35, p[k][1] + Math.cos(t * 1.1 + i * 2.3) * 0.3]; });
  return p;
}

/** 踢球那一下的光圈（0～1）：這個人在第 t 秒有沒有剛好踢到球。 */
export function kickAt(id: string, t: number): number {
  for (const g of SEGS) if (g.kick === id && t >= g.at - 0.12 && t < g.at + 0.2) return Math.sin((t - g.at + 0.12) / 0.32 * Math.PI);
  return 0;
}

/** 戰術箭頭：起點、終點、從第幾秒開始畫、畫多久、是不是跑位（虛線）。 */
export const ARROWS = [
  { from: BALL_START, to: [72, 25.5] as Pt, at: 0.2, dur: 0.7, run: false },
  { from: OURS[7], to: [MEET[0] - 0.5, MEET[1] + 0.3] as Pt, at: 1.0, dur: 0.8, run: true },
  { from: [73.2, 26.6] as Pt, to: MEET, at: 1.7, dur: 0.6, run: false },
  { from: [73, 25.4] as Pt, to: SPOT10, at: 2.1, dur: 0.6, run: true },
];

/** 箭頭畫到第 t 秒的樣子（SVG points，還沒開始畫就是空字串）。 */
export function arrowAt(a: (typeof ARROWS)[number], t: number): string {
  const f = clamp01((t - a.at) / a.dur);
  if (f <= 0) return "";
  return points(Array.from({ length: 21 }, (_, i) => lerp(a.from, a.to, i / 20 * f)));
}

/** 箭頭整體透明度：快結束時淡出。 */
export const arrowFade = (t: number) => (t > 7.6 ? Math.max(0, 1 - (t - 7.6) / 0.8) : 1);

/** 左上角的比賽時鐘：從 67:00 開始，畫面 1 秒 = 比賽 3 秒。 */
export function clockAt(t: number): string {
  const sec = 67 * 60 + Math.floor(t * 3);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** GOAL 橫幅往下藏多少像素（0 = 完全出現）；進球前回傳 null（不顯示）。 */
export function bannerAt(t: number): number | null {
  const bt = t - (GOAL_AT + 0.1);
  if (bt < 0) return null;
  if (bt < 0.35) return 70 * (1 - ease(bt / 0.35));
  if (t > 7.4) return 70 * Math.min(1, (t - 7.4) / 0.4);
  return 0;
}

/** 球門晃動（像素）：中橫桿整個門框晃、進球時網子晃。 */
export const barShake = (t: number) => (t >= 3.6 && t < 3.9 ? Math.sin((t - 3.6) * 40) * 1.5 * (1 - (t - 3.6) / 0.3) : 0);
export const netShake = (t: number) => (t >= GOAL_AT && t < GOAL_AT + 0.5 ? Math.sin((t - GOAL_AT) * 30) * 2.2 * (1 - (t - GOAL_AT) / 0.5) : 0);

/** 鏡頭要對準的畫面點（跟著球，但不拍到畫面外）。 */
export function cameraTarget(t: number): Pt {
  const [bx, by, bh] = ballAt(t), [x, y] = project(bx, by, bh);
  const hw = VIEW.w / 2 / ZOOM, hh = VIEW.h / 2 / ZOOM;
  return [Math.min(VIEW.w - hw, Math.max(hw, x)), Math.min(VIEW.h - hh, Math.max(hh, y))];
}
