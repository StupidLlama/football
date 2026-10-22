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
