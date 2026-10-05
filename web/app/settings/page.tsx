"use client";
// 設定：個人資料、我的球隊（離隊）、文字大小、隱私與帳號（同意紀錄、下載資料、刪除帳號）、網站管理員（建立隊伍、聯絡訊息）。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { actions, CONTACT_CATEGORIES, getContactMessages, setContactStatus, setDisplayName, type ContactMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { safeNext } from "@/lib/nav";
import { TEXT_SIZES, setTextSize, textSize } from "@/lib/prefs";
import { message } from "@/lib/status";
import { DATA_REGION, POLICY_VERSION } from "@/lib/policies";
import { RequireLogin } from "@/components/guard";
import { ConfirmButton } from "@/components/confirm-button";
import { dateLabel, ErrorBox, Footer, RoleBadge, Soon, useToast } from "@/components/ui";

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
        {auth.profile?.is_admin && <div className="row"><span className="faint" style={{ width: 96, flex: "none" }}>身分</span><span className="accent" style={{ flex: 1 }}>網站管理員</span></div>}
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
      {auth.profile?.is_admin && <AdminMessages />}

      <PrivacyAndAccount />
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

  const [confirming, setConfirming] = useState(false);

  function review(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) { setConfirming(true); setError(""); setResult(null); }
  }

  async function create() {
    if (busy) return;              // 連按兩次只建一隊
    setBusy(true); setError("");
    const r = await actions.createTeam(name.trim(), season.trim() || null, league.trim() || null);
    if (r.status === "ok") { setResult({ code: String(r.code), coach: String(r.coach_code) }); setName(""); setSeason(""); setLeague(""); onCreated(); }
    else setError(message(r));
    setConfirming(false);
    setBusy(false);
  }

  return (
    <section aria-labelledby="s-admin" className="panel" style={{ marginTop: 16, padding: "20px 24px", borderColor: "#F5A52466" }}>
      <h2 id="s-admin" className="accent" style={{ margin: "0 0 4px", fontSize: 20 }}>網站管理員：建立隊伍</h2>
      <p className="faint" style={{ margin: "0 0 12px", fontSize: 14 }}>建立後會給你 Team ID 和第一組管理員碼（7 天有效）。你不會自動加入這一隊。</p>
      {error && <ErrorBox text={error} />}
      {result && (
        <div role="status" className="status ok">
          已建立。Team ID：<b className="num accent">{result.code}</b>，管理員碼：<b className="num accent">{result.coach}</b>
          <span className="faint" style={{ display: "block", fontSize: 13 }}>管理員碼只會顯示這一次，請私訊給這一隊的球隊管理員。</span>
        </div>
      )}
      <form onSubmit={review} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
        <label className="label">隊伍名稱<input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
        <label className="label">賽季<input className="field" value={season} onChange={(e) => setSeason(e.target.value)} maxLength={20} placeholder="2026-27" /></label>
        <label className="label">聯賽隊名<input className="field" value={league} onChange={(e) => setLeague(e.target.value)} maxLength={20} placeholder="例如：資訊" /></label>
        <button type="submit" className="btn btn-main" disabled={busy || !name.trim() || confirming}>建立隊伍</button>
      </form>
      {confirming && (
        <div role="alertdialog" aria-label="確認建立隊伍" className="status warn" style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 8px" }}>確定要建立「<b>{name.trim()}</b>」{season.trim() ? `（${season.trim()}）` : ""}{league.trim() ? `，聯賽隊名「${league.trim()}」` : ""}嗎？建立後會產生 Team ID 和第一組管理員碼。</p>
          <div className="chips">
            <button type="button" className="btn btn-main btn-sm" onClick={create} disabled={busy}>{busy ? "建立中…" : "確定建立"}</button>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setConfirming(false)} disabled={busy}>返回修改</button>
          </div>
        </div>
      )}
    </section>
  );
}

