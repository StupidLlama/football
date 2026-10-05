"use client";
// 要登入才能看的頁面：還沒登入就帶去登入頁。
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { configured } from "@/lib/supabase";
import { ErrorBox, Loading } from "./ui";

export function RequireLogin({ children }: { children: ReactNode }) {
  const { ready, session, teams, error, reload } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (configured && ready && !session) router.replace("/login");
  }, [ready, session, router]);
  if (!configured) return <div className="narrow"><ErrorBox text="網站還沒設定 Supabase（web/.env.local）。" /></div>;
  if (error) return <div className="narrow"><ErrorBox text={error} onRetry={reload} /></div>;
  if (!ready || !session || !teams) return <div className="narrow"><Loading /></div>;
  return <>{children}</>;
}
