"use client";
import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { ChalkDefs, ToastProvider } from "@/components/ui";
import { loadTextSize } from "@/lib/prefs";

export function Providers({ children }: { children: ReactNode }) {
  // 設定頁選的文字大小（存在這台裝置的瀏覽器）
  useEffect(() => { loadTextSize(); }, []);
  return (
    <AuthProvider>
      <ToastProvider>
        <ChalkDefs />
        {children}
      </ToastProvider>
    </AuthProvider>
  );
}
