"use client";
// 第一次登入（或政策改版後）：看過隱私權政策和服務條款，兩個都勾選才能繼續。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { actions } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { homeFor, safeNext } from "@/lib/nav";
import { POLICY_VERSION } from "@/lib/policies";
import { message } from "@/lib/status";
import { RequireLogin } from "@/components/guard";
import { ErrorBox, Logo } from "@/components/ui";

function Consent() {
  const auth = useAuth();
  const router = useRouter();
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [next, setNext] = useState<string | null>(null);
  const updated = !!auth.profile?.policy_version;   // 之前同意過舊版 = 這次是改版

  useEffect(() => { setNext(safeNext(new URLSearchParams(window.location.search).get("next"))); }, []);

  async function accept() {
    setBusy(true); setError("");
    const r = await actions.acceptPolicies(POLICY_VERSION);
    if (r.status !== "ok") { setError(message(r)); setBusy(false); return; }
    await auth.reload();
    router.replace(next && next !== "/consent" ? next : homeFor(auth.teams ?? []));
  }

  async function decline() {
    await auth.signOut();
    router.replace("/");
  }

  const box = { width: 22, height: 22, accentColor: "#2DD4BF", flex: "none", marginTop: 3 } as const;
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px 48px" }}>
      <p style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, margin: "0 0 24px" }}><Logo size={28} />Football Analysis Potato</p>
      <h1 style={{ margin: "0 0 8px", fontSize: 28 }}>{updated ? "政策更新了" : "開始之前"}</h1>
      <p className="muted" style={{ margin: "0 0 20px" }}>
        {updated ? `隱私權政策和服務條款更新了（版本 ${POLICY_VERSION}），請看過後再同意一次。`
          : "我們會保存你的帳號、球隊和能力自評，讓隊友看得到。請先看過這兩份文件："}
      </p>
      <div className="panel pad stack" style={{ gap: 16 }}>
        <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} style={box} />
          <span>我已閱讀並同意 <Link href="/privacy" target="_blank">隱私權政策</Link>
            <span className="faint" style={{ display: "block", fontSize: 14 }}>蒐集哪些資料、存在哪裡（日本東京）、誰看得到、怎麼下載或刪除</span></span>
        </label>
        <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} style={box} />
          <span>我已閱讀並同意 <Link href="/terms" target="_blank">服務條款</Link>
            <span className="faint" style={{ display: "block", fontSize: 14 }}>未滿 18 歲的話，表示已經取得法定代理人（例如父母）同意</span></span>
        </label>
      </div>
      {error && <div style={{ marginTop: 12 }}><ErrorBox text={error} /></div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <button type="button" className="btn btn-main btn-lg" style={{ flex: "1 1 200px" }} disabled={!privacy || !terms || busy} onClick={accept}>
          {busy ? "處理中…" : "同意並繼續"}
        </button>
        <button type="button" className="btn btn-line btn-lg" onClick={decline}>不同意，登出</button>
      </div>
      <p className="faint" style={{ marginTop: 16, fontSize: 14 }}>之後可以在「設定 → 隱私與帳號」查看你同意的版本、下載或刪除你的資料。</p>
    </div>
  );
}

export default function ConsentPage() {
  return <RequireLogin skipConsent><Consent /></RequireLogin>;
}
