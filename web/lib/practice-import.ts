// v2.7 AI 匯入練習（網站不串接 AI）：純計算，不碰畫面和資料庫。
//   1. buildPrompt：球隊管理員填基本資訊 → 產生一段「給 AI 的指令」，管理員連同課表／賽程貼給自己的 AI
//   2. parseImport：AI 照格式回傳的文字貼回來 → 一行一行解析；格式錯的那一行標出原因，不會整批失敗
//   3. toRpcRows：解析好的資料 → save_practices 要的格式（帶時區的 ISO 時間）
// 格式：一行一次練習，用直線「|」分隔（中文內容常有逗號，比 CSV 不容易壞）：
//   日期|開始|結束|地點|集合|標題|內容|備註
// 長度限制跟 0011_practices.sql 的 practice_problem 一樣。

export const COLUMNS = ["日期", "開始", "結束", "地點", "集合", "標題", "內容", "備註"] as const;
export const HEADER = COLUMNS.join("|");
export const LIMITS = { location: 60, title: 20, content: 500, note: 200 } as const;
export const MAX_HOURS = 8;
export const MAX_MEET_BEFORE_HOURS = 6;
export const MAX_ROWS = 60;

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const pad = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------- 1. 給 AI 的指令

export type ImportInfo = {
  teamName: string;
  termStart: string; // YYYY-MM-DD
  termEnd: string;   // YYYY-MM-DD
  location: string;  // 常用球場
  usual: string;     // 平常的練習時段，例如「每週二、四 19:00–21:00」
  extra: string;     // 其他說明，例如「期中考週停練」
};

/** 產生給 AI 的指令。範例的兩行用學期第一週的日期，自己也一定解析得回來（測試會檢查）。 */
export function buildPrompt(info: ImportInfo): string {
  const team = info.teamName.trim() || "我們的球隊";
  const start = info.termStart || "（未填）";
  const end = info.termEnd || "（未填）";
  const place = info.location.trim();
  const ex1 = exampleDay(info.termStart, 0);
  const ex2 = exampleDay(info.termStart, 2);
  const lines = [
    `你是幫業餘足球隊「${team}」整理練習行事曆的助手。我會附上課表、賽程或公告（圖片或文字），請找出 ${start} 到 ${end} 之間的每一次練習，照下面的格式輸出。`,
    "",
    "【基本資訊】",
    `- 隊名：${team}`,
    `- 期間：${start} 到 ${end}（只要這段期間內的練習）`,
    `- 常用球場：${place || "（沒有）"}${place ? "（資料上沒寫地點的練習就填這個）" : ""}`,
    `- 平常的練習時段：${info.usual.trim() || "（沒有）"}`,
    `- 其他說明：${info.extra.trim() || "（沒有）"}`,
    "",
    "【輸出格式】",
    "- 只輸出一個程式碼區塊（```），區塊外面不要有任何文字。",
    "- 區塊第一行是標題列，之後一行一次練習。欄位用直線「|」分隔，順序固定：",
    HEADER,
    "- 日期：YYYY-MM-DD（例如 2026-10-13），年份依照上面的期間判斷。",
    "- 開始、結束、集合：24 小時制 HH:MM（例如 19:00）。",
    "- 開始、結束一定要有；其他欄位可以空著，但「|」要留著，每一行都是 8 個欄位。",
    `- 地點最多 ${LIMITS.location} 字；標題最多 ${LIMITS.title} 字（例如「練習」「體能」「友誼賽」）；內容（練什麼、要帶什麼）最多 ${LIMITS.content} 字；備註最多 ${LIMITS.note} 字。`,
    "- 內容和備註裡不要出現「|」，也不要換行。",
    "",
    "【重要規則】",
    "- 不確定、看不清楚的欄位就留空，不要猜。",
    "- 如果連日期或開始、結束時間都不確定，那一次就不要輸出，改在區塊最後用「# 」開頭寫一行說明（例如「# 11/5 那週的課表看不清楚」）。",
    "- 每週固定的練習要一次一次列出來，不要寫成「每週二」。",
    "- 資料上寫了停練的日子（國定假日、考試週、停課）就不要列。",
    "",
    "【範例】（日期只是示範，請照我給的資料）",
    "```",
    HEADER,
    [ex1, "19:00", "21:00", place || "操場", "18:45", "練習", "傳接球、分組對抗", "帶水和護脛"].join("|"),
    [ex2, "19:00", "21:00", "", "", "", "體能", ""].join("|"),
    "# 範例：這一行是說明，網站會顯示但不會建立練習",
    "```",
  ];
  return lines.join("\n");
}

