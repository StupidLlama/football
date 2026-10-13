"use client";
// v2.9 意見回饋（SPEC F10）：
//   FeedbackForm  回饋表單（浮動按鈕的視窗和 /contact 頁共用）
//   FeedbackFab   每一頁右下角的「回饋」按鈕（登入後才出現；正在打字時自動藏起來，不擋住送出鍵）
//   useFeedbackBadge / FeedbackNavLink  側邊欄「意見回饋」的小圓點：自己沒看過的回覆（網站管理員再加上新的回饋）
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CONTACT_CATEGORIES, getContactMessages, getMyFeedback, sendContact } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { deviceLabel, feedbackBadge, pagePath } from "@/lib/feedback";
import { message } from "@/lib/status";
import { LATEST } from "@/lib/updates";
import { useLeaveGuard } from "./back-button";
import { ErrorBox } from "./ui";

export const FEEDBACK_EVENT = "fap-feedback";

/** 送出、回覆看過之後通知小圓點重新算。 */
export function feedbackChanged() {
  window.dispatchEvent(new Event(FEEDBACK_EVENT));
}

function useDevice(): string {
  const [d, setD] = useState("");
  useEffect(() => { setD(deviceLabel(navigator.userAgent, navigator.maxTouchPoints ?? 0)); }, []);
  return d;
}

export function FeedbackForm({ page, onSent, autoFocus = false }: { page: string; onSent?: () => void; autoFocus?: boolean }) {
  const [category, setCategory] = useState("bug");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const device = useDevice();
  // 寫了一半要離開（點連結、重新整理）先確認
  const guard = useLeaveGuard(body.trim() !== "" && !busy);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("type");
    if (t && CONTACT_CATEGORIES.some(([k]) => k === t)) setCategory(t);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setError("");
    const r = await sendContact(category, body.trim(), page, LATEST, device);
    setBusy(false);
    if (r.status === "ok") { setSent(true); setBody(""); feedbackChanged(); onSent?.(); } else setError(message(r));
  }

  if (sent) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <p className="status ok" role="status" style={{ margin: 0 }}>已送出，謝謝！網站管理員的回覆會出現在「我的回饋」。</p>
        <div className="chips">
          <Link className="btn btn-line btn-sm" href="/feedback">看我的回饋</Link>
          <button type="button" className="btn btn-line btn-sm" onClick={() => setSent(false)}>再寫一則</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
      {guard}
      {error && <ErrorBox text={error} />}
      <div role="radiogroup" aria-label="類型" className="chips">
        {CONTACT_CATEGORIES.map(([k, label]) => (
          <button key={k} type="button" role="radio" className="chip" aria-checked={category === k} onClick={() => setCategory(k)}>{label}</button>
        ))}
      </div>
      <label className="label">內容（最多 2000 字）
        <textarea className="field" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required rows={5} autoFocus={autoFocus}
          placeholder={category === "bug" ? "做了什麼、看到什麼？（例如：按了儲存，畫面沒反應）" : category === "privacy" ? "想查詢、更正或刪除哪些資料？" : "想到什麼都可以寫"} />
      </label>
      <div className="faint" style={{ fontSize: 14, lineHeight: 1.6 }}>
        會一起送出：你的 Email（方便回覆）、這一頁 <code>{page || "—"}</code>、網站版本 {LATEST}、裝置 {device || "—"}。請不要在這裡寫密碼。
      </div>
      <button type="submit" className="btn btn-main" disabled={busy || !body.trim()}>{busy ? "送出中…" : "送出"}</button>
    </form>
  );
}

// 不顯示浮動按鈕的頁面：沒登入的首頁、登入、同意頁、分享的陣容，以及本來就是回饋的頁面
function hiddenOn(path: string): boolean {
  return path === "/" || path === "/login" || path === "/consent" || path === "/contact" || path === "/feedback" || path.startsWith("/l/");
}

/** 正在輸入（聊天室、能力表…）時藏起來：手機鍵盤跳出來時按鈕不會蓋住送出鍵。 */
function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "TEXTAREA" || t.tagName === "SELECT"
      || (t.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes((t as HTMLInputElement).type)) || t.isContentEditable);
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => { document.removeEventListener("focusin", onIn); document.removeEventListener("focusout", onOut); };
  }, []);
  return typing;
}

export function FeedbackFab() {
  const auth = useAuth();
  const path = usePathname() ?? "";
  const typing = useTyping();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState("");

  const show = () => {
    setPage(pagePath(window.location.href));
    setOpen(true);
    const d = ref.current;
    if (d && !d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } }
  };
  const close = () => { ref.current?.close(); setOpen(false); };

  if (!auth.ready || !auth.userId || hiddenOn(path)) return null;
  return (
    <>
      {!typing && !open && (
        <button type="button" className="fb-fab" onClick={show} aria-haspopup="dialog">
          <span aria-hidden="true">✎</span><span>回饋</span>
        </button>
      )}
      <dialog ref={ref} className="update-pop" aria-labelledby="fb-h" onClose={() => setOpen(false)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h2 id="fb-h" style={{ margin: 0, fontSize: 24, flex: 1 }}>意見回饋</h2>
          <button type="button" className="btn btn-line btn-sm" onClick={close} aria-label="關閉">✕</button>
        </div>
        <p className="muted" style={{ margin: "0 0 16px" }}>網站哪裡怪怪的、想要什麼功能，都可以直接告訴網站管理員。</p>
        {open && <FeedbackForm page={page} autoFocus />}
      </dialog>
    </>
  );
}

/** 側邊欄「意見回饋」的數字。沒登入或讀不到就是 0（只是提醒，不影響其他功能）。 */
export function useFeedbackBadge(): number {
  const auth = useAuth();
  const isAdmin = !!auth.profile?.is_admin;
  const [n, setN] = useState(0);
  const load = useCallback(() => {
    if (!auth.userId) { setN(0); return; }
    const me = auth.userId;
    (isAdmin ? getContactMessages() : getMyFeedback(me))
      .then((list) => setN(feedbackBadge(list, me, isAdmin)))
      .catch(() => setN(0));
  }, [auth.userId, isAdmin]);
  useEffect(() => {
    load();
    window.addEventListener(FEEDBACK_EVENT, load);
    return () => window.removeEventListener(FEEDBACK_EVENT, load);
  }, [load]);
  return n;
}

export function FeedbackNavLink({ active, onGo }: { active: boolean; onGo?: () => void }) {
  const n = useFeedbackBadge();
  return (
    <Link className="side-item" href="/feedback" aria-current={active ? "page" : undefined} onClick={onGo}>
      <span aria-hidden="true" className="ico">✎</span><span style={{ flex: 1 }}>意見回饋</span>
      {n > 0 && <span className="badge" aria-label={`${n} 則新的回覆或回饋`}>{n}</span>}
    </Link>
  );
}
