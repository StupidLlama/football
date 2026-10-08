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

// 球隊自己的比賽（v2.5 F7）：跟系際聯賽賽程（Fixture，上面）是兩件事，不要搞混。
// 狀態（即將進行／已結束）不存在這裡，用 kickoff 和 our_score 算（見 lib/matches.ts）。
export type Match = {
  id: string; team_id: string; opponent: string; kickoff: string; meet_at: string | null;
  location: string; jersey: string; size: 8 | 11; note: string;
  our_score: number | null; their_score: number | null; fixture_id: string | null;
  created_by: string | null; created_at: string; updated_at: string;
};
export type AttendanceAnswer = "in" | "out";
export type Attendance = {
  match_id: string; player_id: string; team_id: string; status: AttendanceAnswer; note: string;
  updated_by: string | null; updated_at: string;
};

// 隊伍聊天室（v2.6 F6）：parent_id 空的是主貼文；deleted_at 有值代表已刪除（body 清空、留下殼）。
export type MessageKind = "general" | "note" | "tactic";
export type Message = {
  id: string; team_id: string; author_id: string | null; parent_id: string | null; kind: MessageKind;
  body: string; lineup_id: string | null; pinned_at: string | null; edited_at: string | null;
  deleted_at: string | null; created_at: string;
};
// 讀到哪裡（未讀紅點、首頁「有新的置頂訊息」）：只看得到自己的那一列（RLS），沒有＝從來沒讀過。
export type ChatMeta = { lastReadAt: string | null; unread: number; newPinned: boolean };

export type TeamData = {
  team: Team; me: Membership; members: Membership[]; profiles: Profile[]; players: Player[]; ratings: Rating[];
  fixtures: Fixture[]; duties: Duty[]; guards: Guard[]; matches: Match[]; attendance: Attendance[]; chat: ChatMeta;
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
  match: "id, team_id, opponent, kickoff, meet_at, location, jersey, size, note, our_score, their_score, fixture_id, created_by, created_at, updated_at",
  attendance: "match_id, player_id, team_id, status, note, updated_by, updated_at",
  message: "id, team_id, author_id, parent_id, kind, body, lineup_id, pinned_at, edited_at, deleted_at, created_at",
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
  const [team, members, players, ratings, fixtures, duties, guards, matches, attendance] = await Promise.all([
    db.from("teams").select(COLS.team).eq("id", teamId).maybeSingle(),
    db.from("memberships").select(COLS.membership).eq("team_id", teamId).order("joined_at", { ascending: true }),
    db.from("players").select(COLS.player).eq("team_id", teamId).order("name", { ascending: true }),
    db.from("ability_ratings").select(COLS.rating).eq("team_id", teamId).order("submitted_at", { ascending: false }),
    db.from("fixtures").select(COLS.fixture).eq("team_id", teamId).order("day", { ascending: true }),
    db.from("duties").select(COLS.duty).eq("team_id", teamId),
    db.from("coach_code_guard").select(COLS.guard).eq("team_id", teamId),
    db.from("matches").select(COLS.match).eq("team_id", teamId).order("kickoff", { ascending: true }),
    db.from("attendance").select(COLS.attendance).eq("team_id", teamId),
  ]);
  if (team.error) throw new Error(`讀取球隊失敗：${team.error.message}`);
  if (!team.data) return null;   // 不存在，或不是這一隊的成員（RLS 看不到）
  const ms = must<Membership[]>(members, "成員");
  const me = ms.find((m) => m.user_id === userId);
  if (!me) return null;
  const ids = ms.map((m) => m.user_id);
  const profiles = must<Profile[]>(await db.from("profiles").select(COLS.profile).in("user_id", ids), "成員名稱");
  const chat = await getChatMeta(teamId, userId);
  return {
    team: team.data as unknown as Team, me, members: ms, profiles,
    players: must<Player[]>(players, "球員"), ratings: must<Rating[]>(ratings, "能力自評"),
    fixtures: must<Fixture[]>(fixtures, "賽程"), duties: must<Duty[]>(duties, "裁判任務"),
    guards: must<Guard[]>(guards, "封鎖狀態"),
    matches: must<Match[]>(matches, "比賽"), attendance: must<Attendance[]>(attendance, "出席登記"),
    chat,
  };
}

