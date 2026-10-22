import type { Metadata, Viewport } from "next";
import { Barlow_Semi_Condensed, Kaushan_Script, LXGW_WenKai_TC, Noto_Sans_TC } from "next/font/google";
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
// v2.11 戰情室：內文思源黑體、數字 Barlow Semi Condensed、Logo 的「Potato」Kaushan Script。一樣打包在自己網站上，CSP 不用改。
// 思源黑體只載 400、700 兩種字重（中文字體很大）。
const notoSans = Noto_Sans_TC({ weight: ["400", "700"], subsets: ["latin"], display: "swap", variable: "--font-noto", fallback: ["PingFang TC", "Microsoft JhengHei", "sans-serif"] });
const barlow = Barlow_Semi_Condensed({ weight: ["600", "700"], subsets: ["latin"], display: "swap", variable: "--font-barlow" });
const kaushan = Kaushan_Script({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-kaushan" });

export const metadata: Metadata = {
  title: { default: "Football Analysis Potato", template: "%s｜Football Analysis Potato" },
  description: "球隊的球員能力、陣容、比賽和裁判任務，一個地方全看得到。",
};

export const viewport: Viewport = { themeColor: "#0B1220", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant" className={`${wenkai.variable} ${notoSans.variable} ${barlow.variable} ${kaushan.variable}`}>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
