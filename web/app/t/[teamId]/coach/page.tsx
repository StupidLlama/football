"use client";
// 管理專區：能力表進度、球員名單（新增、改姓名／背號／隊長）、成員（認領確認、解除封鎖、移出）、
// Team ID 與管理員碼、球隊設定。還不是球隊管理員的人進來只看到「輸入管理員碼」（v2.6.1）。
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  actions, addPlayer, editPlayer, getChatDiscord, getCoachCodes, remindMissingRatings, setChatDiscord, updateTeam,
  type CoachCode, type Membership,
} from "@/lib/api";
import { DISCORD_HOOK_URL_RE } from "@/lib/chat";
import { BADGE_LABEL, rosterProblem, sortRoster, type Badge } from "@/lib/roster";
import { useAuth } from "@/lib/auth";
import { message, type RpcResult } from "@/lib/status";
import { useTeamView } from "@/lib/team";
import { ConfirmButton } from "@/components/confirm-button";
import { CaptainBadge, dateLabel, ErrorBox, RoleBadge, Soon, useToast } from "@/components/ui";

type Tab = "progress" | "roster" | "members" | "codes" | "team";
const TABS: [Tab, string][] = [
  ["progress", "能力表進度"], ["roster", "球員名單"], ["members", "成員"], ["codes", "Team ID 與管理員碼"], ["team", "球隊設定"],
];

export default function CoachPage() {
  const v = useTeamView();
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("progress");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some(([k]) => k === t)) setTab(t as Tab);
  }, []);
  const isAdmin = !!auth.profile?.is_admin;
  if (!v.isCoach && !isAdmin) return <Redeem />;

  return (
    <>
      <h1 className="hide-sm" style={{ margin: "0 0 12px", fontSize: 30 }}>管理專區</h1>
      <div className="tabs" role="tablist" aria-label="管理專區">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" className="tabbtn" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}{k === "members" && v.claims.length > 0 && <span className="badge">{v.claims.length}</span>}
          </button>
        ))}
        <span className="tabbtn" aria-disabled="true" style={{ cursor: "default" }}>排裁判 <Soon /></span>
      </div>
      {tab === "progress" && <Progress />}
      {tab === "roster" && <Roster />}
      {tab === "members" && <Members isAdmin={isAdmin} />}
      {tab === "codes" && <Codes />}
      {tab === "team" && <TeamSettings />}
      {v.isCoach && (
        <p className="faint" style={{ margin: "32px 0 0", fontSize: 13 }}>
          你是這一隊的球隊管理員。要讓其他人也變成球隊管理員：到「Team ID 與管理員碼」產生管理員碼私訊給他，他在這一頁輸入就可以。
        </p>
      )}
    </>
  );
}

