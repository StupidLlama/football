"use client";
// 練習行事曆與出席（F11）：月曆（電腦版滑鼠移上去看摘要、點日期看詳細；手機版圓點、點日期看詳細）。
// 球隊管理員（和網站管理員）可以新增／編輯／刪除、建立固定練習、用 AI 匯入。
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Practice } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dayOf } from "@/lib/calendar";
import { answerOfPractice, groupByDay, practiceDay, practiceStatus, titleOf, whenText, byStart } from "@/lib/practices";
import { useTeamView } from "@/lib/team";
import { PracticeCalendar } from "@/components/practice-calendar";
import { PracticeDayPanel } from "@/components/practice-day-panel";
import { AddToCalendar } from "@/components/add-to-calendar";
import { seasonEvents } from "@/lib/ics";
import { PracticeForm } from "@/components/practice-form";
import { PracticeImportPanel } from "@/components/practice-import-panel";
import { PracticeSeries } from "@/components/practice-series";
import { useNow, useToast } from "@/components/ui";

type Mode = null | { kind: "form"; practice: Practice | null; day: string } | { kind: "series" } | { kind: "import" };

export default function PracticePage() {
  const { teamId } = useParams<{ teamId: string }>();
  const v = useTeamView();
  const auth = useAuth();
  const say = useToast();
  const now = useNow();
  const today = dayOf(now);
  const canManage = (v.isCoach || !!auth.profile?.is_admin) && !v.archived;   // 舊賽季只能看

  const [ym, setYm] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() + 1 }));
  const [selected, setSelected] = useState<string | null>(today);
  const [mode, setMode] = useState<Mode>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // 從首頁待辦點過來：/practice?day=2026-10-13 → 直接跳到那個月、選那一天
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("day");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) { setYm({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) }); setSelected(d); }
  }, []);
  useEffect(() => { if (mode) modeRef.current?.scrollIntoView({ block: "nearest" }); }, [mode]);

  const items = useMemo(() => groupByDay(v.data.practices, v.data.matches), [v.data.practices, v.data.matches]);
  const lastLocation = useMemo(
    () => [...v.data.practices].sort((a, b) => -byStart(a, b)).find((p) => p.location)?.location ?? "", [v.data.practices]);
  const myId = v.myPlayer?.id ?? null;
  const upcoming = useMemo(
    () => v.data.practices.filter((p) => practiceStatus(p, now) === "upcoming").sort(byStart).slice(0, 5), [v.data.practices, now]);

  const goDay = (day: string) => {
    setSelected(day);
    setYm({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) });
  };
  const pick = (day: string) => {
    setSelected(day);
    // 手機上詳細在月曆下面：點了之後捲到詳細
    setTimeout(() => detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 0);
  };
  const done = (text: string) => { setMode(null); say(text); return v.reload(); };

  const sel = selected ? items.get(selected) : undefined;

  return (
    <section className="stack" style={{ gap: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 className="hide-sm" style={{ margin: 0, fontSize: 30 }}>練習</h1>
        <div className="chips">
          {/* v2.9：還沒結束的練習和比賽一次加到日曆 */}
          <AddToCalendar events={seasonEvents(v.data.practices, v.data.matches, v.data.team.name, now)}
            calName={v.data.team.name} fileName={`${v.data.team.name}-${v.data.team.season ?? "行程"}`} label="整季加到日曆" />
        {canManage && (
          <>
            <button type="button" className="btn btn-main btn-sm" onClick={() => setMode({ kind: "form", practice: null, day: selected ?? today })}>＋ 新增練習</button>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setMode({ kind: "series" })}>固定練習</button>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setMode({ kind: "import" })}>用 AI 匯入</button>
          </>
        )}
        </div>
      </header>

      <div ref={modeRef}>
        {mode?.kind === "form" && (
          <PracticeForm key={mode.practice?.id ?? `new-${mode.day}`} teamId={teamId} practice={mode.practice} day={mode.day} lastLocation={lastLocation}
            onSaved={(_id, tail, day) => { goDay(day); done(`${mode.practice ? "已儲存" : "已建立練習"}${tail}`); }}
            onCancel={() => setMode(null)} />
        )}
        {mode?.kind === "series" && (
          <PracticeSeries teamId={teamId} existing={v.data.practices} lastLocation={lastLocation} today={now}
            onSaved={(n, tail) => done(`已建立 ${n} 次練習${tail}`)} onCancel={() => setMode(null)} />
        )}
        {mode?.kind === "import" && (
          <PracticeImportPanel teamId={teamId} teamName={v.data.team.name} existing={v.data.practices} lastLocation={lastLocation} today={now}
            onSaved={(n, tail) => done(`已匯入 ${n} 次練習${tail}`)} onCancel={() => setMode(null)} />
        )}
      </div>

      <div className="cal-layout">
        <PracticeCalendar year={ym.year} month={ym.month} today={today} selected={selected} items={items}
          attendance={v.data.practiceAttendance} myPlayerId={myId} roster={v.players.length}
          onMonth={(year, month) => setYm({ year, month })} onSelect={pick} />

        <div ref={detailRef} className="stack" style={{ gap: 16 }}>
          {selected ? (
            <PracticeDayPanel teamId={teamId} day={selected} practices={sel?.practices ?? []} matches={sel?.matches ?? []}
              canManage={canManage} now={now}
              onEdit={(p) => setMode({ kind: "form", practice: p, day: practiceDay(p) })}
              onAdd={(day) => setMode({ kind: "form", practice: null, day })} />
          ) : (
            <p className="faint">點月曆上的一天，看那天的練習。</p>
          )}

          <div className="panel pad stack" style={{ gap: 4 }}>
            <b>接下來的練習</b>
            {upcoming.length === 0 && <p className="faint" style={{ margin: 0 }}>目前沒有排定的練習。</p>}
            {upcoming.map((p) => {
              const a = myId ? answerOfPractice(v.data.practiceAttendance, p.id, myId) : null;
              return (
                <button key={p.id} type="button" className="note" onClick={() => { goDay(practiceDay(p)); pick(practiceDay(p)); }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {whenText(p)}
                    <span className="faint" style={{ marginLeft: 8, fontSize: 13 }}>{titleOf(p)}{p.location ? ` · ${p.location}` : ""}</span>
                  </span>
                  {myId && <span className={a === "in" ? "mine-in" : a === "out" ? "mine-out" : "mine-none"} style={{ fontSize: 13 }}>
                    {a === "in" ? "出席" : a === "out" ? "請假" : "未回覆"}
                  </span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
