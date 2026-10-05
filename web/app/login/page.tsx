"use client";
// 登入：Google 或 Email。第一次用 Google 登入會自動建立帳號；Email 要先註冊、到信箱點確認。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import { configured, supabase } from "@/lib/supabase";
import { ErrorBox } from "@/components/ui";

// Supabase 的英文錯誤 → 中文
function authMessage(m: string): string {
  if (/invalid login credentials/i.test(m)) return "Email 或密碼不對";
  if (/email not confirmed/i.test(m)) return "這個 Email 還沒確認，請到信箱點確認連結";
  if (/already registered|already been registered/i.test(m)) return "這個 Email 已經註冊過了，請直接登入";
  if (/password should be at least/i.test(m)) return "密碼至少要 8 個字";
  if (/rate limit|too many/i.test(m)) return "嘗試太多次了，請稍後再試";
  if (/provider is not enabled/i.test(m)) return "這個登入方式還沒開啟，請找管理者";
  return `登入失敗：${m}`;
}

export default function LoginPage() {
  const { session, teams } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (session && teams) router.replace(homeFor(teams));
  }, [session, teams, router]);

  async function google() {
    setError(""); setBusy(true);
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      // 每次都讓使用者選要用哪個 Google 帳號（有好幾個帳號的人才不會自動登入錯的）
      options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: "select_account" } },
    });
    if (error) { setError(authMessage(error.message)); setBusy(false); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(""); setInfo("");
    if (mode === "signup" && password.length < 8) { setError("密碼至少要 8 個字"); return; }
    setBusy(true);
    const auth = supabase().auth;
    if (mode === "login") {
      const { error } = await auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(authMessage(error.message));
    } else {
      const { data, error } = await auth.signUp({
        email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) setError(authMessage(error.message));
      else if (!data.session) setInfo(`確認信已寄到 ${email.trim()}，點信裡的連結就完成註冊。沒收到的話看一下垃圾郵件。`);
    }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "24px 20px 48px" }}>
      <Link className="btn btn-line" href="/" style={{ borderColor: "transparent", marginLeft: -16 }}>回首頁</Link>
      <h1 style={{ margin: "16px 0 4px", fontSize: 34 }}>{mode === "login" ? "登入" : "用 Email 註冊"}</h1>
      <p className="muted" style={{ margin: "0 0 24px" }}>
        {mode === "login" ? "第一次用 Google 登入會自動建立帳號。" : "註冊後到信箱點確認連結，就可以登入。"}
      </p>
      {!configured && <ErrorBox text="網站還沒設定 Supabase（web/.env.local）。" />}
      {error && <ErrorBox text={error} />}
      {info && <p className="status ok" role="status">{info}</p>}

      <button type="button" className="btn btn-wide" onClick={google} disabled={busy || !configured}
        style={{ minHeight: 52, border: 0, background: "#E9EDF3", color: "#0B1220", fontSize: 18, fontWeight: 700 }}>
        用 Google 登入
      </button>
      <div className="faint" style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0", fontSize: 13 }}>
        <span style={{ flex: 1, height: 1, background: "#22304A" }} />或用 Email<span style={{ flex: 1, height: 1, background: "#22304A" }} />
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="label">Email
          <input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="label">密碼{mode === "signup" && "（至少 8 個字）"}
          <input className="field" type="password" required minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-line" disabled={busy || !configured}
          style={{ minHeight: 48, borderColor: "#2DD4BF", color: "#2DD4BF", fontWeight: 700 }}>
          {busy ? "處理中…" : mode === "login" ? "用 Email 登入" : "註冊"}
        </button>
      </form>
      <p className="faint" style={{ marginTop: 16, fontSize: 14 }}>
        {mode === "login" ? "還沒有帳號？" : "已經有帳號？"}
        <button type="button" className="btn btn-text" style={{ fontSize: 14 }}
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setInfo(""); }}>
          {mode === "login" ? "用 Email 註冊" : "回到登入"}
        </button>
      </p>
    </div>
  );
}
