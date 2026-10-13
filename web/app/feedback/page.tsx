"use client";
// v2.9 意見回饋（SPEC F10）
//   我的回饋：自己送過的回饋、狀態、網站管理員的回覆（打開這一頁就把回覆標成看過）
//   回饋管理（只有網站管理員）：全部回饋，依狀態篩選，改狀態（新的 → 處理中 → 已解決）、回覆
// 權限由資料庫把關：一般人只讀得到自己的（RLS），改狀態、回覆的函式只給網站管理員（0013）。
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CONTACT_CATEGORIES, feedbackActions, getContactMessages, getMyFeedback, type ContactMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FEEDBACK_STATUS, hasUnreadReply, sortFeedback, statusLabel, type FeedbackStatus } from "@/lib/feedback";
import { message } from "@/lib/status";
import { BackButton, useLeaveGuard } from "@/components/back-button";
import { RequireLogin } from "@/components/guard";
import { feedbackChanged } from "@/components/feedback";
import { dateLabel, ErrorBox, Footer, Loading, useToast } from "@/components/ui";

const CATEGORY = Object.fromEntries(CONTACT_CATEGORIES);
const STATUS_COLOR: Record<string, string> = { new: "#F5A524", doing: "#60A5FA", done: "#4ADE80" };

function StatusTag({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? "#8A97AD";
  return <span className="tag" style={{ border: `1px solid ${c}`, color: c }}>{statusLabel(status)}</span>;
}

function Meta({ m }: { m: ContactMessage }) {
  const bits = [dateLabel(m.created_at), m.page, m.version, m.device].filter(Boolean);
  return <span className="faint" style={{ fontSize: 13, overflowWrap: "anywhere" }}>{bits.join("・")}</span>;
}

function Body({ text }: { text: string }) {
  return <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</p>;
}

function ReplyBox({ m, fresh }: { m: ContactMessage; fresh: boolean }) {
  return (
    <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: "#10203A", borderLeft: `4px solid ${fresh ? "#F5A524" : "#3B82F6"}` }}>
      <span className="faint" style={{ fontSize: 13 }}>網站管理員回覆・{dateLabel(m.replied_at)}{fresh ? "・新的" : ""}</span>
      <Body text={m.reply} />
    </div>
  );
}

// ---------- 我的回饋 ----------
function Mine({ userId }: { userId: string }) {
  const [list, setList] = useState<ContactMessage[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    getMyFeedback(userId).then(async (l) => {
      setList(l);
      // 先記下哪些是「新的回覆」（畫面上標出來），再標成看過、讓側邊欄的小圓點消失
      const unread = new Set(l.filter(hasUnreadReply).map((m) => m.id));
      setFresh(unread);
      if (unread.size) { await feedbackActions.markRead(); feedbackChanged(); }
    }).catch((e) => setError(String(e.message ?? e)));
  }, [userId]);

  if (error) return <ErrorBox text={error} />;
  if (list === null) return <Loading />;
  if (list.length === 0) {
    return <p className="muted">你還沒送過回饋。看到怪怪的地方，按右下角的「回饋」就可以告訴網站管理員。</p>;
  }
  return (
    <div className="stack" style={{ gap: 12 }}>
      {list.map((m) => (
        <article key={m.id} className="panel pad">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="pill">{CATEGORY[m.category] ?? m.category}</span>
            <StatusTag status={m.status} />
            <Meta m={m} />
          </div>
          <Body text={m.body} />
          {m.reply ? <ReplyBox m={m} fresh={fresh.has(m.id)} /> : <p className="faint" style={{ margin: "8px 0 0", fontSize: 14 }}>還沒有回覆。</p>}
        </article>
      ))}
    </div>
  );
}

