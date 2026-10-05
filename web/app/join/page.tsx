"use client";
// 加入球隊：輸入 Team ID。加入後到「找到自己」（認領名單上的自己）。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { actions } from "@/lib/api";
import { displayName, useAuth } from "@/lib/auth";
import { message, SUCCESS } from "@/lib/status";
import { RequireLogin } from "@/components/guard";
import { JoinSteps } from "@/components/steps";
import { ErrorBox } from "@/components/ui";

function Join() {
  const auth = useAuth();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const first = (auth.teams?.length ?? 0) === 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setError("");
    const r = await actions.join(code);
    if (SUCCESS.has(r.status) && typeof r.team_id === "string") {
      await auth.reload();
      router.push(r.status === "joined" ? `/t/${r.team_id}/claim` : `/t/${r.team_id}`);
      return;
    }
    setError(message(r, "找不到這個 Team ID"));
    setBusy(false);
  }

  return (
    <div className="narrow">
      <JoinSteps step={1} />
      <h1 style={{ margin: "0 0 4px", fontSize: 28 }}>{first ? `歡迎，${displayName(auth)}` : "加入另一支球隊"}</h1>
      <p className="muted" style={{ margin: "0 0 24px" }}>{first ? "你還沒加入任何球隊。" : ""}輸入隊長或球隊管理員給你的 Team ID：</p>
      {error && <ErrorBox text={error} />}
      <form onSubmit={submit}>
        <label className="label">Team ID
          <input className="field num" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7Q4-MZP9" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} required
            style={{ minHeight: 56, fontSize: 26, letterSpacing: "0.12em" }} />
        </label>
        <button type="submit" className="btn btn-main btn-wide btn-lg" disabled={busy} style={{ marginTop: 16 }}>
          {busy ? "加入中…" : "加入球隊"}
        </button>
      </form>
      <p className="faint" style={{ margin: "24px 0 0" }}>沒有 Team ID？問你的隊長或球隊管理員。大小寫、空白和「-」都不影響。</p>
      <p style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        {!first && <Link href="/teams">回到我的球隊</Link>}
        <Link href="/settings">設定</Link>
        <button type="button" className="btn btn-text" onClick={auth.signOut}>登出</button>
      </p>
    </div>
  );
}

export default function JoinPage() {
  return <RequireLogin><Join /></RequireLogin>;
}
