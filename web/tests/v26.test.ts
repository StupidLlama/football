// v2.6 隊伍聊天室（F6）：lib/chat.ts 純計算的測試。
import test from "node:test";
import assert from "node:assert/strict";
import {
  canDeleteMessage, canEditMessage, DISCORD_HOOK_URL_RE, hasNewPinned, kindLabel,
  relativeTime, splitPinned, threadsOf, unreadCount,
} from "../lib/chat.ts";
import type { Message } from "../lib/api.ts";

const now = new Date("2026-10-10T12:00:00Z");

function msg(over: Partial<Message> = {}): Message {
  return {
    id: "m1", team_id: "t1", author_id: "u1", parent_id: null, kind: "general",
    body: "測試訊息", lineup_id: null, pinned_at: null, edited_at: null, deleted_at: null,
    created_at: "2026-10-10T11:00:00Z", ...over,
  };
}

test("kindLabel：一般沒有標籤，筆記／戰術有", () => {
  assert.equal(kindLabel("general"), null);
  assert.equal(kindLabel("note"), "筆記");
  assert.equal(kindLabel("tactic"), "戰術");
});

test("threadsOf：主貼文和回覆分組，回覆照時間排", () => {
  const messages = [
    msg({ id: "p1", created_at: "2026-10-10T10:00:00Z" }),
    msg({ id: "r2", parent_id: "p1", created_at: "2026-10-10T10:05:00Z" }),
    msg({ id: "r1", parent_id: "p1", created_at: "2026-10-10T10:02:00Z" }),
    msg({ id: "p2", created_at: "2026-10-10T10:03:00Z" }),
  ];
  const threads = threadsOf(messages);
  assert.equal(threads.length, 2);
  const t1 = threads.find((t) => t.post.id === "p1")!;
  assert.deepEqual(t1.replies.map((r) => r.id), ["r1", "r2"], "回覆要照時間排");
  const t2 = threads.find((t) => t.post.id === "p2")!;
  assert.equal(t2.replies.length, 0);
});

test("splitPinned：置頂的在前（照置頂時間），其他新到舊；已刪除的主貼文不算置頂", () => {
  const threads = threadsOf([
    msg({ id: "a", created_at: "2026-10-09T00:00:00Z" }),
    msg({ id: "b", created_at: "2026-10-10T00:00:00Z", pinned_at: "2026-10-10T08:00:00Z" }),
    msg({ id: "c", created_at: "2026-10-08T00:00:00Z", pinned_at: "2026-10-10T07:00:00Z" }),
    msg({ id: "d", created_at: "2026-10-11T00:00:00Z", pinned_at: "2026-10-10T09:00:00Z", deleted_at: "2026-10-10T09:30:00Z" }),
  ]);
  const { pinned, others } = splitPinned(threads);
  assert.deepEqual(pinned.map((t) => t.post.id), ["c", "b"], "先置頂的在上面");
  assert.deepEqual(others.map((t) => t.post.id), ["d", "a"], "已刪除的置頂貼文掉回一般列表（畫面上會顯示成「已刪除」），照發文時間新到舊");
});

test("canEditMessage：只有作者本人、且沒被刪除才能編輯", () => {
  const m = msg({ author_id: "u1" });
  assert.equal(canEditMessage(m, "u1"), true);
  assert.equal(canEditMessage(m, "u2"), false);
  assert.equal(canEditMessage(msg({ author_id: "u1", deleted_at: "2026-10-10T11:30:00Z" }), "u1"), false);
});

test("canDeleteMessage：作者本人或球隊管理員可以刪除，已刪除的不能再刪", () => {
  const m = msg({ author_id: "u1" });
  assert.equal(canDeleteMessage(m, "u1", false), true, "作者本人");
  assert.equal(canDeleteMessage(m, "u2", false), false, "別人、不是管理員");
  assert.equal(canDeleteMessage(m, "u2", true), true, "球隊管理員可以刪別人的");
  assert.equal(canDeleteMessage(msg({ author_id: "u1", deleted_at: "2026-10-10T11:30:00Z" }), "u1", true), false);
});

test("relativeTime：剛剛／幾分鐘前／幾小時前／超過一天顯示日期時間", () => {
  assert.equal(relativeTime("2026-10-10T11:59:50Z", now), "剛剛");
  assert.equal(relativeTime("2026-10-10T11:50:00Z", now), "10 分鐘前");
  assert.equal(relativeTime("2026-10-10T09:00:00Z", now), "3 小時前");
  assert.match(relativeTime("2026-10-01T03:04:00Z", now), /^10\/01 /);
});

test("unreadCount：只算自己最後讀到之後、別人發的、沒被刪除的訊息", () => {
  const messages = [
    msg({ id: "a", author_id: "u2", created_at: "2026-10-10T09:00:00Z" }),
    msg({ id: "b", author_id: "u2", created_at: "2026-10-10T11:00:00Z" }),
    msg({ id: "c", author_id: "u1", created_at: "2026-10-10T11:30:00Z" }, ),
    msg({ id: "d", author_id: "u2", created_at: "2026-10-10T11:45:00Z", deleted_at: "2026-10-10T11:50:00Z" }),
  ];
  assert.equal(unreadCount(messages, "2026-10-10T10:00:00Z", "u1"), 1, "b 算未讀，c 是自己發的不算，d 已刪除不算");
  assert.equal(unreadCount(messages, null, "u1"), 2, "從來沒讀過：a、b 都算");
});

test("hasNewPinned：最後讀到之後有新置頂才算", () => {
  const messages = [msg({ id: "a", pinned_at: "2026-10-10T08:00:00Z" })];
  assert.equal(hasNewPinned(messages, "2026-10-10T09:00:00Z"), false);
  assert.equal(hasNewPinned(messages, "2026-10-10T07:00:00Z"), true);
  assert.equal(hasNewPinned(messages, null), true);
});

test("DISCORD_HOOK_URL_RE：只接受 Discord 的 webhook 網址格式", () => {
  assert.match("https://discord.com/api/webhooks/123456789012345678/AbCdEf-01234567890123456789012345678901234567", DISCORD_HOOK_URL_RE);
  assert.doesNotMatch("https://example.com/api/webhooks/123/abc", DISCORD_HOOK_URL_RE);
  assert.doesNotMatch("discord.com/api/webhooks/123/abc", DISCORD_HOOK_URL_RE, "沒有 https://");
  assert.doesNotMatch("", DISCORD_HOOK_URL_RE);
});