/** 未讀數和「有沒有新置頂」：給側邊欄紅點、首頁待辦用（不用載整個聊天室才知道）。 */
async function getChatMeta(teamId: string, userId: string): Promise<ChatMeta> {
  const db = supabase();
  const readRes = await db.from("chat_reads").select("last_read_at").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
  if (readRes.error) throw new Error(`讀取聊天室已讀狀態失敗：${readRes.error.message}`);
  const lastReadAt = (readRes.data as { last_read_at: string } | null)?.last_read_at ?? null;
  const since = lastReadAt ?? "1970-01-01T00:00:00Z";
  const [unreadRes, pinnedRes] = await Promise.all([
    db.from("messages").select("id", { count: "exact", head: true })
      .eq("team_id", teamId).is("deleted_at", null).neq("author_id", userId).gt("created_at", since),
    db.from("messages").select("id", { count: "exact", head: true })
      .eq("team_id", teamId).is("deleted_at", null).not("pinned_at", "is", null).gt("pinned_at", since),
  ]);
  if (unreadRes.error) throw new Error(`讀取聊天室未讀數失敗：${unreadRes.error.message}`);
  if (pinnedRes.error) throw new Error(`讀取聊天室置頂狀態失敗：${pinnedRes.error.message}`);
  return { lastReadAt, unread: unreadRes.count ?? 0, newPinned: (pinnedRes.count ?? 0) > 0 };
}

// ---------- 隊伍聊天室（v2.6 F6）----------
/** 這一隊全部的訊息（含已刪除的殼，回覆才看得懂上下文），照發文時間舊到新。 */
export async function getMessages(teamId: string): Promise<Message[]> {
  return must<Message[]>(await supabase().from("messages").select(COLS.message).eq("team_id", teamId)
    .order("created_at", { ascending: true }), "聊天室訊息");
}