function exampleDay(termStart: string, plus: number): string {
  const d = parseIsoDay(termStart) ?? new Date(2026, 8, 14);
  d.setDate(d.getDate() + plus);
  return ymd(d);
}

// ---------------------------------------------------------------- 2. 解析

export type Draft = {
  date: string;     // YYYY-MM-DD
  start: string;    // HH:MM
  end: string;      // HH:MM
  location: string;
  meet: string;     // HH:MM 或空字串
  title: string;
  content: string;
  note: string;
};

export type ParsedLine =
  | { line: number; raw: string; ok: true; value: Draft; warnings: string[] }
  | { line: number; raw: string; ok: false; errors: string[] };

export type ParseResult = {
  lines: ParsedLine[];   // 資料行（成功或失敗），照原本的順序
  comments: string[];    // AI 用「# 」寫的說明
  ignored: string[];     // 看起來是 AI 多講的話（沒有「|」也不是日期開頭），不算錯
};

export type ParseOptions = {
  termStart?: string;    // 用來補沒寫年份的日期、提醒不在期間內
  termEnd?: string;
  today?: Date;
};

/** 把 AI 回傳的文字解析成一行一行。永遠不會丟例外；每一行自己成功或失敗。 */
export function parseImport(text: string, opts: ParseOptions = {}): ParseResult {
  const today = opts.today ?? new Date();
  const out: ParseResult = { lines: [], comments: [], ignored: [] };
  const seen = new Map<string, number>();
  const rawLines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");

  rawLines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    let s = rawLine.replace(/[｜│]/g, "|").trim();
    if (!s) return;
    if (s.startsWith("```")) return;                                   // 程式碼區塊的開頭、結尾
    if (/^#/.test(s)) { const c = s.replace(/^#+\s*/, ""); if (c) out.comments.push(c); return; }
    if (/^\|?\s*:?-{2,}/.test(s)) return;                              // markdown 表格的分隔線
    // markdown 表格的一行：頭尾都有 |，中間剛好 8 格 → 去掉頭尾的 |（「|19:00|21:00」這種是少了日期，不是表格）
    if (s.startsWith("|") && s.endsWith("|") && s.split("|").length === COLUMNS.length + 2) s = s.slice(1, -1);
    if (s.includes("日期") && s.includes("開始")) return;               // 標題列

    if (!s.includes("|")) {
      if (looksLikeDate(s)) out.lines.push({ line: lineNo, raw: rawLine, ok: false, errors: ["沒有用「|」分隔欄位"] });
      else out.ignored.push(s);
      return;
    }

    const cells = s.split("|").map((c) => c.trim());
    // 第一格不是日期、而且連數字都沒有 → AI 多講的話剛好有「|」（例如照抄規則），略過；
    // 有數字的（例如打錯的 2026-1O-13）還是當資料行，標出錯誤
    if (cells[0] && !looksLikeDate(cells[0]) && !/[0-9０-９]/.test(cells[0])) { out.ignored.push(s); return; }
    if (cells.length > COLUMNS.length) {
      out.lines.push({ line: lineNo, raw: rawLine, ok: false,
        errors: [`欄位太多（應該是 ${COLUMNS.length} 個，這行有 ${cells.length} 個；內容裡是不是有「|」？）`] });
      return;
    }
    while (cells.length < COLUMNS.length) cells.push("");
    const [dateRaw, startRaw, endRaw, location, meetRaw, title, content, note] = cells;

    const errors: string[] = [];
    const warnings: string[] = [];
    const date = parseDate(dateRaw, opts.termStart, today);
    if (!dateRaw) errors.push("沒有日期");
    else if ("error" in date) errors.push(date.error);
    const start = parseTime(startRaw);
    const end = parseTime(endRaw);
    const meet = parseTime(meetRaw);
    if (!startRaw) errors.push("沒有開始時間");
    else if (start === null) errors.push(`開始時間「${startRaw}」看不懂`);
    if (!endRaw) errors.push("沒有結束時間");
    else if (end === null) errors.push(`結束時間「${endRaw}」看不懂`);
    if (meetRaw && meet === null) errors.push(`集合時間「${meetRaw}」看不懂`);

    if (start && end) {
      const len = minutes(end) - minutes(start);
      if (len <= 0) errors.push("結束時間要在開始之後（不能跨過半夜）");
      else if (len > MAX_HOURS * 60) errors.push(`一次練習最長 ${MAX_HOURS} 小時`);
    }
    if (start && meet) {
      const before = minutes(start) - minutes(meet);
      if (before < 0) errors.push("集合時間要在開始之前");
      else if (before > MAX_MEET_BEFORE_HOURS * 60) errors.push("集合時間離開始太久了");
    }
    if (location.length > LIMITS.location) errors.push(`地點最多 ${LIMITS.location} 個字`);
    if (title.length > LIMITS.title) errors.push(`標題最多 ${LIMITS.title} 個字`);
    if (content.length > LIMITS.content) errors.push(`內容最多 ${LIMITS.content} 個字`);
    if (note.length > LIMITS.note) errors.push(`備註最多 ${LIMITS.note} 個字`);

    if ("day" in date && start) {
      const key = `${date.day}|${start}`;
      const first = seen.get(key);
      if (first !== undefined) errors.push(`跟第 ${first} 行重複（同一天、同一個開始時間）`);
      else seen.set(key, lineNo);
    }

    if (errors.length || !("day" in date) || !start || !end) {
      out.lines.push({ line: lineNo, raw: rawLine, ok: false, errors });
      return;
    }
    if (date.day < ymd(today)) warnings.push("這天已經過了");
    if (opts.termStart && date.day < opts.termStart) warnings.push("在期間開始之前");
    if (opts.termEnd && date.day > opts.termEnd) warnings.push("在期間結束之後");
    out.lines.push({ line: lineNo, raw: rawLine, ok: true, warnings,
      value: { date: date.day, start, end, location, meet: meet ?? "", title, content, note } });
  });

  return out;
}

