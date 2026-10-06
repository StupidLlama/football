// 分享的陣容（不用登入）：只能看，不給搜尋引擎收錄。
import type { Metadata } from "next";
import { SharedLineupView } from "@/components/lineup-share";

export const metadata: Metadata = { title: "分享的陣容", robots: { index: false, follow: false } };

export default async function SharedLineupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedLineupView token={token} />;
}