/** 即時訂閱這一隊的訊息變化（新發文、編輯、刪除、置頂）；回傳取消訂閱的函式。 */
export function subscribeMessages(teamId: string, onChange: () => void): () => void {
  const channel = supabase().channel(`messages-${teamId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `team_id=eq.${teamId}` }, onChange)
    .subscribe();
  return () => { supabase().removeChannel(channel); };
}

export async function postMessage(team: string, body: string, kind: MessageKind = "general",
  parent?: string | null, lineup?: string | null): Promise<RpcResult & { id?: string }> {
  return (await rpc("post_message", { team, body, kind, parent: parent ?? null, lineup: lineup ?? null })) as RpcResult & { id?: string };
}

export async function editMessage(message: string, body: string): Promise<RpcResult> {
  return rpc("edit_message", { message, body });
}

export async function deleteMessage(message: string): Promise<RpcResult> {
  return rpc("delete_message", { message });
}

export async function setPinned(message: string, pinned: boolean): Promise<RpcResult> {
  return rpc("set_pinned", { message, pinned });
}

export async function markChatRead(team: string): Promise<RpcResult> {
  return rpc("mark_chat_read", { team });
}

/** 球隊管理員：有沒有設定 Discord 通知（網址本身永遠不會傳到瀏覽器）。 */
export async function getChatDiscord(team: string): Promise<RpcResult & { configured?: boolean; updated_at?: string | null }> {
  return (await rpc("get_chat_discord", { team })) as RpcResult & { configured?: boolean; updated_at?: string | null };
}

/** url 傳空字串 = 關掉通知。 */
export async function setChatDiscord(team: string, url: string): Promise<RpcResult & { configured?: boolean }> {
  return (await rpc("set_chat_discord", { team, url })) as RpcResult & { configured?: boolean };
}

/** 管理專區「在聊天室提醒還沒填能力表的人」：發一則置頂筆記，列出名字（F9）。 */
export async function remindMissingRatings(team: string, names: string[]): Promise<RpcResult & { id?: string }> {
  if (!names.length) return { status: "invalid", detail: "目前沒有人還沒填能力表" };
  const body = `能力表還沒填的人：${names.join("、")}。記得抽空填一下，謝謝！`;
  const posted = await postMessage(team, body, "note");
  if (posted.status !== "ok" || !posted.id) return posted;
  const pinned = await setPinned(posted.id, true);
  return pinned.status === "ok" ? posted : { ...pinned, id: posted.id };
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

// ---------- 比賽列表＋出賽登記（v2.5 F7）----------
export type SaveMatchInput = {
  team: string; match?: string | null; opponent: string; kickoff: string; meetAt?: string | null;
  location?: string; jersey?: string; size: 8 | 11; note?: string;
  ourScore?: number | null; theirScore?: number | null;
};

export async function saveMatch(input: SaveMatchInput): Promise<RpcResult & { id?: string }> {
  return (await rpc("save_match", {
    team: input.team, match: input.match ?? null, opponent: input.opponent, kickoff: input.kickoff,
    meet_at: input.meetAt ?? null, location: input.location ?? "", jersey: input.jersey ?? "", size: input.size,
    note: input.note ?? "", our_score: input.ourScore ?? null, their_score: input.theirScore ?? null,
  })) as RpcResult & { id?: string };
}

export async function deleteMatch(match: string): Promise<RpcResult> {
  return rpc("delete_match", { match });
}

/** 從系際聯賽賽程一鍵建立；回傳的 id 可能是剛建立的，也可能是本來就建過的那一場（existed: true）。 */
export async function matchFromFixture(team: string, fixture: string): Promise<RpcResult & { id?: string; existed?: boolean }> {
  return (await rpc("match_from_fixture", { team, fixture })) as RpcResult & { id?: string; existed?: boolean };
}

/** answer: null = 清掉登記（變回還沒回覆）。player 不填 = 登記自己；球隊管理員可以填任何人代登記。 */
export async function setAttendance(match: string, answer: AttendanceAnswer | null, note = "", player?: string | null):
  Promise<RpcResult & { answer?: AttendanceAnswer | null }> {
  return (await rpc("set_attendance", { match, answer, note, player: player ?? null })) as RpcResult & { answer?: AttendanceAnswer | null };
}

// ---------- 組隊（v2.4）----------
export type LineupKind = "official" | "draft";
export type LineupRow = {
  id: string; team_id: string; owner_id: string | null; kind: LineupKind; name: string; size: number;
  formation: string; picks: Record<string, string | null>; locked: string[]; attending: string[];
  match_id: string | null;
  share_token: string | null; share_names: boolean; shared_at: string | null; created_at: string; updated_at: string;
};
const LINEUP_COLS = "id, team_id, owner_id, kind, name, size, formation, picks, locked, attending, match_id, "
  + "share_token, share_names, shared_at, created_at, updated_at";

/** 這一隊看得到的陣容：全部正式陣容 ＋ 自己的草稿（RLS 已經擋好，這裡不用再篩）。 */
export async function getLineups(teamId: string): Promise<LineupRow[]> {
  return must<LineupRow[]>(await supabase().from("lineups").select(LINEUP_COLS).eq("team_id", teamId)
    .order("updated_at", { ascending: false }), "陣容");
}

export type SaveLineupInput = {
  team: string; lineup?: string | null; kind: LineupKind; name: string; size: number; formation: string;
  picks: Record<string, string | null>; locked: string[]; attending: string[]; match?: string | null;
};

export async function saveLineup(input: SaveLineupInput): Promise<RpcResult & { id?: string }> {
  return (await rpc("save_lineup", {
    team: input.team, lineup: input.lineup ?? null, kind: input.kind, name: input.name, size: input.size,
    formation: input.formation, picks: input.picks, locked: input.locked, attending: input.attending,
    match: input.match ?? null,
  })) as RpcResult & { id?: string };
}

export async function deleteLineup(lineup: string): Promise<RpcResult> {
  return rpc("delete_lineup", { lineup });
}

export async function setLineupShare(lineup: string, shared: boolean, showNames = false, renew = false):
  Promise<RpcResult & { token?: string | null }> {
  return (await rpc("set_lineup_share", { lineup, shared, show_names: showNames, renew })) as RpcResult & { token?: string | null };
}

export type SharedLineup = {
  status: string; team_name?: string; season?: string | null; name?: string; size?: number; formation?: string;
  show_names?: boolean; updated_at?: string;
  match?: { opponent: string; kickoff: string } | null;
  slots?: Record<string, { number: string | null; name?: string } | null>;
};

/** 用分享碼看陣容：不用登入（走 anon），所以這裡直接呼叫 rpc，不經過需要 session 的 supabase() helper 的其他動作。 */
export async function getSharedLineup(token: string): Promise<SharedLineup> {
  const r = await supabase().rpc("get_shared_lineup", { token });
  if (r.error) return { status: "error" };
  return (r.data ?? { status: "error" }) as SharedLineup;
}

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
