"use client";
// 登入狀態：誰登入了、個人資料、加入了哪些球隊。整個網站共用（放在 app/layout.tsx 的 Providers 裡）。
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "./supabase";
import { getMyTeams, getProfile, type MyTeam, type Profile } from "./api";

type Auth = {
  ready: boolean;                 // 確認過有沒有登入了
  session: Session | null;
  userId: string | null;
  email: string;
  provider: string;               // google / email
  profile: Profile | null;
  teams: MyTeam[] | null;         // null = 還在讀
  error: string;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!configured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<MyTeam[] | null>(null);
  const [error, setError] = useState("");
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!configured) return;
    const db = supabase();
    db.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = db.auth.onAuthStateChange((_event, s) => { setSession(s); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    if (!userId) { setProfile(null); setTeams(null); return; }
    try {
      const [p, t] = await Promise.all([getProfile(userId), getMyTeams(userId)]);
      setProfile(p); setTeams(t); setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTeams([]);
    }
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setSession(null); setProfile(null); setTeams(null);
  }, []);

  const value: Auth = {
    ready, session, userId, email: session?.user.email ?? "",
    provider: String(session?.user.app_metadata?.provider ?? ""),
    profile, teams, error, reload, signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth 要放在 AuthProvider 裡面");
  return v;
}

/** 顯示用的名字：顯示名稱 → Email 前半段。 */
export function displayName(a: Auth): string {
  return a.profile?.display_name?.trim() || a.email.split("@")[0] || "你";
}
