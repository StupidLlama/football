// v2.9：練習、比賽「加到日曆」（.ics 檔，Google 日曆、iPhone 行事曆、Outlook 都吃得下）。
// 網站只產生檔案讓使用者下載，不串 Google 日曆、不需要任何權限。提醒通知等之後接 LINE 機器人再做，
// 所以這裡刻意不放 VALARM（日曆 App 自己的提醒，使用者匯入後可以自己設）。
// 純計算：不 import React / Supabase，node --test 可以直接測。
import type { Match, Practice } from "./api.ts";
import { hhmm, titleOf } from "./practices.ts";

export type CalEvent = {
  uid: string;
  start: string;      // ISO 時間
  end: string;        // ISO 時間
  title: string;
  location?: string;
  description?: string;
};

const PRODID = "-//Football Analysis Potato//TW";
const DOMAIN = "football-analysis-potato";
/** 比賽沒有結束時間：預設 2 小時（熱身＋比賽＋收拾）。 */
export const MATCH_HOURS = 2;

/** 2026-10-13T11:00:00Z → 20261013T110000Z（一律用 UTC，日曆 App 會換成手機的時區）。 */
export function icsTime(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 文字欄位要跳脫：反斜線、分號、逗號、換行。 */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** 一行超過 75 個位元組要折行（下一行開頭加一個空白）；中文一個字 3 個位元組，不能從字中間切。 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;   // 折下去的行開頭有一個空白
    if (bytes + n > limit) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(events: CalEvent[], calName: string, now: Date = new Date()): string {
  const stamp = icsTime(now.toISOString());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${PRODID}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@${DOMAIN}`, `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(e.start)}`, `DTEND:${icsTime(e.end)}`, `SUMMARY:${escapeText(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function practiceEvent(p: Practice, teamName: string): CalEvent {
  const desc = [p.meet_at ? `集合 ${hhmm(p.meet_at)}` : "", p.content, p.note].filter((x) => x.trim()).join("\n");
  return {
    uid: `practice-${p.id}`, start: p.starts_at, end: p.ends_at,
    title: `${teamName}｜${titleOf(p)}`, location: p.location || undefined, description: desc || undefined,
  };
}

export function matchEvent(m: Match, teamName: string): CalEvent {
  const end = new Date(new Date(m.kickoff).getTime() + MATCH_HOURS * 3600_000).toISOString();
  const desc = [
    m.meet_at ? `集合 ${hhmm(m.meet_at)}` : "",
    m.jersey ? `球衣 ${m.jersey}` : "",
    `${m.size} 人制`,
    m.note,
  ].filter((x) => x.trim()).join("\n");
  return {
    uid: `match-${m.id}`, start: m.kickoff, end,
    title: `${teamName}｜比賽 vs ${m.opponent}`, location: m.location || undefined, description: desc,
  };
}

/** 整季：還沒結束的練習和比賽（已經過去的不放，日曆才不會塞滿舊東西），依時間排。 */
export function seasonEvents(practices: Practice[], matches: Match[], teamName: string, now: Date = new Date()): CalEvent[] {
  const t = now.getTime();
  return [
    ...practices.filter((p) => new Date(p.ends_at).getTime() >= t).map((p) => practiceEvent(p, teamName)),
    ...matches.filter((m) => new Date(m.kickoff).getTime() + MATCH_HOURS * 3600_000 >= t).map((m) => matchEvent(m, teamName)),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/** 檔名：不能有斜線這類符號。 */
export function icsFileName(name: string): string {
  return `${name.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "calendar"}.ics`;
}
