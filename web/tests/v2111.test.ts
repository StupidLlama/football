// v2.11.1：未登入首頁轉播動畫的計算（lib/broadcast.ts）。執行：npm test（在 web 資料夾）
import test from "node:test";
import assert from "node:assert/strict";
import { GOAL_AT, OURS, SEGS, STILL_AT, TOTAL, VIEW, ZOOM, ballAt, bannerAt, cameraTarget, clockAt, kickAt, playersAt, project } from "../lib/broadcast.ts";

test("透視：遠的小、近的大，球場右半邊都在畫面裡", () => {
  assert.ok(project(80, 0)[2] < project(80, 68)[2]);
  for (const [x, y] of [[52.5, 0], [105, 0], [52.5, 68], [105, 68]]) {
    const [px, py] = project(x, y);
    assert.ok(px >= 0 && px <= VIEW.w && py >= 0 && py <= VIEW.h, `${x}, ${y}`);
  }
  assert.ok(project(105, 34, 2.44)[1] < project(105, 34)[1], "球門橫桿要比地面高");
});

test("球的路線接得起來：每一段的終點就是下一段的起點，最後一腳進網", () => {
  for (let i = 1; i < SEGS.length; i++) {
    assert.deepEqual(SEGS[i].from, SEGS[i - 1].to);
    assert.ok(SEGS[i].at >= SEGS[i - 1].at + SEGS[i - 1].dur - 1e-9, "段落不能重疊");
  }
  const last = SEGS.at(-1)!;
  assert.ok(Math.abs(last.at + last.dur - GOAL_AT) < 1e-9, "最後一腳結束就是進球的時間");
  assert.ok(ballAt(GOAL_AT)[0] > 105, "進球時球在球門線後面");
  assert.deepEqual(ballAt(TOTAL - 0.01), ballAt(GOAL_AT), "進球後球停在網子裡，直到下一輪");
  assert.deepEqual(ballAt(0).slice(0, 2), SEGS[0].from, "下一輪從 8 號腳下開始");
});

test("踢球的人在踢的那一刻就在球旁邊", () => {
  for (const g of SEGS) {
    if (!g.kick) continue;
    const [px, py] = playersAt(g.at)[g.kick], [bx, by] = ballAt(g.at);
    assert.ok(Math.hypot(px - bx, py - by) < 2.5, `${g.kick} 號在 ${g.at} 秒離球太遠`);
    assert.ok(kickAt(g.kick, g.at) > 0);
  }
  assert.equal(kickAt("8", 5), 0);
  assert.deepEqual(Object.keys(OURS).sort(), ["10", "7", "8"]);
});

test("比分條和 GOAL 橫幅：進球前不出現、靜止那一格已經是 1 – 0", () => {
  assert.equal(clockAt(0), "67:00");
  assert.equal(clockAt(8.99), "67:26");
  assert.equal(bannerAt(GOAL_AT - 0.5), null);
  assert.equal(bannerAt(STILL_AT), 0);
  assert.ok(STILL_AT > GOAL_AT && STILL_AT < TOTAL);
});

test("鏡頭放大後不會拍到畫面外面", () => {
  for (let t = 0; t < TOTAL; t += 0.1) {
    const [x, y] = cameraTarget(t);
    assert.ok(x - VIEW.w / 2 / ZOOM >= -1e-9 && x + VIEW.w / 2 / ZOOM <= VIEW.w + 1e-9);
    assert.ok(y - VIEW.h / 2 / ZOOM >= -1e-9 && y + VIEW.h / 2 / ZOOM <= VIEW.h + 1e-9);
  }
});