// ---------- 回饋管理（網站管理員） ----------
function AdminItem({ m, me, onChanged }: { m: ContactMessage; me: string; onChanged: () => void }) {
  const toast = useToast();
  const [reply, setReply] = useState(m.reply);
  const [busy, setBusy] = useState(false);
  const dirty = reply.trim() !== m.reply.trim();
  const guard = useLeaveGuard(dirty && !busy);

  async function run(p: Promise<{ status: string; detail?: string }>, ok: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.status === "ok") { toast(ok); onChanged(); feedbackChanged(); } else toast(message(r));
  }

  return (
    <article className="panel pad" style={{ opacity: m.status === "done" && !dirty ? 0.75 : 1 }}>
      {guard}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="pill">{CATEGORY[m.category] ?? m.category}</span>
        <StatusTag status={m.status} />
        <Meta m={m} />
        {m.user_id === me && <span className="faint" style={{ fontSize: 13 }}>（你自己送的）</span>}
      </div>
      <Body text={m.body} />
      <p className="faint" style={{ margin: "6px 0 0", fontSize: 13 }}>
        填寫的人：帳號 <code>{(m.user_id ?? "已刪除").slice(0, 8)}</code>（Email 在 Discord 的通知裡）
      </p>
      <div role="radiogroup" aria-label="狀態" className="chips" style={{ marginTop: 12 }}>
        {FEEDBACK_STATUS.map(([k, label]) => (
          <button key={k} type="button" role="radio" className="chip" aria-checked={m.status === k} disabled={busy}
            onClick={() => m.status !== k && run(feedbackActions.setStatus(m.id, k), `改成「${label}」`)}>{label}</button>
        ))}
      </div>
      <label className="label" style={{ marginTop: 12 }}>回覆（填寫的人會在「我的回饋」看到，側邊欄會亮小圓點）
        <textarea className="field" rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} />
      </label>
      {m.replied_at && <p className="faint" style={{ margin: "4px 0 0", fontSize: 13 }}>
        上次回覆 {dateLabel(m.replied_at)}{m.reply_read_at && m.reply_read_at >= m.replied_at ? "・對方看過了" : "・對方還沒看"}</p>}
      <div className="chips" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-main btn-sm" disabled={busy || !reply.trim() || !dirty}
          onClick={() => run(feedbackActions.reply(m.id, reply, "done"), "已回覆，標成已解決")}>回覆並標成已解決</button>
        <button type="button" className="btn btn-line btn-sm" disabled={busy || !reply.trim() || !dirty}
          onClick={() => run(feedbackActions.reply(m.id, reply), "已回覆")}>只回覆</button>
      </div>
    </article>
  );
}

function Admin({ me }: { me: string }) {
  const [list, setList] = useState<ContactMessage[] | null>(null);
  const [filter, setFilter] = useState<FeedbackStatus | "all">("new");
  const [error, setError] = useState("");
  const load = useCallback(() => {
    getContactMessages().then((l) => setList(sortFeedback(l))).catch((e) => setError(String(e.message ?? e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox text={error} onRetry={load} />;
  if (list === null) return <Loading />;
  const count = (s: FeedbackStatus) => list.filter((m) => m.status === s).length;
  const shown = filter === "all" ? list : list.filter((m) => m.status === filter);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div role="radiogroup" aria-label="篩選狀態" className="chips">
        {FEEDBACK_STATUS.map(([k, label]) => (
          <button key={k} type="button" role="radio" className="chip" aria-checked={filter === k} onClick={() => setFilter(k)}>{label} {count(k)}</button>
        ))}
        <button type="button" role="radio" className="chip" aria-checked={filter === "all"} onClick={() => setFilter("all")}>全部 {list.length}</button>
      </div>
      {shown.length === 0 && <p className="muted">沒有{filter === "all" ? "" : `「${statusLabel(filter)}」的`}回饋。</p>}
      {shown.map((m) => <AdminItem key={`${m.id}-${m.replied_at ?? ""}-${m.status}`} m={m} me={me} onChanged={load} />)}
    </div>
  );
}

function Feedback() {
  const auth = useAuth();
  const isAdmin = !!auth.profile?.is_admin;
  const [tab, setTab] = useState<"mine" | "admin">("mine");
  useEffect(() => {
    if (isAdmin && new URLSearchParams(window.location.search).get("tab") === "admin") setTab("admin");
  }, [isAdmin]);
  if (!auth.userId) return null;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 48px" }}>
      <BackButton fallback="/teams" />
      <h1 style={{ margin: "16px 0 4px", fontSize: 30 }}>意見回饋</h1>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        回報問題或提建議：每一頁右下角的「回饋」按鈕，或 <Link href="/contact">聯絡我們</Link>。網站管理員的回覆會出現在這裡。
      </p>
      {isAdmin && (
        <div role="tablist" aria-label="意見回饋" className="chips" style={{ marginBottom: 16 }}>
          <button type="button" role="tab" className={`chip${tab === "mine" ? " on" : ""}`} aria-selected={tab === "mine"} onClick={() => setTab("mine")}>我的回饋</button>
          <button type="button" role="tab" className={`chip${tab === "admin" ? " on" : ""}`} aria-selected={tab === "admin"} onClick={() => setTab("admin")}>回饋管理（網站管理員）</button>
        </div>
      )}
      {tab === "admin" && isAdmin ? <Admin me={auth.userId} /> : <Mine userId={auth.userId} />}
      <Footer />
    </div>
  );
}

export default function FeedbackPage() {
  return <RequireLogin><Feedback /></RequireLogin>;
}
