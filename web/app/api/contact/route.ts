// 聯絡我們（在網站自己的伺服器上執行，不在瀏覽器）：
//   1. 用使用者自己的登入憑證呼叫資料庫函式 send_contact_message → 存進 contact_messages（要登入、一小時最多 5 則）
//   2. 存好之後，通知網站管理員的 Discord 頻道（Webhook 網址只放在伺服器的環境變數 DISCORD_WEBHOOK_URL，瀏覽器看不到）
import { createClient } from "@supabase/supabase-js";

const CATEGORY_LABEL: Record<string, string> = { bug: "網站壞掉了", suggestion: "建議", privacy: "個資、帳號", other: "其他" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!token) return json({ status: "unauthenticated" }, 401);
  if (!url || !key) return json({ status: "error", detail: "網站還沒設定 Supabase" }, 500);

  let input: { category?: unknown; body?: unknown; page?: unknown };
  try { input = await req.json(); } catch { return json({ status: "invalid", detail: "格式不對" }, 400); }
  const category = String(input.category ?? "");
  const body = String(input.body ?? "").slice(0, 2000);
  const page = String(input.page ?? "").slice(0, 200);

  // 用「這個使用者」的身分連資料庫：RLS 和函式裡的 auth.uid() 都會生效
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const r = await db.rpc("send_contact_message", { category, body, page });
  if (r.error) return json({ status: "error", detail: "請重新登入後再試" }, 401);
  const result = r.data as { status: string; id?: string };
  if (result.status !== "ok") return json(result, result.status === "rate_limited" ? 429 : 400);

  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (hook && hook.startsWith("https://discord.com/api/webhooks/")) {
    const { data } = await db.auth.getUser(token);
    const who = data.user?.email ?? "（不明）";
    const text = [
      `**[${CATEGORY_LABEL[category] ?? category}]** 來自 ${who}`,
      page ? `頁面：${page}` : "",
      "",
      body,
    ].filter((x, i) => x !== "" || i === 2).join("\n").slice(0, 1900);
    try {
      await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // allowed_mentions 空的：訊息裡就算有 @everyone 也不會真的通知所有人
        body: JSON.stringify({ username: "Football Analysis Potato", content: text, allowed_mentions: { parse: [] } }),
      });
    } catch {
      // Discord 暫時連不上也沒關係：訊息已經存在資料庫，網站管理員在設定頁看得到
    }
  }
  return json({ status: "ok", id: result.id });
}