/** 解析成功的資料（給預覽、建立用）。 */
export function okDrafts(r: ParseResult): Draft[] {
  return r.lines.flatMap((l) => (l.ok ? [l.value] : []));
}

// ---------------------------------------------------------------- 日期、時間

/** 全形數字、冒號、斜線 → 半形（只用在日期、時間欄位，內容不動）。 */
function narrow(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, "");
}

function looksLikeDate(s: string): boolean {
  return /^(\d{4}[-/.年])?\d{1,2}[-/.月]\d{1,2}/.test(narrow(s));
}

/**
 * 日期：2026-10-13、2026/10/13、2026.10.13、2026年10月13日、10/13、10月13日；
 * 後面可以接星期（（二）、(週二)、星期二、週二），有寫就檢查對不對得上（抓 AI 算錯日期最有用）。
 * 沒寫年份：用期間開始那年（沒有就用今天那年）；如果算出來比期間開始早超過 60 天，就是隔年（例如 1 月的練習）。
 */
export function parseDate(raw: string, termStart?: string, today: Date = new Date()): { day: string } | { error: string } {
  let s = narrow(raw);
  let weekday: number | null = null;
  // 星期要有「週／星期／禮拜」或括號才算（「13日」的「日」是日期，不是星期日）
  const w = s.match(/^(.+?)[(（]?(?:週|周|星期|禮拜)([日天一二三四五六])[)）]?$/) ?? s.match(/^(.+?)[(（]([日天一二三四五六])[)）]$/);
  if (w) {
    weekday = Math.max(0, "天一二三四五六".indexOf(w[2]));   // 日、天 = 0（indexOf 找不到「日」回 -1）
    s = w[1];
  }
  s = s.replace(/日$/, "");
  let y: number, m: number, d: number;
  const full = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})$/);
  if (full) {
    [y, m, d] = [Number(full[1]), Number(full[2]), Number(full[3])];
  } else {
    const short = s.match(/^(\d{1,2})[-/.月](\d{1,2})$/);
    if (!short) return { error: `日期「${raw}」看不懂（請用 YYYY-MM-DD）` };
    [m, d] = [Number(short[1]), Number(short[2])];
    const base = parseIsoDay(termStart ?? "") ?? new Date(today.getFullYear(), today.getMonth(), today.getDate());
    y = base.getFullYear();
    const guess = new Date(y, m - 1, d);
    if (guess.getTime() < base.getTime() - 60 * 86400000) y += 1;
  }
  const dt = new Date(y, m - 1, d);
  if (m < 1 || m > 12 || dt.getMonth() !== m - 1 || dt.getDate() !== d) return { error: `沒有「${raw}」這一天` };
  const days = (dt.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000;
  if (days < -366 || days > 731) return { error: `日期「${raw}」離今天太遠了，年份是不是打錯了？` };
  if (weekday !== null && dt.getDay() !== weekday) {
    return { error: `${ymd(dt)} 是星期${WEEK[dt.getDay()]}，不是星期${WEEK[weekday]}，日期是不是算錯了？` };
  }
  return { day: ymd(dt) };
}

