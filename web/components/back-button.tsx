"use client";
// 返回鍵。兩種：
//  - BackButton：子頁用（比賽詳情、球員報告…）。有上一頁就回上一頁；沒有（例如直接開網址）就去 fallback 列表頁。
//  - PanelBack：同一頁展開的編輯面板用。dirty（有改過）時第一下變「放棄修改？」，再按一次才離開。
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { ConfirmButton } from "./confirm-button";

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

export function PanelBack({ onBack, dirty = false, disabled = false }: { onBack: () => void; dirty?: boolean; disabled?: boolean }) {
  if (dirty) {
    return (
      <ConfirmButton label="‹ 返回" confirm="放棄修改？" onConfirm={onBack} disabled={disabled} className={CLASS} />
    );
  }
  return (
    <button type="button" className={CLASS} onClick={onBack} disabled={disabled} style={{ alignSelf: "flex-start" }}>‹ 返回</button>
  );
}

/** 表單有沒有被改過：跟第一次畫面上的內容比（JSON 字串）。 */
export function useDirty(value: unknown): boolean {
  const first = useRef<string | null>(null);
  const now = JSON.stringify(value);
  if (first.current === null) first.current = now;
  return now !== first.current;
}
