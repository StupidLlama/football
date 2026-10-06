// 組隊（純計算，不碰畫面和資料庫）。= stats/lineup.py 的 TypeScript 版。
//
// 每個人排某個位置的分數 = 位置適合度（0–100）＋ 自評擅長加分 − 自評不擅長扣分
// （加分扣分寫在 config/settings.toml 的 [lineup]；「LB」算在「LB/RB」裡）。
// 用指派問題的演算法求「全隊總分最高」的排法，不是一個位置一個位置挑最強的。
//
// 跟 Python 版唯一的差別：用球員 id 認人（Python 版用名字，同名會出事）。
// 同分時依「名字、再 id」排，同樣輸入每次結果一樣。

import { maxAssignment } from "./assignment.ts";
import { fitness, round, samePosition, type Rules, type Scores } from "./rating.ts";

export type Slot = { code: string; role: string; x: number; y: number };
export type Formation = { name: string; size: number; slots: Slot[] };
export type LineupRules = Rules & { lineup: { goodBonus: number; badPenalty: number } };

export type LineupPlayer = {
  id: string;
  name: string;
  scores: Scores | null;          // 還沒填能力表 = null（適合度全部 0）
  good_positions: string[];
  bad_positions: string[];
};

/** 某位球員踢某個位置的評估。 */
export type Option = {
  id: string;
  name: string;
  slot: string;      // 位置名稱（陣型裡的 code）
  role: string;      // 位置類型（算適合度用）
  fit: number;       // 位置適合度 0–100
  good: boolean;     // 自評擅長
  bad: boolean;      // 自評不擅長
  rated: boolean;    // 填過能力表
  score: number;     // 排人用的分數
};

export type Lineup = {
  formation: Formation;
  starters: Option[];   // 照陣型的位置順序；沒人的位置不在這裡
  empty: Slot[];        // 人數不夠時沒排到人的位置
  bench: Option[];      // 所有沒先發的人，每人附上最適合替補的位置，分數高的在前
  total: number;
};

/** 位置 code → 球員 id（null = 空著）。存資料庫、手動換人都用這個格式。 */
export type Picks = Record<string, string | null>;

const GK_PRIORITY = 1000; // 人數不夠時，門將一定先排

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byNameId = (a: { name: string; id: string }, b: { name: string; id: string }) => cmp(a.name, b.name) || cmp(a.id, b.id);
const byScore = (a: Option, b: Option) => b.score - a.score || byNameId(a, b);

export class LineupError extends Error {}

// ---------- 陣型 ----------
export function formationsOf(all: Formation[], size: number): Formation[] {
  return all.filter((f) => f.size === size);
}

export function findFormation(all: Formation[], size: number, name: string): Formation | undefined {
  return all.find((f) => f.size === size && f.name === name);
}

function slotOf(f: Formation, code: string): Slot {
  const s = f.slots.find((x) => x.code === code);
  if (!s) throw new LineupError(`沒有這個位置：${code}`);
  return s;
}

const has = (list: string[], role: string) => list.some((p) => samePosition(p, role));

// ---------- 評估 ----------
export function option(p: LineupPlayer, slot: Slot, rules: LineupRules, fit?: Record<string, number>): Option {
  const f = (fit ?? fitness(p.scores ?? {}, rules))[slot.role] ?? 0;
  const good = has(p.good_positions ?? [], slot.role);
  const bad = has(p.bad_positions ?? [], slot.role);
  const score = round(f + (good ? rules.lineup.goodBonus : 0) - (bad ? rules.lineup.badPenalty : 0), 1);
  return { id: p.id, name: p.name, slot: slot.code, role: slot.role, fit: f, good, bad, rated: !!p.scores, score };
}

/** 「為什麼是他」：適合度 82 · 自評擅長。 */
export function reason(o: Option): string {
  if (!o.rated) return "還沒填能力表";
  const tag = o.good ? "自評擅長" : o.bad ? "自評不擅長" : "數據推算";
  return `適合度 ${Math.round(o.fit)} · ${tag}`;
}

/** 這個位置的所有人選，分數高到低。 */
export function candidates(players: LineupPlayer[], slot: Slot, rules: LineupRules): Option[] {
  return players.map((p) => option(p, slot, rules)).sort(byScore);
}

function benchOf(players: LineupPlayer[], starting: Set<string>, f: Formation, rules: LineupRules,
                 fits: Map<string, Record<string, number>>): Option[] {
  const bench: Option[] = [];
  for (const p of players) {
    if (starting.has(p.id)) continue;
    let best: Option | null = null;
    for (const s of f.slots) {
      const o = option(p, s, rules, fits.get(p.id));
      if (!best || o.score > best.score) best = o; // 同分取陣型裡前面的位置（跟 Python 的 max 一樣）
    }
    if (best) bench.push(best);
  }
  return bench.sort(byScore);
}

function build(f: Formation, picked: Map<string, Option>, bench: Option[]): Lineup {
  const starters = f.slots.filter((s) => picked.has(s.code)).map((s) => picked.get(s.code)!);
  return {
    formation: f, starters, bench,
    empty: f.slots.filter((s) => !picked.has(s.code)),
    total: round(starters.reduce((t, o) => t + o.score, 0), 1),
  };
}

function checkPlayers(players: LineupPlayer[]): void {
  const ids = players.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new LineupError("出賽名單裡有重複的球員");
}

