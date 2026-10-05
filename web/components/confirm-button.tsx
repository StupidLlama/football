"use client";
// 危險動作的按鈕：按第一下變成「確定？」，4 秒內再按一次才真的做。
import { useEffect, useState } from "react";

export function ConfirmButton({ label, confirm, onConfirm, className = "btn btn-danger btn-sm", disabled = false }: {
  label: string; confirm: string; onConfirm: () => void; className?: string; disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={className} disabled={disabled}
      style={armed ? { background: "#FB7185", color: "#2A0A10", borderColor: "#FB7185", fontWeight: 700 } : undefined}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirm : label}
    </button>
  );
}
