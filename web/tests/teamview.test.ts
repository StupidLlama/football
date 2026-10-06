// 球隊資料整理（teamview.ts）和待辦（todos.ts）的測試。執行：npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Membership, Player, TeamData } from "../lib/api.ts";
import { abilities, type Rules } from "../lib/rating.ts";
import { buildTeamView, record } from "../lib/teamview.ts";
import { todosFor } from "../lib/todos.ts";

const rules: Rules = JSON.parse(readFileSync(new URL("../lib/config.json", import.meta.url), "utf-8"));
const full = (n: number) => Object.fromEntries(abilities(rules).map((a) => [a.key, n]));
const player = (id: string, name: string): Player => ({
  id, team_id: "T", name, nickname: "", jersey_number: null, badge: null, good_positions: [], bad_positions: [], weak_side: "", message: "",
});
const member = (user: string, role: "player" | "coach", playerId: string | null, claim: string | null = null): Membership => ({
  team_id: "T", user_id: user, role, player_id: playerId, joined_at: "2026-09-01T00:00:00Z",
  career_shared: false, claim_player_id: claim, claim_new_name: null, claim_at: claim ? "2026-10-01T00:00:00Z" : null,
});

function data(me: Membership, extra: Partial<TeamData> = {}): TeamData {
  return {
    team: { id: "T", code: "AAAA-BBBB", name: "測試隊", season: "2026-27", league_name: "資訊" },
    me, members: [me, member("u2", "player", "p2"), member("u3", "player", null, "p3")],
    profiles: [], players: [player("p1", "甲"), player("p2", "乙"), player("p3", "丙")],
    ratings: [
      { player_id: "p1", scores: full(2), submitted_at: "2026-01-01T00:00:00Z", source: "google_form" },
      { player_id: "p1", scores: full(4), submitted_at: "2026-09-01T00:00:00Z", source: "form" },
      { player_id: "p2", scores: full(2), submitted_at: "2026-09-01T00:00:00Z", source: "form" },
    ],
    fixtures: [
      { id: "f1", day: "2026-09-01", start_time: "19:00:00", end_time: null, home: "資訊", away: "電機", round: 1, match_no: null,
        home_score: 3, away_score: 1, referee: "", linesmen: [], note: "" },
      { id: "f2", day: "2026-09-08", start_time: "19:00:00", end_time: null, home: "化工", away: "資訊", round: 2, match_no: null,
        home_score: 2, away_score: 2, referee: "", linesmen: [], note: "" },
      { id: "f3", day: "2026-12-01", start_time: "19:00:00", end_time: null, home: "物理", away: "機械", round: 3, match_no: null,
        home_score: null, away_score: null, referee: "資訊", linesmen: [], note: "" },
    ],
    duties: [{ id: "d1", fixture_id: "f3", role: "主審", slot: 0, player_id: "p1" }],
    guards: [],
    ...extra,
  };
}

test("用最新一筆自評、算全隊平均", () => {
  const v = buildTeamView(data(member("u1", "coach", "p1")), rules);
  assert.equal(v.myPlayer?.avg, 4);
  assert.equal(v.rated.length, 2);
  assert.equal(v.teamAvg, 3);
  assert.equal(v.players.find((p) => p.id === "p3")?.scores, null);
  assert.equal(v.claims.length, 1);
});

test("只算我們隊的比賽，勝和負與積分", () => {
  const v = buildTeamView(data(member("u1", "coach", "p1")), rules);
  assert.equal(v.matches.length, 2);
  assert.deepEqual(v.matches.map((m) => m.result), ["W", "D"]);
  assert.equal(v.matches[1].score, "2 – 2");
  assert.equal(v.matches[1].side, "客場");
  assert.deepEqual(record(v.matches), { played: 2, w: 1, d: 1, l: 0, gf: 5, ga: 3, points: 4 });
});

test("球隊管理員的待辦：確認認領、還沒填的人、自己的裁判任務", () => {
  const v = buildTeamView(data(member("u1", "coach", "p1")), rules);
  const keys = todosFor(v, "T", false, new Date("2026-10-05T12:00:00")).map((t) => t.key);
  assert.deepEqual(keys, ["claims", "progress", "duty", "refill"]);
});

test("還沒認領的球員：先認領；認領中：等確認；連上但沒填：填能力表", () => {
  const now = new Date("2026-10-05T12:00:00");
  const none = buildTeamView(data(member("u9", "player", null)), rules);
  assert.equal(todosFor(none, "T", false, now)[0].key, "claim");
  const pending = buildTeamView(data(member("u9", "player", null, "p3")), rules);
  assert.equal(todosFor(pending, "T", false, now)[0].key, "pending");
  const linked = buildTeamView(data(member("u9", "player", "p3")), rules);
  assert.equal(todosFor(linked, "T", false, now)[0].key, "form");
});
