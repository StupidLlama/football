// 資料存取：所有跟 Supabase 的溝通都在這裡（翻譯層）。
// 讀資料用一般查詢（RLS 決定看得到哪些列）；加入、認領、送出能力表這類「動作」呼叫資料庫函式（rpc）。
// 注意：不用 PostgREST 的 embed（例如 teams(*)），每張表分開查再在這裡合併，比較好懂也好測。
import { supabase } from "./supabase";
import type { RpcResult } from "./status";
import type { Scores } from "./rating";
import type { CareerResult } from "./career";

export type Role = "player" | "coach";
export type Team = { id: string; code: string; name: string; season: string | null; league_name: string | null };
export type Membership = {
  team_id: string; user_id: string; role: Role; player_id: string | null; joined_at: string; career_shared: boolean;
  claim_player_id: string | null; claim_new_name: string | null; claim_at: string | null;
};
export type Player = {
  id: string; team_id: string; name: string; nickname: string; jersey_number: string | null; badge: "C" | "VC" | null;
  good_positions: string[]; bad_positions: string[]; weak_side: "" | "left" | "right"; message: string;
};
export type Rating = { player_id: string; scores: Scores; submitted_at: string; source: string };
export type Profile = { user_id: string; display_name: string; is_admin: boolean; policy_version: string | null; policy_accepted_at: string | null };
export type Guard = { team_id: string; user_id: string; failures: number; banned_at: string | null };
export type CoachCode = {
  id: string; hint: string; created_at: string; expires_at: string; revoked_at: string | null; uses: number;
  last_used_at: string | null;
};
export type Fixture = {
  id: string; day: string; start_time: string | null; end_time: string | null; home: string; away: string;
  round: number | null; match_no: number | null; home_score: number | null; away_score: number | null;
  referee: string; linesmen: string[]; note: string;
};
export type Duty = { id: string; fixture_id: string; role: "主審" | "邊審"; slot: number; player_id: string | null };
export type MyTeam = { team: Team; membership: Membership; banned: boolean };
export type TeamData = {
  team: Team; me: Membership; members: Membership[]; profiles: Profile[]; players: Player[]; ratings: Rating[];
  fixtures: Fixture[]; duties: Duty[]; guards: Guard[];
};

// 只選需要的欄位（coach_codes 的 salt、code_hash 根本沒有開放，select * 會被拒絕）
const COLS = {
  team: "id, code, name, season, league_name",
  membership: "team_id, user_id, role, player_id, joined_at, career_shared, claim_player_id, claim_new_name, claim_at",
  player: "id, team_id, name, nickname, jersey_number, badge, good_positions, bad_positions, weak_side, message",
  rating: "player_id, scores, submitted_at, source",
  profile: "user_id, display_name, is_admin, policy_version, policy_accepted_at",
  guard: "team_id, user_id, failures, banned_at",
  code: "id, hint, created_at, expires_at, revoked_at, uses, last_used_at",
  fixture: "id, day, start_time, end_time, home, away, round, match_no, home_score, away_score, referee, linesmen, note",
  duty: "id, fixture_id, role, slot, player_id",
  contact: "id, user_id, category, body, page, status, created_at",
};

// 欄位清單是變數（COLS），supabase-js 沒辦法從字串推出型別，所以在這裡統一轉成我們自己定義的型別。
function must<T>(r: { data: unknown; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`讀取${what}失敗：${r.error.message}`);
  return (r.data ?? []) as T;
}

// ---------- 自己 ----------
export async function getProfile(userId: string): Promise<Profile> {
  const r = await supabase().from("profiles").select(COLS.profile).eq("user_id", userId).maybeSingle();
  if (r.error) throw new Error(`讀取個人資料失敗：${r.error.message}`);
  return (r.data as Profile | null) ?? { user_id: userId, display_name: "", is_admin: false, policy_version: null, policy_accepted_at: null };
}

export async function setDisplayName(userId: string, name: string): Promise<void> {
  const r = await supabase().from("profiles").update({ display_name: name }).eq("user_id", userId);
  if (r.error) throw new Error(r.error.message);
}

/** 我加入的球隊（照加入時間）。 */
export async function getMyTeams(userId: string): Promise<MyTeam[]> {
  const db = supabase();
  const ms = must<Membership[]>(await db.from("memberships").select(COLS.membership).eq("user_id", userId)
    .order("joined_at", { ascending: true }), "球隊");
  if (!ms.length) return [];
  const ids = ms.map((m) => m.team_id);
  const [teams, guards] = await Promise.all([
    db.from("teams").select(COLS.team).in("id", ids),
    db.from("coach_code_guard").select(COLS.guard).eq("user_id", userId),
  ]);
  const byId = new Map(must<Team[]>(teams, "球隊").map((t) => [t.id, t]));
  const banned = new Set(must<Guard[]>(guards, "封鎖狀態").filter((g) => g.banned_at).map((g) => g.team_id));
  return ms.filter((m) => byId.has(m.team_id))
    .map((m) => ({ team: byId.get(m.team_id)!, membership: m, banned: banned.has(m.team_id) }));
}

