"use client";
// 不是 iOS Safari 的手機／平板：每一種情況只跳一次（記在這台裝置的 localStorage，讀不到就每次都提醒）。
import { useEffect, useRef, useState } from "react";
import { browserNotice, type BrowserNotice } from "@/lib/browser-notice";

const KEY = "fap.browserNoticeSeen";

function seen(kind: string): boolean {
  try { return window.localStorage.getItem(KEY) === kind; } catch { return false; }
}
function remember(kind: string) {
  try { window.localStorage.setItem(KEY, kind); } catch { /* 私密模式：下次再提醒一次而已 */ }
}

export function BrowserNoticePopup() {
  const [notice, setNotice] = useState<BrowserNotice | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const n = browserNotice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
    if (n && !seen(n.kind)) setNotice(n);
  }, []);
  useEffect(() => {
    const d = ref.current;
    if (notice && d && !d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } }
  }, [notice]);
  if (!notice) return null;
  const close = () => { remember(notice.kind); ref.current?.close(); setNotice(null); };
  return (
    <dialog ref={ref} className="update-pop" aria-labelledby="browser-pop-h" onCancel={close}>
      <h2 id="browser-pop-h" style={{ margin: "0 0 12px", fontSize: 24, lineHeight: 1.3 }}>{notice.title}</h2>
      <ul style={{ margin: 0, paddingLeft: "1.2em", display: "flex", flexDirection: "column", gap: 6 }}>
        {notice.items.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <div className="chips" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-main" onClick={close} autoFocus>知道了</button>
      </div>
    </dialog>
  );
}