/** 鎖定的位置裡，把已經不在名單上的人、不存在的位置、重複鎖定的人拿掉（畫面切換陣型或取消出席時用）。 */
export function cleanLocked(locked: Picks, players: LineupPlayer[], f: Formation): Record<string, string> {
  const ids = new Set(players.map((p) => p.id));
  const seen = new Set<string>();
  const out: Record<string, string> = {};
  for (const s of f.slots) {
    const id = locked[s.code];
    if (id && ids.has(id) && !seen.has(id)) { out[s.code] = id; seen.add(id); }
  }
  return out;
}

/** 自動排人。players = 這場出賽的人；locked = {位置 code: 球員 id}，先固定再排其他人。 */
export function autoLineup(players: LineupPlayer[], f: Formation, rules: LineupRules, locked: Picks = {}): Lineup {
  checkPlayers(players);
  const lock = Object.entries(locked).filter((e): e is [string, string] => !!e[1]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const unknown = lock.filter(([, id]) => !byId.has(id)).map(([, id]) => id);
  if (unknown.length) throw new LineupError(`鎖定的球員不在出賽名單裡：${unknown.join(", ")}`);
  if (new Set(lock.map(([, id]) => id)).size !== lock.length) throw new LineupError("同一位球員不能鎖在兩個位置");

  const fits = new Map(players.map((p) => [p.id, fitness(p.scores ?? {}, rules)]));
  const picked = new Map<string, Option>();
  for (const [code, id] of lock) picked.set(code, option(byId.get(id)!, slotOf(f, code), rules, fits.get(id)));
  const lockedIds = new Set(lock.map(([, id]) => id));
  const freeSlots = f.slots.filter((s) => !picked.has(s.code));
  const freePlayers = players.filter((p) => !lockedIds.has(p.id)).sort(byNameId);
  const table = freeSlots.map((s) => freePlayers.map((p) => option(p, s, rules, fits.get(p.id))));
  // 人數不夠時，一定先把門將排滿（其他位置空著還能踢，沒有門將不行）
  const short = freePlayers.length < freeSlots.length;
  const weights = table.map((row) => row.map((o) => o.score + (short && o.role === "GK" ? GK_PRIORITY : 0)));
  maxAssignment(weights).forEach((j, i) => { if (j >= 0) picked.set(freeSlots[i].code, table[i][j]); });

  const starting = new Set([...picked.values()].map((o) => o.id));
  return build(f, picked, benchOf(players, starting, f, rules, fits));
}

/** 依手動排好的 picks 算出陣容（每個人的適合度、說明、替補），算分方式跟自動排一樣。 */
export function manualLineup(players: LineupPlayer[], f: Formation, rules: LineupRules, picks: Picks): Lineup {
  checkPlayers(players);
  const byId = new Map(players.map((p) => [p.id, p]));
  const chosen = f.slots.map((s) => picks[s.code]).filter((id): id is string => !!id);
  const unknown = chosen.filter((id) => !byId.has(id));
  if (unknown.length) throw new LineupError(`選的球員不在出賽名單裡：${unknown.join(", ")}`);
  if (new Set(chosen).size !== chosen.length) throw new LineupError("同一位球員不能放在兩個位置");
  const fits = new Map(players.map((p) => [p.id, fitness(p.scores ?? {}, rules)]));
  const picked = new Map<string, Option>();
  for (const s of f.slots) {
    const id = picks[s.code];
    if (id) picked.set(s.code, option(byId.get(id)!, s, rules, fits.get(id)));
  }
  return build(f, picked, benchOf(players, new Set(chosen), f, rules, fits));
}

/** 陣容 → {位置 code: 球員 id 或 null}（給手動調整當起點）。 */
export function picksOf(lu: Lineup): Picks {
  const bySlot = new Map(lu.starters.map((o) => [o.slot, o.id]));
  return Object.fromEntries(lu.formation.slots.map((s) => [s.code, bySlot.get(s.code) ?? null]));
}

/**
 * 手動換人：把 id 放到 slot（id = null 是清空）。id 原本在別的位置的話，兩個位置的人互換；
 * id 原本在替補，原本 slot 上的人就下到替補。回傳新的 picks 和被交換的位置（不會改傳進來的 picks）。
 */
export function assign(picks: Picks, slot: string, id: string | null): { picks: Picks; swapped: string | null } {
  if (!(slot in picks)) throw new LineupError(`沒有這個位置：${slot}`);
  const next = { ...picks };
  const other = id ? Object.keys(next).find((c) => next[c] === id && c !== slot) ?? null : null;
  if (other) next[other] = next[slot];
  next[slot] = id;
  return { picks: next, swapped: other };
}

/** 兩個位置互換（手機版「點一個、再點一個」）。 */
export function swapSlots(picks: Picks, a: string, b: string): Picks {
  if (!(a in picks) || !(b in picks)) throw new LineupError("沒有這個位置");
  return { ...picks, [a]: picks[b], [b]: picks[a] };
}

/** 換陣型時盡量保留原本的人：同樣 code 的位置直接留下，其餘交給自動排。 */
export function carryOver(picks: Picks, to: Formation): Picks {
  return Object.fromEntries(to.slots.map((s) => [s.code, picks[s.code] ?? null]));
}

/** 「人數不夠」的提示文字；人數夠回傳 null。 */
export function shortageText(lu: Lineup): string | null {
  if (!lu.empty.length) return null;
  return `人數不夠，還缺 ${lu.empty.length} 個位置：${lu.empty.map((s) => s.code).join("、")}`;
}