// ---------- 一支球隊的全部資料 ----------
export async function getTeamData(teamId: string, userId: string): Promise<TeamData | null> {
  const db = supabase();
  const [team, members, players, ratings, fixtures, duties, guards] = await Promise.all([
    db.from("teams").select(COLS.team).eq("id", teamId).maybeSingle(),
    db.from("memberships").select(COLS.membership).eq("team_id", teamId).order("joined_at", { ascending: true }),
    db.from("players").select(COLS.player).eq("team_id", teamId).order("name", { ascending: true }),
    db.from("ability_ratings").select(COLS.rating).eq("team_id", teamId).order("submitted_at", { ascending: false }),
    db.from("fixtures").select(COLS.fixture).eq("team_id", teamId).order("day", { ascending: true }),
    db.from("duties").select(COLS.duty).eq("team_id", teamId),
    db.from("coach_code_guard").select(COLS.guard).eq("team_id", teamId),
  ]);
  if (team.error) throw new Error(`讀取球隊失敗：${team.error.message}`);
  if (!team.data) return null;   // 不存在，或不是這一隊的成員（RLS 看不到）
  const ms = must<Membership[]>(members, "成員");
  const me = ms.find((m) => m.user_id === userId);
  if (!me) return null;
  const ids = ms.map((m) => m.user_id);
  const profiles = must<Profile[]>(await db.from("profiles").select(COLS.profile).in("user_id", ids), "成員名稱");
  return {
    team: team.data as unknown as Team, me, members: ms, profiles,
    players: must<Player[]>(players, "球員"), ratings: must<Rating[]>(ratings, "能力自評"),
    fixtures: must<Fixture[]>(fixtures, "賽程"), duties: must<Duty[]>(duties, "裁判任務"),
    guards: must<Guard[]>(guards, "封鎖狀態"),
  };
}

export async function getCoachCodes(teamId: string): Promise<CoachCode[]> {
  return must<CoachCode[]>(await supabase().from("coach_codes").select(COLS.code).eq("team_id", teamId)
    .order("created_at", { ascending: false }), "管理員碼");
}

/** 球員改自己的介紹（暱稱、給球隊的話、位置、弱腳）。名字、背號、隊長標記資料庫會擋。 */
export async function updateMyPlayer(playerId: string, fields: Partial<Pick<Player,
  "nickname" | "message" | "good_positions" | "bad_positions" | "weak_side">>): Promise<void> {
  const r = await supabase().from("players").update(fields).eq("id", playerId).select("id");
  if (r.error) throw new Error(r.error.message);
  if (!r.data || r.data.length === 0) throw new Error("沒有權限修改這位球員");
}

// ---------- 動作（資料庫函式）----------
export async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const r = await supabase().rpc(name, args);
  if (r.error) return { status: "error", detail: `連線或權限錯誤：${r.error.message}` };
  return (r.data ?? { status: "error" }) as RpcResult;
}

export const actions = {
  join: (code: string) => rpc("join_team", { team_code: code }),
  leave: (team: string) => rpc("leave_team", { team }),
  redeem: (team: string, code: string) => rpc("redeem_coach_code", { team, code }),
  claimPlayer: (team: string, player: string) => rpc("request_claim", { team, player }),
  claimNewName: (team: string, newName: string) => rpc("request_claim", { team, new_name: newName }),
  decideClaim: (team: string, member: string, approve: boolean) => rpc("decide_claim", { team, member, approve }),
  createCoachCode: (team: string, validDays = 7) => rpc("create_coach_code", { team, valid_days: validDays }),
  revokeCoachCode: (codeId: string) => rpc("revoke_coach_code", { code_id: codeId }),
  resetTeamCode: (team: string) => rpc("reset_team_code", { team }),
  unban: (team: string, member: string) => rpc("unban_coach_code", { team, member }),
  removeMember: (team: string, member: string) => rpc("remove_member", { team, member }),
  demoteCoach: (team: string, member: string) => rpc("demote_coach", { team, member }),
  createTeam: (name: string, season: string | null, leagueName: string | null) =>
    rpc("admin_create_team", { team_name: name, season, league_name: leagueName }),
  acceptPolicies: (version: string) => rpc("accept_policies", { version }),
  deleteMyAccount: () => rpc("delete_my_account", {}),
  deleteUnlinkedPlayer: (player: string) => rpc("delete_unlinked_player", { player }),
  exportMyData: () => rpc("export_my_data", {}),
  setCareerShared: (team: string, shared: boolean) => rpc("set_career_shared", { team, shared }),
  submitRating: (team: string, f: { scores: Scores; good: string[]; bad: string[]; weakSide: string; nickname: string; message: string }) =>
    rpc("submit_self_rating", { team, scores: f.scores, good: f.good, bad: f.bad, weak_side: f.weakSide,
                                nickname: f.nickname, message: f.message }),
};

