"use client";
// 設定：個人資料、我的球隊（離隊）、文字大小、系統管理者建立隊伍、隱私（之後）。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { actions, setDisplayName } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { safeNext } from "@/lib/nav";
import { TEXT_SIZES, setTextSize, textSize } from "@/lib/prefs";
import { message } from "@/lib/status";
import { RequireLogin } from "@/components/guard";
import { ConfirmButton } from "@/components/confirm-button";
import { ErrorBox, Footer, RoleBadge, Soon, useToast } from "@/components/ui";

function Settings() {
  const auth = useAuth();
  const say = useToast();
  const router = useRouter();
  const [back, setBack] = useState("/teams");
  const [name, setName] = useState(auth.profile?.display_name ?? "");
  const [size, setSize] = useState("std");
  const [error, setError] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("team");
    setBack(safeNext(t ? `/t/${encodeURIComponent(t)}` : null) ?? "/teams");
    setSize(textSize());
  }, []);
  useEffect(() => { setName(auth.profile?.display_name ?? ""); }, [auth.profile?.display_name]);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setError("顯示名稱不能空白"); return; }
    try { await setDisplayName(auth.userId!, n); await auth.reload(); say("已儲存"); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function leave(teamId: string, teamName: string) {
    const r = await actions.leave(teamId);
    if (r.status === "ok") { await auth.reload(); say(`已離開${teamName}`); setBack("/teams"); }
    else setError(message(r));
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 20px 48px" }}>
      <Link className="btn btn-line btn-sm" href={back}>返回</Link>
      <h1 style={{ margin: "16px 0 24px", fontSize: 30 }}>設定</h1>
      {error && <ErrorBox text={error} />}

      <section aria-labelledby="s-profile" className="panel" style={{ padding: "20px 24px" }}>
        <h2 id="s-profile" style={{ margin: "0 0 12px", fontSize: 20 }}>個人資料</h2>
        <form onSubmit={saveName}>
          <label className="label">顯示名稱（隊友在成員名單看到的名字；連到名單後會改顯示名單上的名字）
            <span style={{ display: "flex", gap: 8 }}>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} style={{ flex: 1, minWidth: 0 }} />
              <button type="submit" className="btn btn-main">儲存</button>
            </span>
          </label>
        </form>
        <div className="row" style={{ marginTop: 16 }}><span className="faint" style={{ width: 96, flex: "none" }}>Email</span><span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{auth.email}</span></div>
        <div className="row"><span className="faint" style={{ width: 96, flex: "none" }}>登入方式</span><span style={{ flex: 1 }}>{auth.provider === "google" ? "Google" : auth.provider === "email" ? "Email 和密碼" : auth.provider}</span></div>
        {auth.profile?.is_admin && <div className="row"><span className="faint" style={{ width: 96, flex: "none" }}>身分</span><span className="accent" style={{ flex: 1 }}>系統管理者</span></div>}
      </section>

      <section aria-labelledby="s-teams" className="panel" style={{ marginTop: 16, padding: "20px 24px" }}>
        <h2 id="s-teams" style={{ margin: "0 0 4px", fontSize: 20 }}>我的球隊</h2>
        {(auth.teams ?? []).length === 0 && <p className="faint">還沒有加入任何球隊。</p>}
        {(auth.teams ?? []).map(({ team, membership }) => (
          <div key={team.id} className="row" style={{ flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 160px", minWidth: 0 }}><Link className="linkname" href={`/t/${team.id}`}>{team.name}</Link><br /><span className="faint" style={{ fontSize: 14 }}>{team.season}</span></span>
            <RoleBadge coach={membership.role === "coach"} />
            <ConfirmButton label="離開" confirm="確定離開？" onConfirm={() => leave(team.id, team.name)} />
          </div>
        ))}
        <Link className="btn btn-line" href="/join" style={{ marginTop: 12 }}>加入另一隊</Link>
      </section>

      <section aria-labelledby="s-look" className="panel" style={{ marginTop: 16, padding: "20px 24px" }}>
        <h2 id="s-look" style={{ margin: "0 0 12px", fontSize: 20 }}>顯示</h2>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 14 }}>文字大小（只影響這台裝置）</p>
        <div role="radiogroup" aria-label="文字大小" className="chips">
          {TEXT_SIZES.map((s) => (
            <button key={s.key} type="button" role="radio" className="chip" aria-checked={size === s.key} style={{ fontSize: s.px, minHeight: 44, padding: "0 18px" }}
              onClick={() => { setSize(s.key); setTextSize(s.key); }}>{s.label}</button>
          ))}
        </div>
        <p className="muted" style={{ margin: "16px 0 8px", fontSize: 14 }}>主題</p>
        <div className="chips"><span className="chip" aria-checked="true" role="radio">深色</span><span className="chip" style={{ opacity: .6 }}>淺色 <Soon /></span></div>
      </section>

      {auth.profile?.is_admin && <AdminCreateTeam onCreated={() => auth.reload()} />}

      <section aria-labelledby="s-privacy" className="panel" style={{ marginTop: 16, padding: "20px 24px" }}>
        <h2 id="s-privacy" style={{ margin: "0 0 4px", fontSize: 20 }}>隱私與帳號</h2>
        <div className="row"><span style={{ flex: 1 }}>隱私權政策</span><Soon /></div>
        <div className="row"><span style={{ flex: 1 }}>服務條款</span><Soon /></div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 200px", minWidth: 0 }}><span style={{ display: "block" }}>刪除我的帳號</span>
            <span className="faint" style={{ fontSize: 14 }}>現在請找系統管理者處理；自己刪除的按鈕之後加上</span></span>
          <Soon />
        </div>
        <div className="row"><span style={{ flex: 1 }}>登出這台裝置</span>
          <button type="button" className="btn btn-line btn-sm" onClick={async () => { await auth.signOut(); router.replace("/"); }}>登出</button></div>
      </section>
      <Footer />
    </div>
  );
}