// 還不是球隊管理員：輸入管理員碼升級。輸錯 5 次會被封鎖（資料庫 redeem_coach_code 處理）。
function Redeem() {
  const v = useTeamView();
  const say = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const banned = v.data.guards.some((g) => g.user_id === v.me.user_id && g.banned_at);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setError("");
    const r = await actions.redeem(v.data.team.id, code.trim());
    setBusy(false);
    if (r.status === "ok" || r.status === "already_coach") { setCode(""); await v.reload(); say("你現在是球隊管理員了"); }
    else setError(message(r));
  }

  return (
    <>
      <h1 className="hide-sm" style={{ margin: "0 0 12px", fontSize: 30 }}>管理專區</h1>
      <form onSubmit={submit} className="panel pad stack" style={{ gap: 12, maxWidth: 560 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>成為球隊管理員</p>
        <p className="faint" style={{ margin: 0, fontSize: 14 }}>
          球隊管理員可以確認認領、新增和編輯球員、建立比賽、發公告。跟現在的球隊管理員要一組「管理員碼」，貼在下面就能升級；
          隊長、副隊長的標記不會受影響。
        </p>
        {banned
          ? <ErrorBox text="管理員碼輸錯太多次，已被封鎖；請找這一隊的球隊管理員到「成員」解除" />
          : (
            <>
              {error && <ErrorBox text={error} />}
              <label className="label">管理員碼
                <input className="field num" value={code} onChange={(e) => setCode(e.target.value)} maxLength={40}
                  autoComplete="off" autoCapitalize="characters" placeholder="XXXXX-XXXXX" style={{ letterSpacing: "0.06em" }} />
              </label>
              <button type="submit" className="btn btn-main" disabled={busy || !code.trim()} style={{ alignSelf: "flex-start" }}>
                {busy ? "確認中…" : "升級成球隊管理員"}
              </button>
            </>
          )}
      </form>
    </>
  );
}

// 球員名單：新增球員、改姓名／背號／隊長。同隊背號、隊長、副隊長不能重複（瀏覽器先擋，資料庫再擋一次）。
function Roster() {
  const v = useTeamView();
  const say = useToast();
  const [editing, setEditing] = useState<string | null>(null);   // 正在編輯的球員 id；"new" = 新增
  const rows = sortRoster(v.players);
  const accountName = (id: string | null) => (id ? v.nameOf(id) : null);

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>球員名單（{rows.length}）</h2>
        {editing !== "new" && <button type="button" className="btn btn-main btn-sm" onClick={() => setEditing("new")}>＋ 新增球員</button>}
      </div>
      <p className="faint" style={{ margin: "0 0 12px", fontSize: 14 }}>
        新增的球員還沒有帳號；他加入球隊後在「找到自己」認領這個名字，你確認後就連起來了。暱稱、位置、慣用腳由球員自己填。
      </p>
      {editing === "new" && (
        <PlayerForm rows={rows} onCancel={() => setEditing(null)}
          onSave={async (input) => {
            const r = await addPlayer(v.data.team.id, input.name.trim(), input.jersey, input.badge);
            if (r.status !== "ok") return message(r);
            await v.reload(); setEditing(null); say(`已新增「${input.name.trim()}」`); return null;
          }} />
      )}
      <div className="stack" style={{ gap: 8 }}>
        {rows.map((p) => editing === p.id ? (
          <PlayerForm key={p.id} rows={rows} self={p} onCancel={() => setEditing(null)}
            onSave={async (input) => {
              const r = await editPlayer(p.id, input.name.trim(), input.jersey, input.badge);
              if (r.status !== "ok") return message(r);
              await v.reload(); setEditing(null); say("已儲存"); return null;
            }} />
        ) : (
          <article key={p.id} className="panel" style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "center" }}>
            <span className="num faint" style={{ width: 44 }}>{p.jersey_number ? `#${p.jersey_number}` : "#—"}</span>
            <span style={{ flex: "1 1 160px", minWidth: 0 }}>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <b>{p.name}</b><CaptainBadge badge={p.badge} />
                {p.accountId && v.data.members.some((m) => m.user_id === p.accountId && m.role === "coach") && <RoleBadge coach />}
              </span>
              <span className="faint" style={{ display: "block", fontSize: 13 }}>
                {p.accountId ? `帳號：${accountName(p.accountId)}` : "還沒有帳號"}
              </span>
            </span>
            <button type="button" className="btn btn-line btn-sm" disabled={editing !== null} onClick={() => setEditing(p.id)}>編輯</button>
          </article>
        ))}
      </div>
    </>
  );
}