/**
 * 時間 → "HH:MM"；空的或看不懂回傳 null。
 * 接受：19:00、7:00、19:00:00、1900、19點、19點30分、7點半、19時、下午7:00、晚上7點、7:00 PM、7pm、中午12點。
 */
export function parseTime(raw: string): string | null {
  let s = narrow(raw).toLowerCase();
  if (!s) return null;
  let pm: boolean | null = null;
  const pre = s.match(/^(上午|早上|清晨|凌晨|中午|下午|傍晚|晚上|夜間)/);
  if (pre) {
    pm = !["上午", "早上", "清晨", "凌晨"].includes(pre[1]);
    if (pre[1] === "中午") pm = null; // 中午 12 點 = 12:00、中午 1 點 = 13:00，下面處理
    s = s.slice(pre[1].length);
    if (pre[1] === "中午") s = "noon" + s;
  }
  const suf = s.match(/(am|pm|a\.m\.|p\.m\.)$/);
  if (suf) { pm = suf[1].startsWith("p"); s = s.slice(0, -suf[1].length); }
  const noon = s.startsWith("noon");
  if (noon) s = s.slice(4);

  let h: number, mi: number;
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) { h = Number(m[1]); mi = Number(m[2]); }
  else if ((m = s.match(/^(\d{2})(\d{2})$/))) { h = Number(m[1]); mi = Number(m[2]); }
  else if ((m = s.match(/^(\d{1,2})(?:點|時)(?:(\d{1,2})分?|半)?$/))) {
    h = Number(m[1]); mi = s.endsWith("半") ? 30 : Number(m[2] ?? 0);
  }
  else if ((m = s.match(/^(\d{1,2})$/)) && (pm !== null || noon)) { h = Number(m[1]); mi = 0; }
  else return null;

  if (noon) { if (h >= 1 && h <= 11) h += 12; }
  else if (pm === true && h < 12) h += 12;
  else if (pm === false && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return `${pad(h)}:${pad(mi)}`;
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → 那天 00:00（當地時間）；格式不對回傳 null。 */
export function parseIsoDay(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** ISO 時間在當地是哪一天（YYYY-MM-DD），用來比對「那天已經有練習」。 */
export function localDay(iso: string): string {
  return ymd(new Date(iso));
}

// ---------------------------------------------------------------- 3. 送出前

export type PracticeRow = {
  starts_at: string; ends_at: string; meet_at: string | null;
  location: string; title: string; content: string; note: string;
};

/** 那一天、那個時間在使用者電腦的時區是 UTC 加幾小時（例如台灣 "+08:00"）。 */
export function localOffset(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const off = -new Date(y, m - 1, d, h, mi).getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

/** 解析好的資料 → save_practices 的 items。offsetFor 可以換掉（測試用固定的 +08:00）。 */
export function toRpcRows(drafts: Draft[], offsetFor: (date: string, time: string) => string = localOffset): PracticeRow[] {
  const at = (date: string, time: string) => `${date}T${time}:00${offsetFor(date, time)}`;
  return drafts.map((x) => ({
    starts_at: at(x.date, x.start),
    ends_at: at(x.date, x.end),
    meet_at: x.meet ? at(x.date, x.meet) : null,
    location: x.location, title: x.title, content: x.content, note: x.note,
  }));
}

/** 哪幾筆的日子已經有練習（預覽時標出來、預設不勾，跟固定練習「那天已經有就跳過」同一個規則）。 */
export function clashIndexes(drafts: Draft[], existingStarts: string[]): Set<number> {
  const busy = new Set(existingStarts.map(localDay));
  const out = new Set<number>();
  drafts.forEach((x, i) => { if (busy.has(x.date)) out.add(i); });
  return out;
}
