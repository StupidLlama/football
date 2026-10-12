// v2.7.1 更新紀錄：lib/updates.ts 的測試。
import test from "node:test";
import assert from "node:assert/strict";
import { LATEST, UPDATES, compareVersions, notice, parseVersion, unseen } from "../lib/updates.ts";

test("版本號看得懂，大小比較正確", () => {
  assert.deepEqual(parseVersion("v2.7.1"), [2, 7, 1]);
  assert.deepEqual(parseVersion("v2.7"), [2, 7, 0]);
  assert.equal(parseVersion("2.7"), null);
  assert.ok(compareVersions("v2.10", "v2.9") > 0);
  assert.ok(compareVersions("v2.7.1", "v2.7") > 0);
  assert.equal(compareVersions("v2.7", "v2.7.0"), 0);
});

test("更新紀錄由新到舊排好，日期也不倒退，版本不重複", () => {
  for (let i = 1; i < UPDATES.length; i++) {
    assert.ok(compareVersions(UPDATES[i - 1].version, UPDATES[i].version) > 0, `${UPDATES[i - 1].version} 應該比 ${UPDATES[i].version} 新`);
    assert.ok(UPDATES[i - 1].date >= UPDATES[i].date, `${UPDATES[i - 1].version} 的日期比較早`);
  }
  assert.equal(LATEST, UPDATES[0].version);
  for (const u of UPDATES) {
    assert.match(u.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(u.items.length >= 1 && u.items.length <= 6, `${u.version} 要有 1～6 條重點`);
  }
});

test("小版本（第二個數字變了）才算大更新", () => {
  for (const u of UPDATES) {
    const [, , patch] = parseVersion(u.version)!;
    if (patch === 0) assert.equal(u.big, true, `${u.version} 是小版本，應該跳視窗`);
  }
});

test("第一次來（沒有紀錄）不提醒", () => {
  assert.deepEqual(notice(UPDATES, null), { popup: null, dot: false });
  assert.deepEqual(unseen(UPDATES, "亂碼"), []);
});

test("看過最新版就不提醒", () => {
  assert.deepEqual(notice(UPDATES, LATEST), { popup: null, dot: false });
});

test("只差修補版：只亮小圓點，不跳視窗", () => {
  const list = [
    { version: "v2.7.1", date: "2026-10-13", title: "修補", big: false, items: ["a"] },
    { version: "v2.7", date: "2026-10-12", title: "大", big: true, items: ["b"] },
  ];
  assert.deepEqual(notice(list, "v2.7"), { popup: null, dot: true });
});

test("錯過好幾版：跳出最新的那個大更新", () => {
  const list = [
    { version: "v2.8.1", date: "2026-10-20", title: "修補", big: false, items: ["a"] },
    { version: "v2.8", date: "2026-10-19", title: "進步追蹤", big: true, items: ["b"] },
    { version: "v2.7", date: "2026-10-12", title: "練習", big: true, items: ["c"] },
  ];
  const n = notice(list, "v2.6.1");
  assert.equal(n.popup?.version, "v2.8");
  assert.equal(n.dot, true);
});
