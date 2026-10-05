"use client";
// 要登入才能看的頁面：還沒登入 → 登入頁；還沒同意目前版本的政策 → 同意頁。
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { needsConsent } from "@/lib/policies";
import { configured } from "@/lib/supabase";
import { ErrorBox, Loading } from "./ui";

export function RequireLogin({ children, skipConsent = false }: { children: ReactNode; skipConsent?: boolean }) {
  const { ready, session, teams, profile, error, reload } = useAuth();
  const router = useRouter();
  const path = usePathname() ?? "/";
  const mustConsent = !skipConsent && !!profile && needsConsent(profile.policy_version);

  useEffect(() => {
    if (configured && ready && !session) router.replace("/login");
  }, [ready, session, router]);
  useEffect(() => {
    if (mustConsent) router.replace(`/consent?next=${encodeURIComponent(path)}`);
  }, [mustConsent, path, router]);

  if (!configured) return <div className="narrow"><ErrorBox text="網站還沒設定 Supabase（web/.env.local）。" /></div>;
  if (error) return <div className="narrow"><ErrorBox text={error} onRetry={reload} /></div>;
  if (!ready || !session || !teams || !profile || mustConsent) return <div className="narrow"><Loading /></div>;
  return <>{children}</>;
}
