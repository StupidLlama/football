import type { Metadata, Viewport } from "next";
import { LXGW_WenKai_TC } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

// 霞鶩文楷 TC：部署時由 Next.js 下載，放在我們自己的網址提供（不會在使用者瀏覽時連到 Google）。
// 中文字體會切成很多小塊（unicode-range），頁面用到哪些字才下載哪幾塊。
const wenkai = LXGW_WenKai_TC({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-wenkai",
  fallback: ["Kaiti TC", "DFKai-SB", "BiauKai", "serif"],
});

export const metadata: Metadata = {
  title: { default: "Football Analysis Potato", template: "%s｜Football Analysis Potato" },
  description: "球隊的球員能力、陣容、比賽和裁判任務，一個地方全看得到。",
};

export const viewport: Viewport = { themeColor: "#0B1220", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant" className={wenkai.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
