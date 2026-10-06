"use client";
// 球隊頁的外框：電腦版左邊側邊欄，手機版上方選單按鈕 + 抽屜。
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import type { TeamView } from "@/lib/teamview";
import { ErrorBox, Footer, Loading, Logo, RoleBadge, Soon } from "./ui";

type NavItem = { href: string; label: string; icon: string; soon?: string; badge?: number; match?: (p: string) => boolean };

export function navItems(teamId: string, v: TeamView, isAdmin: boolean): NavItem[] {
  const base = `/t/${teamId}`;
  const needForm = !!v.myPlayer && !v.myPlayer.scores;
  const items: NavItem[] = [
    { href: base, label: "我的", icon: "◉", match: (p) => p === base },
    { href: `${base}/home`, label: "首頁", icon: "⌂" },
    { href: `${base}/players`, label: "球員", icon: "◎", match: (p) => p.startsWith(`${base}/players`) },
    { href: `${base}/form`, label: "能力表", icon: "✎", badge: needForm ? 1 : 0 },
    { href: `${base}/lineup`, label: "組隊", icon: "▦" },
    { href: `${base}/matches`, label: "比賽", icon: "◷", soon: "v2.5" },
    { href: `${base}/practice`, label: "練習", icon: "◆", soon: "之後" },
  ];
  if (v.isCoach || isAdmin) items.push({ href: `${base}/coach`, label: "管理專區", icon: "✦", badge: v.claims.length });
  return items;
}

function NavList({ items, path, onGo }: { items: NavItem[]; path: string; onGo?: () => void }) {
  return (
    <nav aria-label="球隊功能" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {items.map((n) => {
        const on = n.match ? n.match(path) : path === n.href || path.startsWith(`${n.href}/`);
        return (
          <Link key={n.href} href={n.href} className="side-item" aria-current={on ? "page" : undefined} onClick={onGo}>
            <span aria-hidden="true" className="ico">{n.icon}</span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.soon && <Soon text={n.soon} />}
            {!!n.badge && <span className="badge" aria-label={`${n.badge} 件待處理`}>{n.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function TeamCard({ v, canSwitch }: { v: TeamView; canSwitch: boolean }) {
  return (
    <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 17 }}>{v.data.team.name}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
        {v.data.team.season && <span className="faint" style={{ fontSize: 13 }}>{v.data.team.season}</span>}
        <RoleBadge coach={v.isCoach} />
      </div>
      {canSwitch && <Link className="btn btn-line btn-sm btn-wide" href="/teams" style={{ marginTop: 8 }}>切換球隊</Link>}
    </div>
  );
}

function Bottom({ teamId, path, onGo }: { teamId: string; path: string; onGo?: () => void }) {
  const { signOut } = useAuth();
  const router = useRouter();
  return (
    <div style={{ marginTop: 24, paddingTop: 12, borderTop: "1px solid #22304A", display: "flex", flexDirection: "column", gap: 2 }}>
      <Link className="side-item" href={`/settings?team=${teamId}`} aria-current={path === "/settings" ? "page" : undefined} onClick={onGo}>
        <span aria-hidden="true" className="ico">✱</span><span style={{ flex: 1 }}>設定</span>
      </Link>
      <button type="button" className="side-item" onClick={async () => { await signOut(); router.replace("/"); }}>
        <span aria-hidden="true" className="ico">←</span><span style={{ flex: 1 }}>登出</span>
      </button>
    </div>
  );
}

const TITLES: [RegExp, string][] = [
  [/\/players\/[^/]+$/, "球員報告"], [/\/players$/, "球員"], [/\/home$/, "首頁"], [/\/form$/, "能力表"],
  [/\/claim$/, "找到自己"], [/\/coach$/, "管理專區"], [/\/lineup$/, "組隊"], [/\/matches$/, "比賽"], [/\/practice$/, "練習"],
];

export function TeamShell({ teamId, children }: { teamId: string; children: ReactNode }) {
  const { view, loading, error, missing, reload } = useTeam();
  const auth = useAuth();
  const path = usePathname() ?? "";
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);
  // 被移出球隊、或網址打錯：回到選球隊
  useEffect(() => {
    if (missing) { auth.reload(); router.replace("/teams"); }
  }, [missing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="narrow"><ErrorBox text={error} onRetry={reload} /></div>;
  if (loading || !view) return <div className="narrow"><Loading /></div>;

  const items = navItems(teamId, view, !!auth.profile?.is_admin);
  const canSwitch = (auth.teams?.length ?? 0) > 1;
  const title = TITLES.find(([re]) => re.test(path))?.[1] ?? (path.endsWith(teamId) ? "我的" : view.data.team.name);

  return (
    <>
      <div style={{ height: 4, background: view.isCoach ? "#F5A524" : "#3B82F6" }} />
      <div className="mobilebar">
        <button type="button" className="btn btn-line" onClick={() => setDrawer(true)} aria-label="打開選單" aria-expanded={drawer} style={{ padding: "0 12px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <span style={{ fontWeight: 700, fontSize: 18, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        <RoleBadge coach={view.isCoach} />
      </div>
      <div className="app">
        <aside className="sidebar" aria-label="主選單">
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 16px" }}>
            <Logo size={30} /><span style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>Football Analysis Potato</span>
          </div>
          <TeamCard v={view} canSwitch={canSwitch} />
          <NavList items={items} path={path} />
          <Bottom teamId={teamId} path={path} />
        </aside>
        <main className="main">
          {children}
          <Footer />
        </main>
      </div>
      {drawer && (
        <div className="drawer">
          <div className="drawer-panel" role="dialog" aria-modal="true" aria-label="主選單">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12 }}>
              <span style={{ fontWeight: 700 }}>Football Analysis Potato</span>
              <button type="button" className="btn btn-line" onClick={() => setDrawer(false)} aria-label="關閉選單" style={{ padding: "0 12px" }}>✕</button>
            </div>
            <TeamCard v={view} canSwitch={canSwitch} />
            <NavList items={items} path={path} onGo={() => setDrawer(false)} />
            <Bottom teamId={teamId} path={path} onGo={() => setDrawer(false)} />
          </div>
          <button type="button" className="drawer-shade" onClick={() => setDrawer(false)} aria-label="關閉選單" />
        </div>
      )}
    </>
  );
}
