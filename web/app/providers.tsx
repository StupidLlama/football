"use client";
import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui";
import { FeedbackFab } from "@/components/feedback";
import { BrowserNoticePopup } from "@/components/browser-notice";
import { loadTextSize } from "@/lib/prefs";

export function Providers({ children }: { children: ReactNode }) {
  // 設定頁選的文字大小（存在這台裝置的瀏覽器）
  useEffect(() => { loadTextSize(); }, []);
  return (
    // v2.11：Motion 的動畫一律尊重系統的「減少動態效果」
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <ToastProvider>
          {children}
          {/* v2.9：每一頁右下角的意見回饋按鈕（登入後才出現） */}
          <FeedbackFab />
          {/* 不是 iOS Safari 的手機／平板：提醒加到日曆、Google 登入可能不順 */}
          <BrowserNoticePopup />
        </ToastProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
