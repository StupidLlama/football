"use client";
// 聯絡我們：回報問題、建議、個資或帳號的要求。訊息存在資料庫，並通知網站管理員的 Discord。
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CONTACT_CATEGORIES, sendContact } from "@/lib/api";
import { message } from "@/lib/status";
import { CONTACT_EMAIL } from "@/lib/policies";
import { RequireLogin } from "@/components/guard";
import { ErrorBox, Footer } from "@/components/ui";

function Contact() {
  const [category, setCategory] = useState("bug");
  const [body, setBody] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("type") && CONTACT_CATEGORIES.some(([k]) => k === p.get("type"))) setCategory(p.get("type")!);
    setFrom(document.referrer.startsWith(window.location.origin) ? new URL(document.referrer).pathname : "");
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setError("");
    const r = await sendContact(category, body.trim(), from);
    setBusy(false);
    if (r.status === "ok") { setSent(true); setBody(""); } else setError(message(r));
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 48px" }}>
      <Link className="btn btn-line btn-sm" href="/teams">返回</Link>
      <h1 style={{ margin: "16px 0 4px", fontSize: 30 }}>聯絡我們</h1>
      <p className="muted" style={{ margin: "0 0 20px" }}>網站壞掉、有建議，或想查詢、刪除你的個資，都可以從這裡告訴網站管理員。</p>
      {sent && <p className="status ok" role="status">已送出，網站管理員會儘快回覆你的 Email。</p>}
      {error && <ErrorBox text={error} />}
      <form onSubmit={submit} className="panel pad stack" style={{ gap: 16 }}>
        <div role="radiogroup" aria-label="類型" className="chips">
          {CONTACT_CATEGORIES.map(([k, label]) => (
            <button key={k} type="button" role="radio" className="chip" aria-checked={category === k} onClick={() => setCategory(k)}>{label}</button>
          ))}
        </div>
        <label className="label">內容（最多 2000 字）
          <textarea className="field" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required rows={6}
            placeholder={category === "bug" ? "在哪一頁、做了什麼、看到什麼錯誤？" : category === "privacy" ? "想查詢、更正或刪除哪些資料？" : ""} />
        </label>
        <p className="faint" style={{ margin: 0, fontSize: 14 }}>會一起送出你的 Email（方便回覆你）和你從哪一頁過來。請不要在這裡寫密碼。</p>
        <button type="submit" className="btn btn-main" disabled={busy || !body.trim()}>{busy ? "送出中…" : "送出"}</button>
      </form>
      {CONTACT_EMAIL && <p className="faint" style={{ marginTop: 16 }}>也可以寄信到 <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>。</p>}
      <Footer />
    </div>
  );
}

export default function ContactPage() {
  return <RequireLogin><Contact /></RequireLogin>;
}
