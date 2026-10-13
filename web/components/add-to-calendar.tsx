"use client";
// v2.9「加到日曆」按鈕：在瀏覽器裡產生 .ics 檔下載（lib/ics.ts），手機點開會問要不要加到行事曆。
// 不經過伺服器、不需要日曆權限。
import { buildIcs, icsFileName, type CalEvent } from "@/lib/ics";
import { useToast } from "./ui";

export function AddToCalendar({ events, calName, fileName, label = "加到日曆", small = true }: {
  events: CalEvent[]; calName: string; fileName: string; label?: string; small?: boolean;
}) {
  const say = useToast();
  const download = () => {
    if (events.length === 0) { say("沒有還沒結束的練習或比賽"); return; }
    const blob = new Blob([buildIcs(events, calName)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = icsFileName(fileName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    say(events.length > 1 ? `已下載 ${events.length} 個行程，打開檔案就能加到日曆` : "已下載，打開檔案就能加到日曆");
  };
  return (
    <button type="button" className={`btn btn-line${small ? " btn-sm" : ""}`} onClick={download}>
      <span aria-hidden="true">📅 </span>{label}
    </button>
  );
}
