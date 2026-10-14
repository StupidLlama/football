// v2.10 資安檢查：登入後跳轉只能留在站內。執行：npm test（在 web 資料夾）
import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../lib/nav.ts";

test("站內路徑照常跳", () => {
  assert.equal(safeNext("/t/abc/home"), "/t/abc/home");
  assert.equal(safeNext("/feedback?tab=admin"), "/feedback?tab=admin");
  assert.equal(safeNext("/settings#s-career"), "/settings#s-career");
});

test("跳到別的網站的寫法全部擋下", () => {
  for (const bad of [
    "https://evil.example", "//evil.example", "/\\evil.example", "\\\\evil.example",
    "/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/ /evil.example",
    "javascript:alert(1)", "evil.example", "", null, undefined, "/" + "x".repeat(600),
  ]) {
    assert.equal(safeNext(bad as string | null | undefined), null, JSON.stringify(bad));
  }
});

test("結果用 URL 解析後一定還在同一個網站", () => {
  for (const p of ["/a/../b", "/%2F%2Fevil.example", "/a?next=//evil.example"]) {
    const out = safeNext(p);
    assert.ok(out === null || new URL(out, "https://site.app").origin === "https://site.app", p);
  }
});
