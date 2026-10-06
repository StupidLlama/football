// 指派問題（匈牙利演算法）：n 個位置、m 位球員，求總分最高、每人最多排一次的排法。
// = stats/assignment.py 的 TypeScript 版，一行一行對照翻譯；兩邊同樣輸入要得到同樣結果
// （web/tests/v24.test.ts 和 tests/test_v24.py 用同一份題目檢查）。
// 純計算，不 import 任何東西。複雜度 O(n² m)，30 人以內一瞬間就算完。

/**
 * scores[i][j] = 位置 i 排球員 j 的分數。回傳每個位置分到的球員編號（-1 = 沒人）。
 * 位置比球員多時，會讓「總分最高的那幾個位置」有人，其他位置是 -1。
 */
export function maxAssignment(scores: number[][]): number[] {
  const n = scores.length;
  const m = n ? scores[0].length : 0;
  if (n === 0 || m === 0) return new Array(n).fill(-1);
  if (n > m) {
    // 位置比人多：轉置後算「每個人去哪個位置」
    const t = Array.from({ length: m }, (_, j) => Array.from({ length: n }, (_, i) => scores[i][j]));
    const byPlayer = maxAssignment(t);
    const result = new Array(n).fill(-1);
    byPlayer.forEach((i, j) => { if (i >= 0) result[i] = j; });
    return result;
  }

  // 標準匈牙利演算法（最小化成本），成本 = 最高分 − 分數
  let top = -Infinity;
  for (const row of scores) for (const x of row) if (x > top) top = x;
  const cost = scores.map((row) => row.map((x) => top - x));
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0); // p[j] = 球員 j 分到的位置（1-based）
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity);
    const used = new Array(m + 1).fill(false);
    for (;;) {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
      if (p[j0] === 0) break;
    }
    for (;;) {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
      if (j0 === 0) break;
    }
  }
  const result = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) result[p[j] - 1] = j - 1;
  return result;
}
