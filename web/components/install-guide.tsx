"use client";
// v2.11.2：「加到手機主畫面」教學視窗。
// - InstallGuideLink：側邊欄和設定頁的按鈕，按了打開教學（已經從主畫面打開時不顯示）
// - InstallGuideAuto：第一次用手機登入後自動跳一次（記在這台裝置的 localStorage）
// Android Chrome 支援「一鍵安裝」（beforeinstallprompt）時，視窗裡多一個「直接安裝」按鈕。
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AFTER, STEPS, installKind, platformOf, shouldAutoShow, tipFor, type Platform } from "@/lib/install-guide";
import { browserNotice } from "@/lib/browser-notice";
import { useUpdateNotice } from "./updates";

const KEY = "fap.installGuideSeen";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Chrome 在頁面載入後不久就會丟出這個事件，只有一次；要在模組載入時就開始聽（providers 會 import 這個檔）。
let deferred: InstallPrompt | null = null;
const subs = new Set<() => void>();
function emit() { subs.forEach((f) => f()); }
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPrompt; emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; emit(); });
}
function useInstallPrompt(): InstallPrompt | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => deferred, () => null);
}

function isStandalone(): boolean {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch { return false; }
}
function seen(): boolean {
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return true; } // 讀不到就不自動跳，免得每次都跳
}
function remember() {
  try { window.localStorage.setItem(KEY, "1"); } catch { /* 私密模式：不影響 */ }
}

export function InstallGuideDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  const prompt = useInstallPrompt();
  const [env] = useState(() => {
    const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
    const kind = installKind(ua, typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints ?? 0);
    return { kind, platform: platformOf(kind, ua) };
  });
  const [tab, setTab] = useState<Platform>(env.platform);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } }
    ok.current?.focus(); // showModal 會先把焦點放在第一個按鈕（iPhone 分頁），改放到「知道了」
  }, []);
  const close = () => { remember(); ref.current?.close(); onClose(); };
  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    deferred = null; emit();
    if (outcome === "accepted") close();
  };
  const tip = tipFor(env.kind);
  return (
    <dialog ref={ref} className="update-pop" aria-labelledby="install-pop-h" onCancel={(e) => { e.preventDefault(); close(); }}>
      <h2 id="install-pop-h" style={{ margin: "0 0 4px", fontSize: 24, lineHeight: 1.3 }}>把 Potato 加到手機主畫面</h2>
      <p className="muted" style={{ margin: "0 0 16px", fontSize: 15 }}>加好之後，主畫面會有一個圖示，點了就打開，沒有網址列，用起來跟 App 一樣。</p>
      {tip && <p className="install-tip">{tip}</p>}
      {prompt && env.kind === "android" && (
        <button type="button" className="btn btn-main btn-wide" onClick={install} style={{ marginBottom: 16 }}>直接安裝到這支手機</button>
      )}
      <div role="radiogroup" aria-label="手機種類" className="chips" style={{ marginBottom: 12 }}>
        {(["ios", "android"] as const).map((p) => (
          <button key={p} type="button" role="radio" className="chip" aria-checked={tab === p} onClick={() => setTab(p)}>
            {p === "ios" ? "iPhone／iPad" : "Android"}
          </button>
        ))}
      </div>
      <ol className="install-steps">
        {STEPS[tab].map((t) => <li key={t}>{t}</li>)}
      </ol>
      <p className="faint" style={{ margin: "12px 0 0", fontSize: 14 }}>{AFTER[tab]}</p>
      <div className="chips" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <button ref={ok} type="button" className="btn btn-main" onClick={close}>知道了</button>
      </div>
    </dialog>
  );
}

/** 側邊欄（className="side-item"）或一般按鈕。已經從主畫面打開時不顯示。 */
export function InstallGuideLink({ className = "side-item", onGo }: { className?: string; onGo?: () => void }) {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setShow(!isStandalone()); }, []);
  if (!show) return null;
  const side = className === "side-item";
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {side ? <><span aria-hidden="true" className="ico">⊕</span><span style={{ flex: 1 }}>加到手機主畫面</span></> : "怎麼加到手機主畫面"}
      </button>
      {open && <InstallGuideDialog onClose={() => { setOpen(false); onGo?.(); }} />}
    </>
  );
}

/** 第一次用手機登入後自動跳一次。同時有「有新功能」或瀏覽器提醒要跳的時候先讓它們，下次換頁再跳。 */
export function InstallGuideAuto() {
  const { popup } = useUpdateNotice();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (popup) return;
    const ua = navigator.userAgent, touch = navigator.maxTouchPoints ?? 0;
    const n = browserNotice(ua, touch);
    let noticePending = false;
    try { noticePending = !!n && window.localStorage.getItem("fap.browserNoticeSeen") !== n.kind; } catch { noticePending = !!n; }
    if (noticePending) return;
    if (shouldAutoShow(installKind(ua, touch), isStandalone(), seen())) setOpen(true);
  }, [popup]);
  if (!open) return null;
  return <InstallGuideDialog onClose={() => setOpen(false)} />;
}
