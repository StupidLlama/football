"use client";
// 練習月曆：一個月一頁，整週整週排。練習用青綠、本隊比賽用橘（比賽不能在這裡改，點了看詳細再跳到比賽頁）。
//   電腦：滑鼠移上去（或鍵盤聚焦）顯示小卡，點日期在旁邊展開完整內容
//   手機（沒有 hover）：格子太窄放不下字，改成小圓點，點日期看詳細
import { useMemo } from "react";
import type { PracticeAttendance } from "@/lib/api";
import { dayLabel, monthGrid, monthLabel, shiftMonth, weekHeader } from "@/lib/calendar";
import { answerOfPractice, hhmm, practiceCounts, timeRange, titleOf, type DayItems } from "@/lib/practices";
import { kickoffLabel } from "@/lib/matches";

type Props = {
  year: number; month: number; today: string; selected: string | null;
  items: Map<string, DayItems>;
  attendance: PracticeAttendance[]; myPlayerId: string | null; roster: number;
  onMonth: (year: number, month: number) => void;
  onSelect: (day: string) => void;
};

const MARK = { in: "✓ ", out: "✕ ", none: "" } as const;

export function PracticeCalendar({ year, month, today, selected, items, attendance, myPlayerId, roster, onMonth, onSelect }: Props) {
  const weeks = useMemo(() => monthGrid(year, month, today), [year, month, today]);
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const now = new Date();

  return (
    <div className="panel pad stack" style={{ gap: 12 }}>
      <div className="cal-head">
        <div className="chips">
          <button type="button" className="btn btn-line btn-sm" aria-label="上個月" onClick={() => onMonth(prev.year, prev.month)}>‹</button>
          <h2 className="cal-title" aria-live="polite">{monthLabel(year, month)}</h2>
          <button type="button" className="btn btn-line btn-sm" aria-label="下個月" onClick={() => onMonth(next.year, next.month)}>›</button>
        </div>
        <button type="button" className="btn btn-line btn-sm" onClick={() => { const d = today.split("-").map(Number); onMonth(d[0], d[1]); onSelect(today); }}>
          今天
        </button>
      </div>
      <div className="cal-legend" aria-hidden="true"><span><i className="prac" />練習</span><span><i className="match" />本隊比賽</span></div>

      <div className="cal-week" role="group" aria-label={monthLabel(year, month)}>
        {weekHeader().map((w) => <div key={w} className="cal-wd" aria-hidden="true">{w}</div>)}
        {weeks.flat().map((c) => {
          const it = items.get(c.day);
          const ps = it?.practices ?? [];
          const ms = it?.matches ?? [];
          const shown = [...ps.map((p) => ({ k: `p${p.id}`, kind: "prac" as const, p, m: null })),
                         ...ms.map((m) => ({ k: `m${m.id}`, kind: "match" as const, p: null, m }))];
          const label = `${dayLabel(c.day)}${ps.length ? `，${ps.length} 次練習` : ""}${ms.length ? `，${ms.length} 場比賽` : ""}`;
          return (
            <button key={c.day} type="button" className="cal-cell" aria-label={label}
              aria-pressed={selected === c.day} data-out={!c.inMonth} data-today={c.today} onClick={() => onSelect(c.day)}>
              <span className="cal-num">{Number(c.day.slice(8, 10))}</span>
              {shown.slice(0, 2).map((x) => {
                if (x.kind === "match") return <span key={x.k} className="cal-chip match">vs {x.m!.opponent}</span>;
                const a = myPlayerId ? answerOfPractice(attendance, x.p!.id, myPlayerId) : null;
                return <span key={x.k} className="cal-chip prac">{MARK[a ?? "none"]}{hhmm(x.p!.starts_at)} {titleOf(x.p!)}</span>;
              })}
              {shown.length > 2 && <span className="cal-more">還有 {shown.length - 2} 項</span>}
              {shown.length > 0 && (
                <span className="cal-dots" aria-hidden="true">
                  {shown.slice(0, 4).map((x) => <i key={x.k} className={x.kind} />)}
                </span>
              )}
              {shown.length > 0 && (
                <span className="cal-tip" role="tooltip">
                  {shown.map((x) => x.kind === "match" ? (
                    <span key={x.k} className="t-item" style={{ display: "block" }}>
                      <b>比賽 vs {x.m!.opponent}</b>
                      <span className="faint">{kickoffLabel(x.m!.kickoff)}{x.m!.location ? ` · ${x.m!.location}` : ""}</span>
                    </span>
                  ) : (() => {
                    const p = x.p!;
                    const cnt = practiceCounts(attendance, p.id, roster);
                    const a = myPlayerId ? answerOfPractice(attendance, p.id, myPlayerId) : null;
                    const upcoming = new Date(p.starts_at).getTime() > now.getTime();
                    return (
                      <span key={x.k} className="t-item" style={{ display: "block" }}>
                        <b>{titleOf(p)} {timeRange(p)}</b>
                        {p.location && <span className="faint" style={{ display: "block" }}>{p.location}</span>}
                        <span style={{ display: "block" }}>出席 {cnt.in}・請假 {cnt.out}・未回覆 {cnt.pending}</span>
                        {myPlayerId && (
                          <span className={a === "in" ? "mine-in" : a === "out" ? "mine-out" : upcoming ? "mine-none" : "faint"} style={{ display: "block" }}>
                            你：{a === "in" ? "出席" : a === "out" ? "請假" : "還沒回覆"}
                          </span>
                        )}
                      </span>
                    );
                  })())}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
