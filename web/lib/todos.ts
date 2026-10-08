// 「我的待辦」：依我的身分和狀態，列出現在該做的事。純計算。
import { answerOf, isLocked, kickoffLabel, splitGames } from "./matches.ts";
import type { TeamView } from "./teamview.ts";

export type Todo = { key: string; title: string; detail: string; href?: string; action?: string; tone: "main" | "info" | "warn" };

export function todosFor(v: TeamView, teamId: string, isAdmin: boolean, now = new Date()): Todo[] {
  const base = `/t/${teamId}`;
  const out: Todo[] = [];
  const me = v.me;
  if (!me.player_id && !me.claim_player_id && !me.claim_new_name) {
    out.push({ key: "claim", title: "找到名單上的自己", detail: "連到你的球員卡，才能填能力表", href: `${base}/claim`, action: "去認領", tone: "main" });
  }
  if (!me.player_id && (me.claim_player_id || me.claim_new_name)) {
    const who = me.claim_player_id ? v.players.find((p) => p.id === me.claim_player_id)?.name ?? "" : me.claim_new_name ?? "";
    out.push({ key: "pending", title: "認領等球隊管理員確認", detail: `你申請的是「${who}」。球隊管理員確認後就能填能力表。`, tone: "info" });
  }
  if (v.myPlayer && !v.myPlayer.scores) {
    out.push({ key: "form", title: "填這一季的能力表", detail: "21 項能力 1–5 分，手機大約 3 分鐘", href: `${base}/form`, action: "開始填", tone: "main" });
  }
  if (v.isCoach || isAdmin) {
    if (v.claims.length) {
      out.push({ key: "claims", title: `${v.claims.length} 個認領等你確認`, detail: "確認後隊友的帳號才會連到名單", href: `${base}/coach?tab=members`, action: "去確認", tone: "warn" });
    }
    const missing = v.players.filter((p) => !p.scores).length;
    if (missing) {
      out.push({ key: "progress", title: `${missing} 位球員還沒填能力表`, detail: "看是誰還沒填、誰還沒有帳號", href: `${base}/coach?tab=progress`, action: "看進度", tone: "info" });
    }
  }
  if (v.myPlayer) {
    const next = splitGames(v.data.matches, now).upcoming[0];
    if (next && !isLocked(next, now) && answerOf(v.data.attendance, next.id, v.myPlayer.id) === null) {
      out.push({ key: "attendance", title: "下一場還沒回覆", detail: `vs ${next.opponent} · ${kickoffLabel(next.kickoff)}`,
        href: `${base}/matches/${next.id}`, action: "去登記", tone: "warn" });
    }
  }
  const mine = v.duties.filter((d) => d.player_id && d.player_id === me.player_id && d.kickoff && d.kickoff >= startOfDay(now));
  if (mine.length) {
    const d = mine[0];
    const match = d.fixture ? `${d.fixture.home} vs ${d.fixture.away}` : "";
    out.push({ key: "duty", title: `你是${d.role}`, detail: `${match}${mine.length > 1 ? `，之後還有 ${mine.length - 1} 場` : ""}`, href: `${base}/home`, action: "看時間", tone: "warn" });
  }
  if (v.myPlayer?.scores) {
    out.push({ key: "refill", title: "能力表已經填好了", detail: "練了一陣子有進步，可以隨時重填（會保留舊的紀錄）", href: `${base}/form`, action: "重新填", tone: "info" });
  }
  return out;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
