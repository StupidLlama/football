"use client";
// AI 匯入練習（網站不串接 AI）：
//   ① 填基本資訊 → ② 複製「給 AI 的指令」，連同課表／賽程貼給自己用的 AI → ③ 把 AI 的回答貼回來 → ④ 預覽、確認才建立
// 格式錯的那一行會標出原因（文字框可以直接改，預覽即時更新），不會整批失敗；那天已經有練習的預設不建立。
import { useMemo, useRef, useState } from "react";
import { savePractices, type Practice } from "@/lib/api";
import { addDays, dayLabel, dayOf } from "@/lib/calendar";
import { announceText } from "@/lib/practices";
import {
  MAX_ROWS, buildPrompt, clashIndexes, okDrafts, parseImport, toRpcRows, type ImportInfo,
} from "@/lib/practice-import";
import { message } from "@/lib/status";
import { PanelBack, useDirty, useLeave } from "./back-button";
import { ErrorBox } from "./ui";
import { NO_NOTIFY, NotifyBoxes, notifyArgs, notifyDone, type Notify } from "./notify-boxes";

export function PracticeImportPanel({ teamId, teamName, existing, lastLocation, today, onSaved, onCancel }: {
  teamId: string; teamName: string; existing: Practice[]; lastLocation: string; today: Date;
  onSaved: (count: number, tail: string) => void; onCancel: () => void;
}) {
  const todayStr = dayOf(today);
  const [info, setInfo] = useState<ImportInfo>({
    teamName, termStart: todayStr, termEnd: addDays(todayStr, 120), location: lastLocation, usual: "", extra: "",
  });
  const [pasted, setPasted] = useState("");
  const [choice, setChoice] = useState<Record<string, boolean>>({});   // 使用者手動勾或取消的（key = 日期|開始）
  const [notify, setNotify] = useState<Notify>(NO_NOTIFY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const dirty = useDirty([info.usual, info.extra, pasted, choice, notify]);
  const { leave, dialog } = useLeave(dirty, onCancel);

  const prompt = useMemo(() => buildPrompt(info), [info]);
  const parsed = useMemo(() => parseImport(pasted, { termStart: info.termStart, termEnd: info.termEnd, today }),
    [pasted, info.termStart, info.termEnd, today]);
  const drafts = useMemo(() => okDrafts(parsed), [parsed]);
  const clash = useMemo(() => clashIndexes(drafts, existing.map((p) => p.starts_at)), [drafts, existing]);
  const keyOf = (i: number) => `${drafts[i].date}|${drafts[i].start}`;
  const checked = (i: number) => choice[keyOf(i)] ?? !clash.has(i);
  const picked = drafts.map((_, i) => i).filter(checked);
  const bad = parsed.lines.filter((l) => !l.ok);
  const rows = toRpcRows(picked.map((i) => drafts[i]));
  const defaultText = announceText("batch", rows);

  const set = <K extends keyof ImportInfo>(k: K, v: ImportInfo[K]) => setInfo((x) => ({ ...x, [k]: v }));

  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { promptRef.current?.select(); setError("這個瀏覽器不能自動複製，已經幫你選好文字，請按 Ctrl+C（手機：長按 → 拷貝）"); }
  }

  async function create() {
    if (!rows.length) { setError("沒有要建立的練習"); return; }
    if ((notify.chat || notify.discord) && !notify.text.trim()) { setError("勾了通知，請寫要通知的內容"); return; }
    setBusy(true); setError("");
    try {
      let made = 0;
      let tail = "";
      for (let at = 0; at < rows.length; at += MAX_ROWS) {
        const chunk = rows.slice(at, at + MAX_ROWS);
        // 通知只跟著第一批發，不然超過 60 筆時隊友會收到好幾則
        const r = await savePractices(teamId, chunk, at === 0 ? { ...notifyArgs(notify) } : {});
        if (r.status !== "ok") {
          const idx = r.row ? picked[at + r.row - 1] : null;
          const where = idx !== null && idx !== undefined ? `（${dayLabel(drafts[idx].date)} ${drafts[idx].start} 那一筆）` : "";
          setError(`${made ? `已經建立前 ${made} 筆；` : ""}${message(r)}${where}`);
          if (made) onSaved(made, "");
          return;
        }
        made += r.count ?? chunk.length;
        if (at === 0) tail = notifyDone(r, notify);
      }
      onSaved(made, tail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel pad stack" style={{ gap: 16 }}>
      <PanelBack onBack={leave} disabled={busy} />
      {dialog}
      <div>
        <h2 style={{ margin: 0, fontSize: 20 }}>用 AI 匯入練習</h2>
        <p className="faint" style={{ margin: "4px 0 0", fontSize: 13 }}>
          網站不會連到任何 AI，也不會看到你的課表。你把指令和課表貼給自己用的 AI（ChatGPT、Claude⋯），它回答後再貼回來。
        </p>
      </div>
      {error && <ErrorBox text={error} />}

      <section className="stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>① 填基本資訊</h3>
        <div className="grid2" style={{ gap: 12 }}>
          <label className="label">隊名<input className="field" value={info.teamName} onChange={(e) => set("teamName", e.target.value)} /></label>
          <label className="label">常用球場（資料上沒寫地點就用這個）<input className="field" value={info.location} maxLength={60}
            onChange={(e) => set("location", e.target.value)} /></label>
          <label className="label">學期第一天<input className="field" type="date" value={info.termStart} onChange={(e) => set("termStart", e.target.value)} /></label>
          <label className="label">學期最後一天<input className="field" type="date" value={info.termEnd} onChange={(e) => set("termEnd", e.target.value)} /></label>
        </div>
        <label className="label">平常的練習時段（選填）<input className="field" value={info.usual} placeholder="例如：每週二、四 19:00–21:00"
          onChange={(e) => set("usual", e.target.value)} /></label>
        <label className="label">其他說明（選填）<input className="field" value={info.extra} placeholder="例如：期中考週（11/2–11/6）停練"
          onChange={(e) => set("extra", e.target.value)} /></label>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>② 複製指令，貼給 AI（再附上課表或賽程的圖片／文字）</h3>
        <textarea ref={promptRef} className="field" readOnly rows={8} value={prompt} aria-label="給 AI 的指令"
          style={{ fontSize: 13, lineHeight: 1.5 }} onFocus={(e) => e.currentTarget.select()} />
        <div className="chips">
          <button type="button" className="btn btn-main btn-sm" onClick={copy}>{copied ? "已複製 ✓" : "複製指令"}</button>
        </div>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>③ 把 AI 的回答貼回來</h3>
        <textarea className="field" rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="AI 的回答"
          placeholder={"日期|開始|結束|地點|集合|標題|內容|備註\n2026-10-13|19:00|21:00|光復操場|18:45|練習||"}
          style={{ fontSize: 14, lineHeight: 1.5 }} />
        {!!parsed.comments.length && (
          <div className="status warn" style={{ margin: 0 }}>
            <b>AI 留的說明：</b>
            <ul style={{ margin: "4px 0 0", paddingLeft: "1.2em" }}>{parsed.comments.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        )}
      </section>

      {pasted.trim() && (
        <section className="stack" style={{ gap: 8 }} aria-live="polite">
          <h3 style={{ margin: 0, fontSize: 16 }}>④ 預覽（確認後才會建立）</h3>
          <p style={{ margin: 0 }}>
            看懂 <b>{drafts.length}</b> 行{bad.length > 0 && <>，有問題 <b className="accent">{bad.length}</b> 行</>}
            {clash.size > 0 && <span className="faint">，其中 {clash.size} 行那天已經有練習（預設不建立）</span>}
          </p>

          {bad.map((l) => !l.ok && (
            <div key={`bad${l.line}`} className="imp-line bad">
              <b>第 {l.line} 行有問題</b>：{l.errors.join("；")}
              <div><code>{l.raw.trim()}</code></div>
              <span className="faint" style={{ fontSize: 12 }}>直接在上面的文字框改這一行，這裡會即時更新。</span>
            </div>
          ))}

          <div className="stack" style={{ gap: 6 }}>
            {drafts.map((d, i) => {
              const line = parsed.lines.find((l) => l.ok && l.value === d);
              const warns = line && line.ok ? line.warnings : [];
              return (
                <label key={`${d.date}|${d.start}`} className="check imp-line" style={{ alignItems: "center" }}>
                  <input type="checkbox" checked={checked(i)} onChange={(e) => setChoice((c) => ({ ...c, [keyOf(i)]: e.target.checked }))} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{dayLabel(d.date)} {d.start}–{d.end}</b>
                    {d.meet && <span className="faint">　集合 {d.meet}</span>}
                    {d.location && <span className="faint">　{d.location}</span>}
                    {d.title && <span className="faint">　{d.title}</span>}
                    {d.content && <span className="faint" style={{ display: "block", fontSize: 13 }}>{d.content}</span>}
                    {clash.has(i) && <span className="accent" style={{ display: "block", fontSize: 13 }}>這天已經有練習</span>}
                    {warns.map((w) => <span key={w} className="accent" style={{ display: "block", fontSize: 13 }}>{w}</span>)}
                  </span>
                </label>
              );
            })}
          </div>

          <NotifyBoxes teamId={teamId} value={notify} defaultText={defaultText} onChange={setNotify} />
        </section>
      )}

      <div className="chips">
        <button type="button" className="btn btn-main" disabled={busy || picked.length === 0} onClick={create}>
          {busy ? "建立中…" : picked.length ? `建立 ${picked.length} 次練習` : "建立"}
        </button>
        <button type="button" className="btn btn-line" onClick={leave} disabled={busy}>取消</button>
      </div>
    </div>
  );
}
