// 網站設定：安全標頭。
const dev = process.env.NODE_ENV !== "production";
// 只取「https://專案.supabase.co」這段（去掉前後空白和換行：環境變數貼上時常多一個換行，CSP 就會壞掉、連不到資料庫）
// v2.10：正式版讀不到網址時「直接建置失敗」，不要悄悄放寬成所有 *.supabase.co（Vercel 建置失敗時，舊版網站照常運作）。
// 只有本機開發（npm run dev）才用萬用字元，方便還沒建 .env.local 時也能打開。
function origin(raw) {
  try {
    const u = new URL((raw ?? "").trim());
    if (u.protocol !== "https:" && !dev) throw new Error("not https");
    return u.origin;
  } catch {
    if (dev) return "https://*.supabase.co";
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 沒有設定或格式不對（要像 https://abcdefgh.supabase.co），CSP 無法建立");
  }
}
const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseWs = supabase.replace(/^https:/, "wss:");

// 內容安全政策（CSP）：網頁只能載入我們允許的來源。就算有人在頁面裡塞了奇怪的程式，也連不到別的網站。
// - script / style：Next.js 需要 inline（'unsafe-inline'）；開發模式另外需要 'unsafe-eval'
// - connect：只能連 Supabase（資料庫、登入）和我們自己（/api/contact）
// - font：字體由我們自己提供（next/font），不連 Google
// - frame-ancestors 'none'：不讓別的網站把我們嵌進框框（防點擊劫持）
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabaseWs}${dev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        // v2.10：別的網站用 window.open 打開我們時，拿不到我們的視窗（Google 登入是整頁跳轉，不受影響）
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    }];
  },
};

export default nextConfig;
