import type { MetadataRoute } from "next";

// v2.11.2：加到手機主畫面用的設定（圖示、名字、打開時不顯示網址列）。Next.js 會產生 /manifest.webmanifest。
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Football Analysis Potato",
    short_name: "Potato",
    description: "球隊的球員能力、陣容、比賽和裁判任務，一個地方全看得到。",
    lang: "zh-Hant",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0B1220",
    theme_color: "#0B1220",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
