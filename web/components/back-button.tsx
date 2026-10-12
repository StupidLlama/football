"use client";
// 返回鍵。兩種：
//  - BackButton：子頁用（比賽詳情、球員報告…）。有上一頁就回上一頁；沒有（例如直接開網址）就去 fallback 列表頁。
//  - PanelBack＋useLeave：同一頁展開的編輯面板用。改過內容再按返回或取消，會先問「放棄修改／繼續編輯」。
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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
 * 離開編輯面板（返回或取消）：沒改過就直接離開；改過就在按的那顆按鈕旁邊跳出提醒，
 * 「放棄修改」才真的離開，「繼續編輯」留下來。
 */
export function useLeave(dirty: boolean, onLeave: () => void) {
  const [asking, setAsking] = useState<"top" | "bottom" | null>(null);
  const leave = (where: "top" | "bottom") => { if (dirty) setAsking(where); else onLeave(); };
  const ask = (where: "top" | "bottom") => asking !== where ? null : (
    <div role="alert" className="status warn" style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
      <span style={{ flex: "1 1 200px" }}>你改的內容還沒儲存，離開就會不見。</span>
      <span className="chips">
        <button type="button" className="btn btn-danger btn-sm" onClick={onLeave}>放棄修改</button>
        <button type="button" className="btn btn-line btn-sm" onClick={() => setAsking(null)} autoFocus>繼續編輯</button>
      </span>
    </div>
  );
  return { leave, ask };
}

/** 表單有沒有被改過：跟第一次畫面上的內容比（JSON 字串）。 */
export function useDirty(value: unknown): boolean {
  const first = useRef<string | null>(null);
  const now = JSON.stringify(value);
  if (first.current === null) first.current = now;
  return now !== first.current;
}
