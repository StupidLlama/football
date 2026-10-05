"use client";
// 好幾支球隊：選要看哪一隊，每一隊旁邊列出給你的提醒。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getTeamNotes, type TeamNote } from "@/lib/api";
import { displayName, useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/nav";
import { RequireLogin } from "@/components/guard";
import { Footer, Logo, RoleBadge } from "@/components/ui";

const NOTE_STYLE: Record<TeamNote["kind"], { icon: string; color: string; kind: string }> = {
  form: { icon: "✎", color: "#2DD4BF", kind: "能力表" },
  claim: { icon: "?", color: "#60A5FA", kind: "認領" },
  pending: { icon: "…", color: "#8A97AD", kind: "認領" },
  claims: { icon: "!", color: "#F5A524", kind: "教練" },
  match: { icon: "◷", color: "#F5A524", kind: "比賽" },
};

function Picker() {
  const auth = useAuth();
  const router = useRouter();
  const teams = auth.teams ?? [];
  const [notes, setNotes] = useState<Record<string, TeamNote[]> | null>(null);

  useEffect(() => {
    if (teams.length === 0) { router.replace("/join"); return; }
    getTeamNotes(teams, todayISO()).then(setNotes).catch(() => setNotes({}));
  }, [teams, router]);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "16px 20px 48px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0 24px", flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 18 }}><Logo size={28} />Football Analysis Potato</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn btn-line" href="/settings">設定</Link>
          <button type="button" className="btn btn-line" onClick={auth.signOut}>登出</button>
        </div>
      </header>
      <h1 style={{ margin: "0 0 4px", fontSize: 34 }}>嗨 {displayName(auth)}，今天看哪一隊？</h1>
      <p className="muted" style={{ margin: "0 0 24px" }}>你在 {teams.length} 支球隊，每一隊的身分分開算。點提醒可以直接處理。</p>
      <div className="stack" style={{ gap: 16 }}>
        {teams.map(({ team, membership }) => {
          const coach = membership.role === "coach";
          const list = notes?.[team.id] ?? [];
          return (
            <article key={team.id} className="panel" style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 16,
              borderLeft: `4px solid ${coach ? "#F5A524" : "#3B82F6"}` }}>
              <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                <h2 style={{ margin: 0, fontSize: 22 }}>{team.name}</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {team.season && <span className="faint" style={{ fontSize: 14 }}>{team.season}</span>}
                  <RoleBadge coach={coach} />
                </div>
                <Link className="btn btn-line" href={`/t/${team.id}`} style={{ marginTop: 4 }}>進入{team.name}</Link>
              </div>
              <div style={{ flex: "2 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {notes === null && <p className="faint" style={{ margin: 0, padding: "8px 0" }}>讀取提醒中…</p>}
                {notes !== null && list.length === 0 && <p className="faint" style={{ margin: 0, padding: "8px 0" }}>沒有新消息</p>}
                {list.map((n) => {
                  const s = NOTE_STYLE[n.kind];
                  return (
                    <Link key={n.kind + n.text} className="note" href={n.href}>
                      <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 99, display: "inline-flex", alignItems: "center",
                        justifyContent: "center", border: `1px solid ${s.color}`, color: s.color, fontSize: 13, flex: "none" }}>{s.icon}</span>
                      <span style={{ flex: 1 }}>{n.text}</span>
                      <span className="faint" style={{ fontSize: 13 }}>{s.kind}</span>
                    </Link>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
      <p className="faint" style={{ margin: "24px 0 0", fontSize: 14 }}>要加入另一隊？<Link href="/join">輸入 Team ID</Link></p>
      <Footer />
    </div>
  );
}

export default function TeamsPage() {
  return <RequireLogin><Picker /></RequireLogin>;
}