// ---------- 球員生涯（v2.3）----------
/** 在 team 這一隊看 player 的生涯：本人看得到自己所有隊伍；別人只看得到他「放進生涯」的隊伍＋這一隊。 */
export async function getCareer(team: string, player: string): Promise<CareerResult> {
  return (await rpc("get_career", { team, player })) as CareerResult;
}

// ---------- 選球隊頁的通知 ----------
export type TeamNote = { kind: "form" | "claim" | "pending" | "claims" | "match"; text: string; href: string };

/** 每一隊給我的提醒：還沒填能力表、還沒認領、等球隊管理員確認、（球隊管理員）待確認的認領、下一場比賽。 */
export async function getTeamNotes(mine: MyTeam[], today: string): Promise<Record<string, TeamNote[]>> {
  const db = supabase();
  const out: Record<string, TeamNote[]> = {};
  if (!mine.length) return out;
  const linked = mine.map((t) => t.membership.player_id).filter((x): x is string => !!x);
  const coachTeams = mine.filter((t) => t.membership.role === "coach").map((t) => t.team.id);
  const [ratings, claims, fixtures] = await Promise.all([
    linked.length ? db.from("ability_ratings").select("player_id").in("player_id", linked) : Promise.resolve({ data: [], error: null }),
    coachTeams.length ? db.from("memberships").select("team_id, claim_player_id, claim_new_name").in("team_id", coachTeams)
      : Promise.resolve({ data: [], error: null }),
    db.from("fixtures").select("team_id, day, start_time, home, away").in("team_id", mine.map((t) => t.team.id))
      .gte("day", today).order("day", { ascending: true }),
  ]);
  const rated = new Set(must<{ player_id: string }[]>(ratings, "能力自評").map((r) => r.player_id));
  const claimRows = must<{ team_id: string; claim_player_id: string | null; claim_new_name: string | null }[]>(claims, "認領");
  const fx = must<{ team_id: string; day: string; start_time: string | null; home: string; away: string }[]>(fixtures, "賽程");
  for (const { team, membership: m } of mine) {
    const notes: TeamNote[] = [];
    const base = `/t/${team.id}`;
    if (m.player_id && !rated.has(m.player_id)) notes.push({ kind: "form", text: "還沒填這一季的能力表", href: `${base}/form` });
    if (!m.player_id && (m.claim_player_id || m.claim_new_name)) notes.push({ kind: "pending", text: "認領申請等球隊管理員確認中", href: base });
    if (!m.player_id && !m.claim_player_id && !m.claim_new_name) notes.push({ kind: "claim", text: "還沒找到名單上的自己", href: `${base}/claim` });
    const n = claimRows.filter((c) => c.team_id === team.id && (c.claim_player_id || c.claim_new_name)).length;
    if (n) notes.push({ kind: "claims", text: `${n} 個認領等你確認`, href: `${base}/coach?tab=members` });
    const us = team.league_name;
    const next = fx.find((f) => f.team_id === team.id && (!us || f.home === us || f.away === us));
    if (next && us) {
      const opp = next.home === us ? next.away : next.home;
      notes.push({ kind: "match", text: `${next.day.slice(5).replace("-", "/")} ${next.start_time?.slice(0, 5) ?? ""} vs ${opp}`.replace("  ", " "), href: `${base}/home` });
    }
    out[team.id] = notes;
  }
  return out;
}

/** 球隊管理員改球隊資料（名稱、賽季、聯賽賽程表上的隊名）。Team ID 要用 actions.resetTeamCode。 */
export async function updateTeam(teamId: string, fields: { name: string; season: string | null; league_name: string | null }): Promise<void> {
  const r = await supabase().from("teams").update(fields).eq("id", teamId).select("id");
  if (r.error) throw new Error(r.error.message);
  if (!r.data || r.data.length === 0) throw new Error("只有這一隊的球隊管理員可以改");
}

// ---------- 聯絡我們 ----------
export type ContactMessage = { id: string; user_id: string | null; category: string; body: string; page: string; status: "new" | "done"; created_at: string };
export const CONTACT_CATEGORIES: [string, string][] = [["bug", "網站壞掉了"], ["suggestion", "建議"], ["privacy", "個資、帳號"], ["other", "其他"]];

/** 送出聯絡訊息：經過網站自己的伺服器（存進資料庫，再通知網站管理員的 Discord）。 */
export async function sendContact(category: string, body: string, page: string): Promise<RpcResult> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { status: "unauthenticated" };
  try {
    const r = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ category, body, page }),
    });
    return (await r.json()) as RpcResult;
  } catch {
    return { status: "error", detail: "連不到伺服器，請稍後再試" };
  }
}

/** 網站管理員：最近的聯絡訊息。 */
export async function getContactMessages(): Promise<ContactMessage[]> {
  return must<ContactMessage[]>(await supabase().from("contact_messages").select(COLS.contact)
    .order("created_at", { ascending: false }).limit(50), "聯絡訊息");
}

export async function setContactStatus(id: string, status: "new" | "done"): Promise<void> {
  const r = await supabase().from("contact_messages").update({ status }).eq("id", id).select("id");
  if (r.error) throw new Error(r.error.message);
}
