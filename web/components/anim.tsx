"use client";
// 圖表動畫：數字從舊值平滑變到新值（第一次從 0 長出來）。
// 使用者開了「減少動態效果」（手機或電腦的系統設定）時，直接顯示結果、不跑動畫。
import { useEffect, useRef, useState } from "react";
import { easeOutCubic, lerpArray, progress, sameValues } from "@/lib/anim";

/** 系統有沒有開「減少動態效果」。 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduce(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

/**
 * 一組數字的動畫：target 變了就從「現在畫面上的值」補間到新值。
 * from：第一次出現時從哪裡開始（預設全部 0 = 從中心長出來）。
 */
export function useTween(target: number[], { duration = 600, delay = 0, from }: { duration?: number; delay?: number; from?: number[] } = {}): number[] {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState<number[]>(() => from ?? target.map(() => 0));
  const shownRef = useRef(shown);
  const frame = useRef<number | null>(null);
  const key = target.join(",");

  useEffect(() => {
    const goal = key ? key.split(",").map(Number) : [];
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (reduce || sameValues(shownRef.current, goal)) {
      shownRef.current = goal;
      setShown(goal);
      return;
    }
    const start = shownRef.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = easeOutCubic(progress(now - t0, duration, delay));
      const v = lerpArray(start, goal, t);
      shownRef.current = v;
      setShown(v);
      frame.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [key, reduce, duration, delay]);

  return shown.length === target.length ? shown : lerpArray(shown, target, 1);
}

/** 數字跳到最終值，例如平均能力 0.00 → 3.48。 */
export function AnimatedNumber({ value, digits = 2, duration = 700, prefix = "", signed = false }: {
  value: number; digits?: number; duration?: number; prefix?: string; signed?: boolean;
}) {
  const [v] = useTween([Number.isFinite(value) ? value : 0], { duration });
  if (!Number.isFinite(value)) return <>—</>;
  const text = v.toFixed(digits);
  return <>{prefix}{signed && value > 0 ? "+" : ""}{text === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : text}</>;
}
