"use client";
// 返回鍵。兩種：
//  - BackButton：子頁用（比賽詳情、球員報告…）。有上一頁就回上一頁；沒有（例如直接開網址）就去 fallback 列表頁。
//  - PanelBack＋useLeave：同一頁展開的編輯面板用。改過內容再按返回或取消，會跳出視窗問「放棄修改／繼續編輯」。
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const CLASS = "btn btn-line btn-sm";

export function BackButton({ fallback, label = "返回" }: { fallback: string; label?: string }) {
  const router = useRouter();
  const go = () => {
    // history.length > 1：這個分頁有前一頁可以回；只有 1 代表直接開網址進來的
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button type="button" className={CLASS} onClick={go} aria-label={`${label}（回到上一頁）`}
      style={{ alignSelf: "flex-start" }}>‹ {label}</button>
  );
}

/** 編輯面板最上面的返回鍵（離開前要不要確認由 useLeave 決定）。 */
export function PanelBack({ onBack, disabled = false }: { onBack: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={CLASS} onClick={onBack} disabled={disabled} style={{ alignSelf: "flex-start" }}>‹ 返回</button>
  );
}

/**
 * 離開編輯面板（返回或取消）：沒改過就直接離開；改過就跳出確認視窗，
 * 「放棄修改」才真的離開，「繼續編輯」（或按 Esc）留下來。
 * 用法：const { leave, dialog } = useLeave(dirty, onCancel); 按鈕 onClick={leave}，畫面裡放 {dialog}。
 */
export function useLeave(dirty: boolean, onLeave: () => void) {
  const [asking, setAsking] = useState(false);
  const leave = () => { if (dirty) setAsking(true); else onLeave(); };
  const dialog = asking ? <LeaveDialog onLeave={onLeave} onStay={() => setAsking(false)} /> : null;
  return { leave, dialog };
}

/**
 * 「做某件事之前，有沒儲存的修改要先問」：例如組隊頁在編輯中切換到另一組陣容。
 * 用法：const { run, dialog } = useGuardedAction(dirty); onClick={() => run(() => loadRow(r))}
 */
export function useGuardedAction(dirty: boolean) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const run = (action: () => void) => { if (dirty) setPending(() => action); else action(); };
  const dialog = pending
    ? <LeaveDialog onStay={() => setPending(null)} onLeave={() => { const a = pending; setPending(null); a(); }} />
    : null;
  return { run, dialog };
}

function LeaveDialog({ onLeave, onStay }: { onLeave: () => void; onStay: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } }
  }, []);
  return (
    <dialog ref={ref} className="update-pop" aria-labelledby="leave-h" aria-describedby="leave-d"
      onCancel={(e) => { e.preventDefault(); onStay(); }} style={{ width: "min(420px, calc(100vw - 32px))" }}>
      <h2 id="leave-h" style={{ margin: "0 0 8px", fontSize: 22 }}>放棄修改？</h2>
      <p id="leave-d" className="muted" style={{ margin: 0 }}>你改的內容還沒儲存，離開就會不見。</p>
      <div className="chips" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-line" onClick={onStay} autoFocus>繼續編輯</button>
        <button type="button" className="btn btn-danger" onClick={onLeave}>放棄修改</button>
      </div>
    </dialog>
  );
}

/** 表單有沒有被改過：跟第一次畫面上的內容比（JSON 字串）。 */
export function useDirty(value: unknown): boolean {
  const first = useRef<string | null>(null);
  const now = JSON.stringify(value);
  if (first.current === null) first.current = now;
  return now !== first.current;
}

/**
 * 整頁的離開保護：有沒儲存的修改時，
 *  - 重新整理／關分頁：瀏覽器自己的確認（beforeunload）
 *  - 點側邊欄、頁尾這類站內連結：跳出跟 useLeave 一樣的「放棄修改？」視窗
 * 瀏覽器的「上一頁」按鈕攔不到（網頁沒辦法可靠地擋），所以不處理。
 * 用法：const guard = useLeaveGuard(dirty); 畫面裡放 {guard}。儲存成功後把 dirty 變 false 就不會再擋。
 */
export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const here = window.location.pathname + window.location.search;
      const next = url.pathname + url.search;
      if (next === here && !url.hash) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // 同頁錨點
      e.preventDefault();
      e.stopImmediatePropagation();
      setTarget(next + url.hash);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true); // capture：搶在 Next 的 Link 之前
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return target ? (
    <LeaveDialog onStay={() => setTarget(null)} onLeave={() => { const t = target; setTarget(null); router.push(t); }} />
  ) : null;
}
