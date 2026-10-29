// v2.11.2：加到手機主畫面教學的判斷（lib/install-guide.ts）。執行：npm test（在 web 資料夾）
import test from "node:test";
import assert from "node:assert/strict";
import { AFTER, STEPS, installKind, platformOf, shouldAutoShow, tipFor } from "../lib/install-guide.ts";

const IOS_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IOS_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const IOS_LINE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const ANDROID_IG = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 Instagram 300.0";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

test("認得出手機和瀏覽器", () => {
  assert.equal(installKind(IOS_SAFARI), "ios-safari");
  assert.equal(installKind(IOS_CHROME), "ios-other");
  assert.equal(installKind(IOS_LINE), "inapp");
  assert.equal(installKind(IPAD, 5), "ios-safari", "iPad 假裝成 Mac，要看觸控點");
  assert.equal(installKind(IPAD, 0), "desktop");
  assert.equal(installKind(ANDROID), "android");
  assert.equal(installKind(ANDROID_IG), "inapp");
  assert.equal(installKind(PC), "desktop");
  assert.equal(installKind(""), "desktop");
});

test("視窗先顯示自己手機的步驟", () => {
  assert.equal(platformOf("android"), "android");
  assert.equal(platformOf("inapp", ANDROID_IG), "android");
  assert.equal(platformOf("inapp", IOS_LINE), "ios");
  assert.equal(platformOf("ios-safari"), "ios");
  assert.equal(platformOf("desktop"), "ios");
});

test("兩種手機都有步驟和加好之後的說明", () => {
  for (const p of ["ios", "android"] as const) {
    assert.ok(STEPS[p].length >= 3 && STEPS[p].length <= 5);
    assert.ok(AFTER[p].length > 0);
  }
  assert.ok(STEPS.ios.some((s) => s.includes("加入主畫面")));
  assert.ok(STEPS.android.some((s) => s.includes("主畫面")));
});

test("只有不能直接照做的瀏覽器才多一句提醒", () => {
  assert.equal(tipFor("ios-safari"), null);
  assert.equal(tipFor("android"), null);
  for (const k of ["inapp", "ios-other", "desktop"] as const) assert.ok(tipFor(k));
});

test("只對手機、第一次、還沒加到主畫面的人自動跳", () => {
  assert.equal(shouldAutoShow("ios-safari", false, false), true);
  assert.equal(shouldAutoShow("android", false, false), true);
  assert.equal(shouldAutoShow("ios-other", false, false), true);
  assert.equal(shouldAutoShow("ios-safari", true, false), false, "已經從主畫面打開");
  assert.equal(shouldAutoShow("android", false, true), false, "看過了");
  assert.equal(shouldAutoShow("inapp", false, false), false, "內建瀏覽器交給 BrowserNotice");
  assert.equal(shouldAutoShow("desktop", false, false), false);
});
