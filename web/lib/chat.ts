// 隊伍聊天室（v2.6 F6）：純計算，不碰畫面和資料庫。
import type { Message } from "./api.ts";

export type Kind = "general" | "note" | "tactic";

export function kindLabel(kind: Kind): string | null {
  return kind === "note" ? "筆記" : kind === "tactic" ? "戰術" : null;
}

export type Thread = { post: Message; replies: Message[] };

/** 把訊息分組成「主貼文 + 底下的回覆」（回覆照時間排，只有一層）。 */
export function threadsOf(messages: Message[]): Thread[] {
  const posts = messages.filter((m) => !m.parent_id);
  const repliesOf = new Map<string, Message[]>();
  for (const m of messages) {
    if (!m.parent_id) continue;
    const list = repliesOf.get(m.parent_id) ?? [];
    list.push(m);
    repliesOf.set(m.parent_id, list);
  }
  for (const list of repliesOf.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return posts.map((post) => ({ post, replies: repliesOf.get(post.id) ?? [] }));
}

/** 置頂的在前（照置頂時間，先置頂的在上面）；其他照發文時間新到舊。 */
export function splitPinned(threads: Thread[]): { pinned: Thread[]; others: Thread[] } {
  const pinned = threads.filter((t) => t.post.pinned_at && !t.post.deleted_at)
    .sort((a, b) => (a.post.pinned_at ?? "").localeCompare(b.post.pinned_at ?? ""));
  const others = threads.filter((t) => !t.post.pinned_at || t.post.deleted_at)
    .sort((a, b) => b.post.created_at.localeCompare(a.post.created_at));
  return { pinned, others };
}

export function canEditMessage(m: Message, myUserId: string): boolean {
  return !m.deleted_at && m.author_id === myUserId;
}

export function canDeleteMessage(m: Message, myUserId: string, isCoach: boolean): boolean {
  return !m.deleted_at && (m.author_id === myUserId || isCoach);
}

/** 「剛剛」「3 分鐘前」「2 小時前」，超過一天顯示日期時間。 */
export function relativeTime(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 60_000) return "剛剛";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分鐘前`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} 小時前`;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 未讀數：最後讀到之後的訊息（自己發的不算，一發就等於讀過了）。 */
export function unreadCount(messages: Message[], lastReadAt: string | null, myUserId: string): number {
  const since = lastReadAt ?? "1970-01-01T00:00:00Z";
  return messages.filter((m) => !m.deleted_at && m.author_id !== myUserId && m.created_at > since).length;
}

/** 最後讀到之後，有沒有新置頂（給首頁待辦用）。 */
export function hasNewPinned(messages: Message[], lastReadAt: string | null): boolean {
  const since = lastReadAt ?? "1970-01-01T00:00:00Z";
  return messages.some((m) => m.pinned_at && !m.deleted_at && m.pinned_at > since);
}

// 跟 supabase/migrations/0009_chat.sql 的 set_chat_discord 同一條規則，給表單先檔掉明顯打錯的網址。
export const DISCORD_HOOK_URL_RE =
  /^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,100}$/;
