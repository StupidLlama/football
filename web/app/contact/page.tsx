"use client";
// 聯絡我們（v2.9 起和「意見回饋」是同一個東西）：回報問題、建議、個資或帳號的要求。
// 訊息存在資料庫，並通知網站管理員的 Discord；回覆會出現在「我的回饋」（/feedback）。
import Link from "next/link";
import { useEffect, useState } from "react";
import { CONTACT_EMAIL } from "@/lib/policies";
import { RequireLogin } from "@/components/guard";
import { FeedbackForm } from "@/components/feedback";
import { Footer } from "@/components/ui";

function Contact() {
  // 從哪一頁過來（同一個網站才記，只留路徑）
  const [from, setFrom] = useState("");
  useEffect(() => {
    setFrom(document.referrer.startsWith(window.location.origin) ? new URL(document.referrer).pathname.slice(0, 200) : "/contact");
  }, []);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 48px" }}>
      <Link className="btn btn-line btn-sm" href="/teams">返回</Link>
      <h1 style={{ margin: "16px 0 4px", fontSize: 30 }}>聯絡我們</h1>
      <p className="muted" style={{ margin: "0 0 20px" }}>
        網站壞掉、有建議，或想查詢、刪除你的個資，都可以從這裡告訴網站管理員。回覆會出現在 <Link href="/feedback">我的回饋</Link>。
      </p>
      <div className="panel pad">{from && <FeedbackForm page={from} />}</div>
      {CONTACT_EMAIL && <p className="faint" style={{ marginTop: 16 }}>也可以寄信到 <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>。</p>}
      <Footer />
    </div>
  );
}

export default function ContactPage() {
  return <RequireLogin><Contact /></RequireLogin>;
}
