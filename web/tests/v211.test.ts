// v2.11：評分顏色分級。執行：npm test（在 web 資料夾）
import test from "node:test";
import assert from "node:assert/strict";
import { rateTier } from "../lib/rate-tier.ts";

test("評分分級：邊界值落在高的那一級、壞資料算最低", () => {
  assert.equal(rateTier(4), "great");
  assert.equal(rateTier(3.99), "good");
  assert.equal(rateTier(3.25), "good");
  assert.equal(rateTier(2.5), "mid");
  assert.equal(rateTier(2.49), "low");
  assert.equal(rateTier(NaN), "low");
  assert.equal(rateTier(8, 10), "great");
});

test("位置活動範圍：每個點都在自己的框裡、框都在球場裡、左右邊路的框數量和點一樣", async () => {
  const { MAP_SPOTS, MAP_ZONES } = await import("../lib/positions.ts");
  assert.deepEqual(Object.keys(MAP_ZONES).sort(), Object.keys(MAP_SPOTS).sort());
  for (const [pos, zones] of Object.entries(MAP_ZONES)) {
    for (const [x0, x1, y0, y1] of zones) assert.ok(x0 >= 1 && x1 <= 104 && y0 >= 1 && y1 <= 67 && x0 < x1 && y0 < y1, pos);
    for (const [x, y] of MAP_SPOTS[pos]) assert.ok(zones.some(([x0, x1, y0, y1]) => x > x0 && x < x1 && y > y0 && y < y1), `${pos} (${x}, ${y}) 不在框裡`);
  }
});
