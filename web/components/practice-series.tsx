"use client";
// 建立固定練習（球隊管理員）：每週哪幾天、從哪天到哪天。按「建立」時就展開成一筆一筆，同一批共用系列編號：
// 單次可以單獨改、出席記在每一次上；那天已經有練習就跳過（預覽裡會列出來）。
import { useMemo, useState, type FormEvent } from "react";
import { savePractices } from "@/lib/api";
import { addDays, dayLabel, dayOf, WEEK_NAMES } from "@/lib/calendar";
import { announceText, expandSeries, practiceDays, type SeriesInput } from "@/lib/practices";
import { toRpcRows } from "@/lib/practice-import";
import { message } from "@/lib/status";
import type { Practice } from "@/lib/api";
import { ErrorBox } from "./ui";
import { NO_NOTIFY, NotifyBoxes, notifyArgs, notifyDone, type Notify } from "./notify-boxes";

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // 週一開頭

export function PracticeSeries({ teamId, existing, lastLocation, today, onSaved, onCancel }: {
  teamId: string; existing: Practice[]; lastLocation: string; today: Date;
  onSaved: (count: number, tail: string) => void; onCancel: () => void;
}) {
  const todayStr = dayOf(today);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(addDays(todayStr, 8 * 7));
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("21:00");
  const [meet, setMeet] = useState("");
  const [location, setLocation] = useState(lastLocation);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState<Notify>(NO_NOTIFY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const input: SeriesInput = { weekdays, from, to, start, end, meet, location, title, content, note };
  const preview = useMemo(() => expandSeries(input, practiceDays(existing)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekdays, from, to, start, end, meet, location, title, content, note, existing]);
  const rows = useMemo(() => toRpcRows(preview.drafts), [preview.drafts]);
  const defaultText = announceText("batch", rows);

  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (preview.problem) { setError(preview.problem); return; }
    if ((notify.chat || notify.discord) && !notify.text.trim()) { setError("勾了通知，請寫要通知的內容"); return; }
    setBusy(true); setError("");
    try {
      const r = await savePractices(teamId, rows, { series: true, ...notifyArgs(notify) });
      if (r.status === "ok") onSaved(r.count ?? rows.length, notifyDone(r, notify));
      else setError(message(r));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel pad stack" style={{ gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>建立固定練習</h2>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        會一次建立好一次一次的練習（例如每週二、四到學期末）。之後每一次都可以單獨改時間或地點、單獨記出席。
      </p>
      {error && <ErrorBox text={error} />}

      <div className="label">每週哪幾天
        <div className="chips" role="group" aria-label="每週哪幾天">
          {ORDER.map((d) => (
            <button key={d} type="button" className="chip" aria-pressed={weekdays.includes(d)} onClick={() => toggleDay(d)}>週{WEEK_NAMES[d]}</button>
          ))}
        </div>
      </div>
      <div className="grid2" style={{ gap: 12 }}>
        <label className="label">第一天<input className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="label">最後一天（含）<input className="field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="grid2" style={{ gap: 12 }}>
        <label className="label">開始<input className="field" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="label">結束<input className="field" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <label className="label">集合時間（選填）<input className="field" type="time" value={meet} onChange={(e) => setMeet(e.target.value)} /></label>
      <div className="grid2" style={{ gap: 12 }}>
        <label className="label">地點（選填）<input className="field" value={location} maxLength={60} onChange={(e) => setLocation(e.target.value)} /></label>
        <label className="label">標題（選填）<input className="field" value={title} maxLength={20} onChange={(e) => setTitle(e.target.value)} placeholder="空白顯示「練習」" /></label>
      </div>
      <label className="label">內容、要帶的東西（選填）<textarea className="field" rows={2} maxLength={500} value={content} onChange={(e) => setContent(e.target.value)} /></label>
      <label className="label">備註（選填）<input className="field" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></label>

      <div className="panel-2" style={{ background: "var(--panel-2)", borderRadius: 10, padding: "10px 12px" }} aria-live="polite">
        {preview.problem ? (
          <p className="accent" style={{ margin: 0 }}>{preview.problem}</p>
        ) : (
          <>
            <p style={{ margin: 0, fontWeight: 700 }}>會建立 {preview.drafts.length} 次練習</p>
            <p className="faint" style={{ margin: "2px 0 0", fontSize: 13 }}>
              {preview.drafts.slice(0, 6).map((d) => dayLabel(d.date)).join("、")}{preview.drafts.length > 6 ? ` … 到 ${dayLabel(preview.drafts.at(-1)!.date)}` : ""}
            </p>
          </>
        )}
        {preview.skipped.length > 0 && (
          <p className="faint" style={{ margin: "6px 0 0", fontSize: 13 }}>
            這 {preview.skipped.length} 天已經有練習，會跳過：{preview.skipped.map(dayLabel).join("、")}
          </p>
        )}
      </div>

      <NotifyBoxes teamId={teamId} value={notify} defaultText={defaultText} onChange={setNotify} />
      <div className="chips">
        <button type="submit" className="btn btn-main" disabled={busy || !!preview.problem}>
          {busy ? "建立中…" : preview.problem ? "建立" : `建立 ${preview.drafts.length} 次練習`}
        </button>
        <button type="button" className="btn btn-line" onClick={onCancel} disabled={busy}>取消</button>
      </div>
    </form>
  );
}
