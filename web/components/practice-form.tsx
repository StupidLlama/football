"use client";
// 新增／編輯一次練習（球隊管理員）：日期、開始和結束時間、集合時間、地點、標題、內容、備註。
// 手機上：欄位都是原生的日期、時間選擇器，一個一個點就好。
import { useState, type FormEvent } from "react";
import { savePractice, type Practice } from "@/lib/api";
import { dayOf } from "@/lib/calendar";
import { announceText, hhmm, practiceDay } from "@/lib/practices";
import { toRpcRows, type Draft } from "@/lib/practice-import";
import { message } from "@/lib/status";
import { PanelBack, useDirty, useLeave } from "./back-button";
import { ErrorBox } from "./ui";
import { NO_NOTIFY, NotifyBoxes, notifyArgs, notifyDone, type Notify } from "./notify-boxes";

export function PracticeForm({ teamId, practice, day, lastLocation, onSaved, onCancel }: {
  teamId: string; practice: Practice | null;
  /** 新增時預設的日期（月曆上選到的那天） */
  day: string;
  /** 新增時預設的地點（這一隊最近用的地點） */
  lastLocation: string;
  onSaved: (id: string, tail: string, day: string) => void; onCancel: () => void;
}) {
  const [date, setDate] = useState(practice ? practiceDay(practice) : day);
  const [start, setStart] = useState(practice ? hhmm(practice.starts_at) : "19:00");
  const [end, setEnd] = useState(practice ? hhmm(practice.ends_at) : "21:00");
  const [meet, setMeet] = useState(practice?.meet_at ? hhmm(practice.meet_at) : "");
  const [location, setLocation] = useState(practice ? practice.location : lastLocation);
  const [title, setTitle] = useState(practice?.title ?? "");
  const [content, setContent] = useState(practice?.content ?? "");
  const [note, setNote] = useState(practice?.note ?? "");
  const [notify, setNotify] = useState<Notify>(NO_NOTIFY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = useDirty([date, start, end, meet, location, title, content, note, notify]);
  const { leave, ask } = useLeave(dirty, onCancel);

  const draft: Draft = { date, start, end, meet, location: location.trim(), title: title.trim(), content: content.trim(), note: note.trim() };
  const row = date && start && end ? toRpcRows([draft])[0] : null;
  const defaultText = row ? announceText(practice ? "update" : "new", [row]) : "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!row) { setError("請填日期、開始和結束時間"); return; }
    if (end <= start) { setError("結束時間要在開始之後"); return; }
    if (meet && meet > start) { setError("集合時間要在開始之前"); return; }
    if ((notify.chat || notify.discord) && !notify.text.trim()) { setError("勾了通知，請寫要通知的內容"); return; }
    setBusy(true); setError("");
    try {
      const r = await savePractice({
        team: teamId, practice: practice?.id ?? null, startsAt: row.starts_at, endsAt: row.ends_at, meetAt: row.meet_at,
        location: row.location, title: row.title, content: row.content, note: row.note, ...notifyArgs(notify),
      });
      if (r.status === "ok" && r.id) onSaved(r.id, notifyDone(r, notify), date);
      else setError(message(r));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel pad stack" style={{ gap: 12 }}>
      <PanelBack onBack={() => leave("top")} disabled={busy} />
      {ask("top")}
      <h2 style={{ margin: 0, fontSize: 20 }}>{practice ? "編輯這次練習" : "新增練習"}</h2>
      {practice?.series_id && <p className="faint" style={{ margin: 0, fontSize: 13 }}>這是固定練習的其中一次，只會改這一次，其他次不受影響。</p>}
      {error && <ErrorBox text={error} />}
      <label className="label">日期<input className="field" type="date" value={date} required onChange={(e) => setDate(e.target.value)} /></label>
      <div className="grid2" style={{ gap: 12 }}>
        <label className="label">開始<input className="field" type="time" value={start} required onChange={(e) => setStart(e.target.value)} /></label>
        <label className="label">結束<input className="field" type="time" value={end} required onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <label className="label">集合時間（選填，要在開始之前）<input className="field" type="time" value={meet} onChange={(e) => setMeet(e.target.value)} /></label>
      <div className="grid2" style={{ gap: 12 }}>
        <label className="label">地點（選填）<input className="field" value={location} maxLength={60}
          onChange={(e) => setLocation(e.target.value)} placeholder="例如：光復操場" /></label>
        <label className="label">標題（選填，空白顯示「練習」）<input className="field" value={title} maxLength={20}
          onChange={(e) => setTitle(e.target.value)} placeholder="例如：體能、友誼賽" /></label>
      </div>
      <label className="label">內容、要帶的東西（選填）<textarea className="field" rows={3} maxLength={500} value={content}
        onChange={(e) => setContent(e.target.value)} placeholder="例如：傳接球、分組對抗；帶水和護脛" /></label>
      <label className="label">備註（選填）<input className="field" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></label>
      <NotifyBoxes teamId={teamId} value={notify} defaultText={defaultText} onChange={setNotify} />
      <div className="chips">
        <button type="submit" className="btn btn-main" disabled={busy}>{busy ? "儲存中…" : practice ? "儲存" : "建立練習"}</button>
        <button type="button" className="btn btn-line" onClick={() => leave("bottom")} disabled={busy}>取消</button>
      </div>
      {ask("bottom")}
    </form>
  );
}

/** 新增時的預設日期：選到的那天；沒選就是今天。 */
export function defaultDay(selected: string | null, now: Date): string {
  return selected ?? dayOf(now);
}
