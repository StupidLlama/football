// 圖表動畫的計算（純函式，不碰畫面）：緩動曲線、兩組數字之間的插值。
// 畫面上的 hook 在 components/anim.tsx，用 requestAnimationFrame 每一格呼叫這裡算出現在的值。

/** 先快後慢（三次方），動畫結尾比較柔和。t：0–1。 */
export function easeOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

/** 兩組數字之間的插值；長度不同時，多出來的從 0 開始長。 */
export function lerpArray(from: number[], to: number[], t: number): number[] {
  return to.map((b, i) => {
    const a = from[i] ?? 0;
    return a + (b - a) * t;
  });
}

/** 兩組數字是不是一樣（避免每次重新畫面都重跑動畫）。 */
export function sameValues(a: number[], b: number[], eps = 1e-9): boolean {
  return a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < eps);
}

/** 動畫進行了多少（0–1）：經過時間 ÷ 長度，可以有延遲。 */
export function progress(elapsed: number, duration: number, delay = 0): number {
  if (duration <= 0) return 1;
  return Math.max(0, Math.min(1, (elapsed - delay) / duration));
}
