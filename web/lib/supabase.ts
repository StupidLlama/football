// 連到 Supabase 的用戶端（瀏覽器裡用）。
// 網址和 publishable key 是公開的值（本來就會出現在瀏覽器），權限由資料庫的 RLS 和資料庫函式把關。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
// 新版 Supabase 叫 publishable key；舊版叫 anon key，兩個名字都接受
const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export const configured = url.startsWith("https://") && key.length > 20;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!configured) throw new Error("還沒設定 Supabase：請照 docs/V2_2_SETUP.md 建立 web/.env.local");
  if (!client) {
    client = createClient(url, key, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