function AdminCreateTeam({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [league, setLeague] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ code: string; coach: string } | null>(null);
  const [error, setError] = useState("");

  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy) return;              // 連按兩次只建一隊
    setBusy(true); setError(""); setResult(null);
    const r = await actions.createTeam(name.trim(), season.trim() || null, league.trim() || null);
    if (r.status === "ok") { setResult({ code: String(r.code), coach: String(r.coach_code) }); setName(""); onCreated(); }
    else setError(message(r));
    setBusy(false);
  }

  return (
    <section aria-labelledby="s-admin" className="panel" style={{ marginTop: 16, padding: "20px 24px", borderColor: "#F5A52466" }}>
      <h2 id="s-admin" className="accent" style={{ margin: "0 0 4px", fontSize: 20 }}>系統管理者：建立隊伍</h2>
      <p className="faint" style={{ margin: "0 0 12px", fontSize: 14 }}>建立後會給你 Team ID 和第一組教練碼（7 天有效）。你不會自動加入這一隊。</p>
      {error && <ErrorBox text={error} />}
      {result && (
        <div role="status" className="status ok">
          已建立。Team ID：<b className="num accent">{result.code}</b>，教練碼：<b className="num accent">{result.coach}</b>
          <span className="faint" style={{ display: "block", fontSize: 13 }}>教練碼只會顯示這一次，請私訊給這一隊的教練。</span>
        </div>
      )}
      <form onSubmit={create} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
        <label className="label">隊伍名稱<input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
        <label className="label">賽季<input className="field" value={season} onChange={(e) => setSeason(e.target.value)} maxLength={20} placeholder="2026-27" /></label>
        <label className="label">聯賽隊名<input className="field" value={league} onChange={(e) => setLeague(e.target.value)} maxLength={20} placeholder="例如：資訊" /></label>
        <button type="submit" className="btn btn-main" disabled={busy || !name.trim()}>{busy ? "建立中…" : "建立隊伍"}</button>
      </form>
    </section>
  );
}

export default function SettingsPage() {
  return <RequireLogin><Settings /></RequireLogin>;
}
