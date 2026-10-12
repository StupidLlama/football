"use client";
// 更新提醒：記住這台裝置看過哪一版（瀏覽器的 localStorage，讀不到就當作沒有）。
// 第一次來的人直接記成最新版，不跳視窗；之後有「大更新」（big）沒看過 → 跳出 UpdatePopup；
// 任何沒看過的更新 → 「更新紀錄」旁邊的小圓點（UpdateDot）。
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LATEST, UPDATES, notice, type Update } from "@/lib/updates";

const KEY = "fap.seenVersion";
const EVENT = "fap-updates-seen";

function readSeen(): string | null {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}
function writeSeen(v: string) {
  try { window.localStorage.setItem(KEY, v); } catch { /* 私密模式等：只是下次可能再提醒一次 */ }
  window.dispatchEvent(new Event(EVENT));
}

/** popup／dot 和「標成已讀」。伺服器端和第一次畫面都是「沒提醒」，避免畫面閃動。 */
export function useUpdateNotice(): { popup: Update | null; dot: boolean; markSeen: () => void } {
  const [state, setState] = useState<{ popup: Update | null; dot: boolean }>({ popup: null, dot: false });
  useEffect(() => {
    const sync = () => {
      const seen = readSeen();
      if (seen === null) { writeSeen(LATEST); return; }
      setState(notice(UPDATES, seen));
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  const markSeen = useCallback(() => writeSeen(LATEST), []);
  return { ...state, markSeen };
}

export function UpdateDot() {
  const { dot } = useUpdateNotice();
  if (!dot) return null;
  return <span className="update-dot" aria-label="有新的更新" role="img" />;
}

/** 有沒看過的大更新時跳出來（原生 dialog：Esc 可關、焦點會留在視窗裡）。 */
export function UpdatePopup() {
  const { popup, markSeen } = useUpdateNotice();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (popup && d && !d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } }
  }, [popup]);
  if (!popup) return null;
  const close = () => { ref.current?.close(); markSeen(); };
  return (
    <dialog ref={ref} className="update-pop" aria-labelledby="update-pop-h" onClose={markSeen} onCancel={markSeen}>
      <p className="faint" style={{ margin: 0, fontSize: 14 }}>{popup.version} · {popup.date.replace(/-/g, "/")}</p>
      <h2 id="update-pop-h" style={{ margin: "4px 0 12px", fontSize: 26, lineHeight: 1.3 }}>有新功能：{popup.title}</h2>
      <ul style={{ margin: 0, paddingLeft: "1.2em", display: "flex", flexDirection: "column", gap: 6 }}>
        {popup.items.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <div className="chips" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <Link className="btn btn-line" href="/updates" onClick={close}>看完整更新紀錄</Link>
        <button type="button" className="btn btn-main" onClick={close} autoFocus>知道了</button>
      </div>
    </dialog>
  );
}