function PlayerForm({ rows, self, onSave, onCancel }: {
  rows: { id: string; name: string; jersey_number: string | null; badge: Badge }[];
  self?: { id: string; name: string; jersey_number: string | null; badge: Badge };
  onSave: (input: { name: string; jersey: string; badge: Badge }) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(self?.name ?? "");
  const [jersey, setJersey] = useState(self?.jersey_number ?? "");
  const [badge, setBadge] = useState<Badge>(self?.badge ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = { name, jersey, badge };
    const problem = rosterProblem(rows, input, self);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    const err = await onSave(input);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} className="panel pad stack" style={{ gap: 12, marginBottom: 8, borderColor: "#3B82F6" }}>
      <p style={{ margin: 0, fontWeight: 700 }}>{self ? `編輯「${self.name}」` : "新增球員"}</p>
      {error && <ErrorBox text={error} />}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label className="label" style={{ flex: "2 1 180px" }}>姓名
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus />
        </label>
        <label className="label" style={{ flex: "1 1 90px" }}>背號
          <input className="field num" value={jersey} onChange={(e) => setJersey(e.target.value)} inputMode="numeric" maxLength={3} placeholder="可空白" />
        </label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>隊長標記</legend>
        <div className="chips" role="radiogroup">
          {([null, "C", "VC"] as Badge[]).map((b) => (
            <button key={b ?? "none"} type="button" role="radio" aria-checked={badge === b}
              className={badge === b ? "btn btn-main btn-sm" : "btn btn-line btn-sm"} onClick={() => setBadge(b)}>
              {b ? BADGE_LABEL[b] : "無"}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>隊長、副隊長各只能有一位；要換人，先把原本那位改成「無」。隊長也可以同時是球隊管理員。</p>
      <div className="chips">
        <button type="submit" className="btn btn-main btn-sm" disabled={busy}>{busy ? "儲存中…" : self ? "儲存" : "新增"}</button>
        <button type="button" className="btn btn-line btn-sm" disabled={busy} onClick={onCancel}>取消</button>
      </div>
    </form>
  );
}

function Progress() {
  const v = useTeamView();
  const say = useToast();
  const [error, setError] = useState("");
  const [reminding, setReminding] = useState(false);
  const done = v.players.filter((p) => p.scores);
  const todo = v.players.filter((p) => !p.scores);
  const unlinked = v.data.members.filter((m) => !m.player_id);
  const cols = "minmax(0, 1fr) 84px 112px 84px";

  async function removeName(id: string, name: string) {
    setError("");
    const r = await actions.deleteUnlinkedPlayer(id);
    if (r.status === "ok") { await v.reload(); say(`已從名單刪除「${name}」`); } else setError(message(r));
  }

  async function remind() {
    setReminding(true); setError("");
    const r = await remindMissingRatings(v.data.team.id, todo.map((p) => p.nickname.trim() || p.name));
    setReminding(false);
    if (r.status === "ok") say("已在聊天室發一則置頂提醒"); else setError(message(r));
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="faint" style={{ fontSize: 14 }}>已填能力表</div><div className="v num">{done.length} / {v.players.length}</div><div className="faint" style={{ fontSize: 13 }}>名單上的人</div></div>
        <div className="kpi"><div className="faint" style={{ fontSize: 14 }}>還沒填</div><div className="v num">{todo.length}</div><div className="faint" style={{ fontSize: 13 }}>其中 {todo.filter((p) => !p.accountId).length} 人還沒有帳號</div></div>
        <div className="kpi"><div className="faint" style={{ fontSize: 14 }}>帳號還沒連到名單</div><div className="v num">{unlinked.length}</div><div className="faint" style={{ fontSize: 13 }}>{v.claims.length} 個認領等你確認</div></div>
      </div>
      <p className="faint" style={{ margin: "12px 0", fontSize: 14 }}>還沒有帳號的人：把 Team ID 傳給他，加入後認領自己就能填。沒有帳號的名字可以從名單刪除（例如離隊、刪除帳號的人），他的能力自評會一起刪掉。</p>
      {todo.length > 0 && (
        <button type="button" className="btn btn-line btn-sm" disabled={reminding} onClick={remind} style={{ marginBottom: 12 }}>
          {reminding ? "發送中…" : "在聊天室提醒還沒填的人"}
        </button>
      )}
      {error && <ErrorBox text={error} />}
      <div className="tbl" role="table" aria-label="能力表進度">
        <div className="tr head" role="row" style={{ gridTemplateColumns: cols }}>
          <span role="columnheader">球員</span><span role="columnheader">帳號</span><span role="columnheader">能力表</span><span role="columnheader"><span className="sr-only">動作</span></span>
        </div>
        {[...todo, ...done].map((p) => (
          <div key={p.id} className="tr" role="row" style={{ gridTemplateColumns: cols }}>
            <span role="cell">{p.name}{p.jersey_number && <span className="faint num" style={{ marginLeft: 6, fontSize: 13 }}>#{p.jersey_number}</span>}</span>
            <span role="cell" className={p.accountId ? "" : "faint"} style={{ fontSize: 14 }}>{p.accountId ? "已連結" : "還沒有"}</span>
            <span role="cell" style={{ fontSize: 14, color: p.scores ? "#2DD4BF" : "#F5A524" }}>{p.scores ? `✓ ${dateLabel(p.submittedAt)}` : "還沒填"}</span>
            <span role="cell" style={{ textAlign: "right" }}>
              {!p.accountId && <ConfirmButton label="刪除" confirm="確定刪除？" onConfirm={() => removeName(p.id, p.name)} />}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Members({ isAdmin }: { isAdmin: boolean }) {
  const v = useTeamView();
  const say = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const team = v.data.team.id;
  const banned = v.data.guards.filter((g) => g.banned_at);

  const run = async (p: Promise<RpcResult>, ok: string) => {
    setBusy(true); setError("");
    const r = await p;
    if (r.status === "ok") { await v.reload(); say(ok); } else setError(message(r));
    setBusy(false);
  };
  const claimText = (m: Membership) => m.claim_player_id
    ? `認領名單上的「${v.players.find((p) => p.id === m.claim_player_id)?.name ?? "?"}」`
    : `申請新增名字「${m.claim_new_name}」`;
  const accountName = (m: Membership) => v.data.profiles.find((p) => p.user_id === m.user_id)?.display_name?.trim() || "（還沒取名字）";

  return (
    <>
      {error && <ErrorBox text={error} />}
      <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>等你確認的認領（{v.claims.length}）</h2>
      {v.claims.length === 0 && <p className="muted" style={{ margin: "0 0 16px" }}>都處理完了。</p>}
      <div className="stack" style={{ gap: 8, marginBottom: 24 }}>
        {v.claims.map((m) => (
          <article key={m.user_id} className="panel" style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center" }}>
            <span style={{ flex: "1 1 220px", minWidth: 0 }}><b>{accountName(m)}</b><span className="faint" style={{ display: "block", fontSize: 14 }}>{claimText(m)}</span></span>
            <button type="button" className="btn btn-main btn-sm" disabled={busy} onClick={() => run(actions.decideClaim(team, m.user_id, true), "已確認")}>確認</button>
            <button type="button" className="btn btn-line btn-sm" disabled={busy} onClick={() => run(actions.decideClaim(team, m.user_id, false), "已拒絕")}>拒絕</button>
          </article>
        ))}
      </div>

      <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>管理員碼封鎖中</h2>
      {banned.length === 0 && <p className="muted" style={{ margin: "0 0 16px" }}>沒有人被封鎖。</p>}
      {banned.map((g) => (
        <article key={g.user_id} className="panel" style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", marginBottom: 24 }}>
          <span style={{ flex: "1 1 220px" }}><b>{v.nameOf(g.user_id)}</b><span className="faint" style={{ display: "block", fontSize: 14 }}>管理員碼輸錯 {g.failures} 次，{dateLabel(g.banned_at)} 封鎖</span></span>
          <button type="button" className="btn btn-line btn-sm" disabled={busy} onClick={() => run(actions.unban(team, g.user_id), "已解除封鎖")}>解除封鎖</button>
        </article>
      ))}

      <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>成員（{v.data.members.length}）</h2>
      <div className="tbl" role="table" aria-label="成員">
        {v.data.members.slice().sort((a, b) => (a.role === b.role ? 0 : a.role === "coach" ? -1 : 1)).map((m) => {
          const self = m.user_id === v.me.user_id;
          const canRemove = !self && (m.role === "player" || isAdmin);
          return (
            <div key={m.user_id} className="tr" role="row" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
              <span role="cell">{v.nameOf(m.user_id)}{self && <span className="faint" style={{ marginLeft: 6, fontSize: 13 }}>（你）</span>}
                <span className="faint" style={{ display: "block", fontSize: 13 }}>{m.player_id ? "已連到名單" : m.claim_player_id || m.claim_new_name ? "認領中" : "還沒認領"}・{dateLabel(m.joined_at)} 加入</span></span>
              <span role="cell"><RoleBadge coach={m.role === "coach"} /></span>
              <span role="cell" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {isAdmin && m.role === "coach" && !self && (
                  <ConfirmButton label="取消管理員" confirm="確定取消？" className="btn btn-line btn-sm" disabled={busy}
                    onConfirm={() => run(actions.demoteCoach(team, m.user_id), "已取消管理員身分")} />
                )}
                {canRemove && <ConfirmButton label="移出" confirm="確定移出？" disabled={busy} onConfirm={() => run(actions.removeMember(team, m.user_id), "已移出")} />}
              </span>
            </div>
          );
        })}
      </div>
      <p className="faint" style={{ margin: "8px 0 0", fontSize: 13 }}>球隊管理員只能移出球員；要移出球隊管理員或取消管理員身分，請找網站管理員。</p>
    </>
  );
}

function Codes() {
  const v = useTeamView();
  const say = useToast();
  const team = v.data.team.id;
  const [codes, setCodes] = useState<CoachCode[] | null>(null);
  const [days, setDays] = useState(7);
  const [newCode, setNewCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => getCoachCodes(team).then(setCodes).catch((e) => setError(String(e.message ?? e))), [team]);
  useEffect(() => { load(); }, [load]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); say("已複製"); } catch { say("沒辦法自動複製，請手動選取"); }
  };
  const create = async () => {
    setBusy(true); setError("");
    const r = await actions.createCoachCode(team, days);
    if (r.status === "ok") { setNewCode(String(r.code)); await load(); } else setError(message(r));
    setBusy(false);
  };
  const reset = async () => {
    setBusy(true); setError("");
    const r = await actions.resetTeamCode(team);
    if (r.status === "ok") { await v.reload(); say("Team ID 已重設，舊的已經失效"); } else setError(message(r));
    setBusy(false);
  };
  const revoke = async (id: string) => {
    const r = await actions.revokeCoachCode(id);
    if (r.status === "ok") { say("已作廢"); await load(); } else setError(message(r));
  };
  const now = Date.now();

  return (
    <>
      {error && <ErrorBox text={error} />}
      <div className="panel pad">
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Team ID（傳給隊友，他們輸入就能加入）</p>
        <p className="num" style={{ margin: "4px 0 12px", fontSize: 34, letterSpacing: "0.08em", color: "#F5A524" }}>{v.data.team.code}</p>
        <div className="chips">
          <button type="button" className="btn btn-line" onClick={() => copy(v.data.team.code)}>複製 Team ID</button>
          <ConfirmButton label="重設 Team ID" confirm="確定重設？舊的會失效" className="btn btn-danger" disabled={busy} onConfirm={reset} />
        </div>
        <p className="faint" style={{ margin: "8px 0 0", fontSize: 13 }}>不小心外流時用。舊的會立刻失效，已經加入的人不受影響。</p>
      </div>

      <div className="panel pad" style={{ marginTop: 16 }}>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 18 }}>管理員碼</p>
        <div className="chips">
          <label className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>有效
            <select className="field" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: "auto", minHeight: 40 }}>
              {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} 天</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-main" onClick={create} disabled={busy}>產生管理員碼</button>
        </div>
        <p className="faint" style={{ margin: "8px 0 0", fontSize: 13 }}>期限內可以給好幾位球隊管理員用。輸錯 5 次的人會被封鎖，要在「成員」解除。</p>
        {newCode && (
          <div role="status" style={{ margin: "12px 0 0", padding: "12px 16px", borderRadius: 10, border: "1px dashed #F5A524" }}>
            新的管理員碼：<b className="num accent" style={{ fontSize: 22, letterSpacing: "0.06em" }}>{newCode}</b>
            <button type="button" className="btn btn-text" onClick={() => copy(newCode)}>複製</button>
            <span className="faint" style={{ display: "block", fontSize: 13 }}>只會顯示這一次，請私訊給要當球隊管理員的人。</span>
          </div>
        )}
        {codes === null && <p className="faint">讀取中…</p>}
        {codes?.map((c) => {
          const active = !c.revoked_at && Date.parse(c.expires_at) > now;
          const state = c.revoked_at ? `已作廢（${dateLabel(c.revoked_at)}）` : active ? `有效到 ${dateLabel(c.expires_at)}` : `已過期（${dateLabel(c.expires_at)}）`;
          return (
            <div key={c.id} className="row" style={{ flexWrap: "wrap" }}>
              <span className="num" style={{ width: 64 }}>…{c.hint}</span>
              <span style={{ flex: "1 1 160px" }} className={active ? "muted" : "faint"}>{state}，用過 {c.uses} 次</span>
              {active && <ConfirmButton label="作廢" confirm="確定作廢？" onConfirm={() => revoke(c.id)} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

function TeamSettings() {
  const v = useTeamView();
  const say = useToast();
  const t = v.data.team;
  const [name, setName] = useState(t.name);
  const [season, setSeason] = useState(t.season ?? "");
  const [league, setLeague] = useState(t.league_name ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!v.isCoach) return <p className="panel muted pad">只有這一隊的球隊管理員可以改球隊設定。</p>;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("隊伍名稱不能空白"); return; }
    setBusy(true); setError("");
    try {
      await updateTeam(t.id, { name: name.trim(), season: season.trim() || null, league_name: league.trim() || null });
      await v.reload();
      say("已儲存");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <form onSubmit={save} className="panel pad" style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <ErrorBox text={error} />}
        <label className="label">隊伍名稱<input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
        <label className="label">賽季（例如 2026-27）<input className="field" value={season} onChange={(e) => setSeason(e.target.value)} maxLength={20} /></label>
        <label className="label">聯賽賽程表上的隊名（例如「資訊」，用來找出我們隊的比賽和裁判任務）
          <input className="field" value={league} onChange={(e) => setLeague(e.target.value)} maxLength={20} />
        </label>
        <button type="submit" className="btn btn-main" disabled={busy} style={{ alignSelf: "flex-start" }}>{busy ? "儲存中…" : "儲存"}</button>
      </form>
      <ChatDiscordSettings />
    </div>
  );
}

function ChatDiscordSettings() {
  const v = useTeamView();
  const say = useToast();
  const team = v.data.team.id;
  const [state, setState] = useState<{ configured: boolean; updatedAt: string | null } | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getChatDiscord(team).then((r) => {
      if (r.status === "ok") setState({ configured: !!r.configured, updatedAt: r.updated_at ?? null });
      else setError(message(r));
    });
  }, [team]);
  useEffect(() => { load(); }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!DISCORD_HOOK_URL_RE.test(trimmed)) { setError("這不是 Discord Webhook 網址"); return; }
    setBusy(true); setError("");
    const r = await setChatDiscord(team, trimmed);
    setBusy(false);
    if (r.status === "ok") { setUrl(""); load(); say("已設定，之後有新的主貼文會推到 Discord"); } else setError(message(r));
  }

  async function clear() {
    setBusy(true); setError("");
    const r = await setChatDiscord(team, "");
    setBusy(false);
    if (r.status === "ok") { load(); say("已關閉 Discord 通知"); } else setError(message(r));
  }

  return (
    <div className="panel pad stack" style={{ gap: 12, maxWidth: 560 }}>
      <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>聊天室的 Discord 通知</p>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        設定後，聊天室有新的主貼文（不包含回覆）會推到這個 Discord 頻道；沒設定的話只有網站裡的紅點提醒。網址設定後不會再顯示，只能重新貼上覆蓋。
      </p>
      {error && <ErrorBox text={error} />}
      {state === null && <p className="faint">讀取中…</p>}
      {state && (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          目前：{state.configured ? `已設定${state.updatedAt ? `（${dateLabel(state.updatedAt)} 更新）` : ""}` : "尚未設定"}
        </p>
      )}
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label className="label">Webhook 網址
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." />
        </label>
        <div className="chips">
          <button type="submit" className="btn btn-main btn-sm" disabled={busy || !url.trim()}>{busy ? "儲存中…" : "設定"}</button>
          {state?.configured && <ConfirmButton label="關閉通知" confirm="確定關閉 Discord 通知？" className="btn btn-line btn-sm" disabled={busy} onConfirm={clear} />}
        </div>
      </form>
    </div>
  );
}
