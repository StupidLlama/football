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
