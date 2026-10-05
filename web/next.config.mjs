// 網站設定：安全標頭。
const dev = process.env.NODE_ENV !== "production";
// 只取「https://專案.supabase.co」這段（去掉前後空白和換行：環境變數貼上時常多一個換行，CSP 就會壞掉、連不到資料庫）
function origin(raw) {
  try { return new URL((raw ?? "").trim()).origin; } catch { return "https://*.supabase.co"; }
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
      ],
    }];
  },
};

export default nextConfig;
