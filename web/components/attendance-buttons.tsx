"use client";
// 出席／請假：手機用的大按鈕，一鍵完成。再點一次已選的那顆＝清掉（變回還沒回覆）。
import { useState } from "react";
import type { AttendanceAnswer } from "@/lib/api";

export function AttendanceButtons({ answer, locked, onAnswer }: {
  answer: AttendanceAnswer | null; locked: boolean; onAnswer: (next: AttendanceAnswer | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const tap = async (want: AttendanceAnswer) => {
    if (busy || locked) return;
    setBusy(true);
    try { await onAnswer(answer === want ? null : want); } finally { setBusy(false); }
  };

  if (locked) {
    return (
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        {answer === "in" ? "已登記出席" : answer === "out" ? "已登記請假" : "還沒回覆"}（比賽已經開始，不能再改；需要更正請找球隊管理員）
      </p>
    );
  }

  return (
    <div className="chips" role="group" aria-label="出席登記">
      <button type="button" className="btn btn-lg" disabled={busy} aria-pressed={answer === "in"} onClick={() => tap("in")}
        style={answer === "in" ? { background: "#2DD4BF", color: "#06201C", border: 0, fontWeight: 700 } : { border: "1px solid #2DD4BF", background: "transparent", color: "#86EFAC" }}>
        出席
      </button>
      <button type="button" className="btn btn-lg" disabled={busy} aria-pressed={answer === "out"} onClick={() => tap("out")}
        style={answer === "out" ? { background: "#FB7185", color: "#2A0A10", border: 0, fontWeight: 700 } : { border: "1px solid #FB7185", background: "transparent", color: "#FCA5A5" }}>
        請假
      </button>
    </div>
  );
}