function PrivacyAndAccount() {
  const auth = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const [askDelete, setAskDelete] = useState(false);
  const p = auth.profile;
  const coachTeams = (auth.teams ?? []).filter((t) => t.membership.role === "coach").map((t) => t.team.name);

  async function download() {
    setBusy(true); setError("");
    const r = await actions.exportMyData();
    setBusy(false);
    if (r.status !== "ok") { setError(message(r)); return; }
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `football-potato-我的資料-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function remove() {
    if (typed.trim() !== "刪除") return;
    setBusy(true); setError("");
    const r = await actions.deleteMyAccount();
    if (r.status !== "ok") { setError(message(r)); setBusy(false); return; }
    await auth.signOut();
    router.replace("/?deleted=1");
  }

  return (
    <section aria-labelledby="s-privacy" className="panel" style={{ marginTop: 16, padding: "20px 24px" }}>
      <h2 id="s-privacy" style={{ margin: "0 0 4px", fontSize: 20 }}>隱私與帳號</h2>
      {error && <ErrorBox text={error} />}
      <div className="row"><span className="faint" style={{ width: 112, flex: "none" }}>同意的政策</span>
        <span style={{ flex: 1, minWidth: 0 }}>版本 {p?.policy_version ?? "—"}（{dateLabel(p?.policy_accepted_at)} 同意）
          {p?.policy_version !== POLICY_VERSION && <span className="accent">，有新版本</span>}<br />
          <Link href="/privacy">隱私權政策</Link>　<Link href="/terms">服務條款</Link></span></div>
      <div className="row"><span className="faint" style={{ width: 112, flex: "none" }}>資料存放</span><span style={{ flex: 1 }}>{DATA_REGION}</span></div>
      <div className="row"><span className="faint" style={{ width: 112, flex: "none" }}>誰看得到</span>
        <span style={{ flex: 1 }}>同隊的成員看得到你的名單資料和能力自評；別隊看不到。網站管理員為了維護網站可以存取資料庫。</span></div>
      <div className="row"><span className="faint" style={{ width: 112, flex: "none" }}>瀏覽器存的</span>
        <span style={{ flex: 1 }}>只有登入狀態、文字大小和能力表草稿；沒有追蹤或廣告 Cookie。</span></div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 200px", minWidth: 0 }}><span style={{ display: "block" }}>下載我的資料</span>
          <span className="faint" style={{ fontSize: 14 }}>帳號、球隊、名單資料、每一次的能力自評、聯絡訊息（JSON 檔）</span></span>
        <button type="button" className="btn btn-line btn-sm" onClick={download} disabled={busy}>下載</button>
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 200px", minWidth: 0 }}><span style={{ display: "block" }}>查詢、更正或其他個資要求</span>
          <span className="faint" style={{ fontSize: 14 }}>網站管理員會在 15 天內回覆</span></span>
        <Link className="btn btn-line btn-sm" href="/contact?type=privacy">聯絡網站管理員</Link>
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 200px", minWidth: 0 }}><span style={{ display: "block" }}>刪除我的帳號</span>
          <span className="faint" style={{ fontSize: 14 }}>帳號、所有球隊的成員身分、你的能力自評和自我介紹都會刪除，無法復原。名單上的名字會留著，由球隊管理員決定要不要刪。</span></span>
        {!askDelete && <button type="button" className="btn btn-danger btn-sm" onClick={() => setAskDelete(true)}>刪除帳號</button>}
      </div>
      {askDelete && (
        <div className="status err" role="alertdialog" aria-label="確認刪除帳號">
          {coachTeams.length > 0 && <p style={{ margin: "0 0 8px" }}>你是 {coachTeams.join("、")} 的球隊管理員。刪除後如果那一隊沒有其他管理員，要請網站管理員處理。</p>}
          <label className="label" style={{ color: "#FECDD3" }}>確定的話，請輸入「刪除」兩個字
            <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <div className="chips" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-danger" disabled={typed.trim() !== "刪除" || busy} onClick={remove}>{busy ? "刪除中…" : "永久刪除我的帳號"}</button>
            <button type="button" className="btn btn-line" onClick={() => { setAskDelete(false); setTyped(""); }}>取消</button>
          </div>
        </div>
      )}
      <div className="row"><span style={{ flex: 1 }}>登出這台裝置</span>
        <button type="button" className="btn btn-line btn-sm" onClick={async () => { await auth.signOut(); router.replace("/"); }}>登出</button></div>
    </section>
  );
}

function AdminMessages() {
  const [list, setList] = useState<ContactMessage[] | null>(null);
  const [error, setError] = useState("");
  const load = () => getContactMessages().then(setList).catch((e) => setError(String(e.message ?? e)));
  useEffect(() => { load(); }, []);
  const label = Object.fromEntries(CONTACT_CATEGORIES);
  const open = (list ?? []).filter((m) => m.status === "new").length;
  return (
    <section aria-labelledby="s-msgs" className="panel" style={{ marginTop: 16, padding: "20px 24px", borderColor: "#F5A52466" }}>
      <h2 id="s-msgs" className="accent" style={{ margin: "0 0 4px", fontSize: 20 }}>網站管理員：聯絡訊息{open ? `（${open} 則未處理）` : ""}</h2>
      <p className="faint" style={{ margin: "0 0 8px", fontSize: 14 }}>新訊息也會通知到你的 Discord。這裡是完整紀錄。</p>
      {error && <ErrorBox text={error} />}
      {list === null && <p className="faint">讀取中…</p>}
      {list?.length === 0 && <p className="faint">還沒有訊息。</p>}
      {list?.map((m) => (
        <div key={m.id} className="row" style={{ flexWrap: "wrap", alignItems: "flex-start", opacity: m.status === "done" ? 0.6 : 1 }}>
          <span style={{ flex: "1 1 260px", minWidth: 0 }}>
            <span className="pill">{label[m.category] ?? m.category}</span>
            <span className="faint" style={{ marginLeft: 8, fontSize: 13 }}>{dateLabel(m.created_at)}{m.page ? `・${m.page}` : ""}</span>
            <span style={{ display: "block", whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 4 }}>{m.body}</span>
          </span>
          <button type="button" className="btn btn-line btn-sm"
            onClick={async () => { await setContactStatus(m.id, m.status === "new" ? "done" : "new"); load(); }}>
            {m.status === "new" ? "標記已處理" : "改回未處理"}
          </button>
        </div>
      ))}
    </section>
  );
}

export default function SettingsPage() {
  return <RequireLogin><Settings /></RequireLogin>;
}
