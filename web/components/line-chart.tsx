"use client";
// 折線圖（生涯趨勢）：一條或幾條線，y 軸固定 1–5 分。
// 動畫：線從左到右畫出來、資料點依序出現；換顯示的線時重畫。滑鼠移到（或手指點）某個時間點顯示該點所有數值。
import { useEffect, useRef, useState } from "react";

export type LineSeries = { key: string; name: string; color: string; values: (number | null)[]; width?: number };

// 圖的座標大小：桌機寬一點；手機用比較窄的座標，縮放後字和線才不會太小（手機上整張圖約 230 像素高）
const WIDE = { W: 640, H: 260, R: 92, fs: 12 }, NARROW = { W: 360, H: 250, R: 64, fs: 12 };
const L = 36, T = 14, B = 46;

export function LineChart({ xLabels, xShort, xSub, series, min = 1, max = 5, label }: {
  xLabels: string[]; xShort?: string[]; xSub?: string[]; series: LineSeries[]; min?: number; max?: number; label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 500));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { W, H, R, fs } = narrow ? NARROW : WIDE;
  const labels = narrow && xShort ? xShort : xLabels;
  const n = xLabels.length;
  const x = (i: number) => (n <= 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + ((max - Math.max(min, Math.min(max, v))) * (H - T - B)) / (max - min);
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  // 換顯示的線、換資料時，用新的 key 讓動畫重跑一次
  const drawKey = series.map((s) => s.key).join("|") + "#" + series.map((s) => s.values.join(",")).join("|");
  const stepDelay = n > 1 ? 0.8 / n : 0;

  return (
    <div ref={wrap} style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R + 8} y1={y(t)} y2={y(t)} stroke="#22304A" strokeWidth={1} />
            <text x={L - 10} y={y(t)} fill="#8A97AD" fontSize={fs} textAnchor="end" dominantBaseline="middle">{t}</text>
          </g>
        ))}
        {labels.map((lab, i) => (
          <g key={i}>
            <text x={x(i)} y={H - B + 20} fill={hover === i ? "#FFFFFF" : "#B6C2D6"} fontSize={fs} textAnchor="middle">{lab}</text>
            {xSub?.[i] && <text x={x(i)} y={H - B + 36} fill="#8A97AD" fontSize={fs - 1} textAnchor="middle">{xSub[i]}</text>}
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#4A5A7A" strokeWidth={1} />}
        <g key={drawKey}>
          {series.map((s, si) => {
            const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => !!p);
            if (!pts.length) return null;
            const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join("");
            const last = pts[pts.length - 1];
            return (
              <g key={s.key}>
                {pts.length > 1 && (
                  <path d={d} pathLength={1} className="line-draw" fill="none" stroke={s.color} strokeWidth={s.width ?? 2}
                    strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: `${si * 0.08}s` }} />
                )}
                {s.values.map((v, i) => v === null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5.5 : 4} fill={s.color} stroke="#131C2E" strokeWidth={2}
                    className="pop-in" style={{ animationDelay: `${(i * stepDelay + si * 0.08).toFixed(2)}s` }} />
                ))}
                {/* 線尾直接標名字（不用只靠顏色分辨） */}
                <text x={last[0] + 10} y={last[1]} fill="#B6C2D6" fontSize={fs} dominantBaseline="middle" className="fade-up"
                  style={{ animationDelay: `${(0.8 + si * 0.08).toFixed(2)}s` }}>{s.name}</text>
              </g>
            );
          })}
        </g>
        {xLabels.map((_, i) => {
          const half = n <= 1 ? (W - L - R) / 2 : (W - L - R) / (n - 1) / 2;
          return (
            <rect key={i} x={x(i) - half} y={T} width={half * 2} height={H - T - B + 40} fill="transparent" style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover(i)} onClick={() => setHover((h) => (h === i ? null : i))} />
          );
        })}
      </svg>
      {hover !== null && (
        <div className="radar-tip" role="status" style={{ left: `${(x(hover) / W) * 100}%`, bottom: "auto", top: 0, transform: `translate(${hover > n / 2 ? "-105%" : "5%"}, 0)` }}>
          <div style={{ fontWeight: 700 }}>{xLabels[hover]}{xSub?.[hover] && <span className="faint" style={{ fontWeight: 400, fontSize: 12, marginLeft: 6 }}>{xSub[hover]}</span>}</div>
          {series.map((s) => (
            <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />{s.name}</span>
              <span className="num">{s.values[hover] === null ? "—" : s.values[hover]!.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
