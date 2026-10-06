"use client";
// 共用的小元件：標誌、提示訊息、位置標籤、雷達圖、KPI 卡、即將推出。
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { lineOf } from "@/lib/positions";
import { radarPoints } from "@/lib/rating";
import type { Ability } from "@/lib/rating";
import { useTween } from "@/components/anim";

export const REPO_URL = "https://github.com/StupidLlama/football";

// ---------- 粉筆質感（SVG 濾鏡，整頁放一次）----------
export function ChalkDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="chalk" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={4} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" />
        </filter>
      </defs>
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.875} viewBox="0 0 34 30" aria-hidden="true" focusable="false">
      <path d="M6 15c-1-7 6-12 13-11 8 1 13 6 12 13-1 6-7 10-14 9C10 25 7 21 6 15z" fill="#C9A267" stroke="#E9EDF3" strokeWidth="1.6" filter="url(#chalk)" />
      <circle cx="14" cy="12" r="1.3" fill="#0B1220" /><circle cx="21" cy="11" r="1.3" fill="#0B1220" /><circle cx="18" cy="19" r="1" fill="#8A6A3A" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <nav aria-label="網站資訊" style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
        <Link href="/privacy">隱私權政策</Link>
        <Link href="/terms">服務條款</Link>
        <Link href="/contact">聯絡我們</Link>
        <span>原始碼公開在 <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>（AGPL-3.0）</span>
      </nav>
    </footer>
  );
}

// ---------- 提示訊息（畫面下方，2.6 秒後消失）----------
const ToastCtx = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(""), 2600);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <ToastCtx.Provider value={say}>
      {children}
      {text && <p role="status" className="toast">{text}</p>}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------- 狀態 ----------
export function Loading({ text = "讀取中…" }: { text?: string }) {
  return <p className="faint" role="status" style={{ padding: "24px 0" }}>{text}</p>;
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="status err" role="alert">
      <p style={{ margin: 0 }}>{text}</p>
      {onRetry && <button type="button" className="btn btn-line btn-sm" style={{ marginTop: 8 }} onClick={onRetry}>再試一次</button>}
    </div>
  );
}

export function Soon({ text = "即將推出" }: { text?: string }) {
  return <span className="soon">{text}</span>;
}

export function ComingSoon({ title, version, children }: { title: string; version: string; children: ReactNode }) {
  return (
    <section>
      <h1 className="hide-sm" style={{ margin: "0 0 12px", fontSize: 30 }}>{title}</h1>
      <div className="panel" style={{ padding: 24, display: "flex", gap: 16, alignItems: "flex-start" }}>
        <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" focusable="false" style={{ flex: "none" }}>
          <rect x="6" y="10" width="44" height="36" rx="4" fill="none" stroke="#4A5A7A" strokeWidth="2" />
          <path d="M14 34 C 22 24, 30 32, 42 18" fill="none" stroke="#F5A524" strokeWidth="2.5" strokeLinecap="round" filter="url(#chalk)" />
        </svg>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>即將推出 <Soon text={version} /></p>
          <div className="muted" style={{ marginTop: 4 }}>{children}</div>
        </div>
      </div>
    </section>
  );
}

// ---------- 身分 ----------
export function RoleBadge({ coach, long = false }: { coach: boolean; long?: boolean }) {
  const style: CSSProperties = coach
    ? { background: "#F5A524", color: "#1A1206" }
    : { background: "#1A2540", color: "#E9EDF3", border: "1px solid #4A5A7A" };
  return (
    <span style={{ padding: "1px 10px", borderRadius: 99, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", ...style }}>
      {long ? (coach ? "你是球隊管理員" : "你是球員") : coach ? "管理員" : "球員"}
    </span>
  );
}

export function CaptainBadge({ badge, size = 13 }: { badge: "C" | "VC" | null; size?: number }) {
  if (!badge) return null;
  const style: CSSProperties = badge === "C" ? { background: "#F5A524", color: "#1A1206" } : { background: "#2DD4BF", color: "#06201C" };
  return (
    <span title={badge === "C" ? "隊長" : "副隊長"} style={{ padding: "0 8px", borderRadius: 6, fontSize: size, fontWeight: 700, ...style }}>{badge}</span>
  );
}

// ---------- 位置標籤 ----------
/** 依三線上色（進攻紅、中場綠、防守黃）；bad = 虛線加 ✕。 */
export function PosTag({ pos, bad = false }: { pos: string; bad?: boolean }) {
  const c = lineOf(pos).color;
  const style: CSSProperties = bad ? { border: `1px dashed ${c}`, color: c } : { background: `${c}24`, border: `1px solid ${c}66`, color: c };
  return <span className="tag" style={style}>{bad ? `✕ ${pos}` : pos}</span>;
}

/** 擅長（綠）、不擅長（紅虛線）、數據推薦（藍 ★）。 */
export function PrefTag({ pos, kind }: { pos: string; kind: "good" | "bad" | "rec" }) {
  const style: CSSProperties =
    kind === "good" ? { background: "rgba(74,222,128,.16)", border: "1px solid rgba(74,222,128,.55)", color: "#86EFAC" }
    : kind === "bad" ? { background: "rgba(248,113,113,.14)", border: "1px dashed rgba(248,113,113,.65)", color: "#FCA5A5" }
    : { background: "rgba(96,165,250,.16)", border: "1px solid rgba(96,165,250,.55)", color: "#BFDBFE" };
  return <span className="tag" style={style}>{kind === "rec" ? `★ ${pos}` : pos}</span>;
}

// ---------- KPI ----------
export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="faint" style={{ fontSize: 14 }}>{label}</div>
      <div className="v">{value}</div>
      {sub !== undefined && <div className="faint" style={{ fontSize: 13 }}>{sub}</div>}
    </div>
  );
}

/** 長條：第一次出現時從 0 長到數值，數值改變時平滑變長變短。 */
export function Bar({ frac, color = "#11A595", height = 8, delay = 0 }: { frac: number; color?: string; height?: number; delay?: number }) {
  const [f] = useTween([Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0))], { duration: 650, delay });
  return (
    <span className="bar" style={{ height }}>
      <span style={{ width: `${(f * 100).toFixed(1)}%`, background: color }} />
    </span>
  );
}

// ---------- 雷達圖 ----------
// name：滑鼠移到（或手指點）某項能力時，提示框裡顯示的名字。
export type RadarSeries = { values: number[]; color: string; fill?: string; dashed?: boolean; width?: number; name?: string };

/** 一條雷達圖的線：進場時從中心長出來，數值改變（換球員、換比較對象）時平滑變形。 */
function RadarShape({ s, max, delay }: { s: RadarSeries; max: number; delay: number }) {
  const values = useTween(s.values, { duration: 750, delay });
  return (
    <polygon points={radarPoints(values, max)} fill={s.fill ?? "none"} stroke={s.color}
      strokeWidth={s.width ?? 0.8} strokeDasharray={s.dashed ? "1.6 1.2" : undefined} strokeLinejoin="round" />
  );
}

/** 21 項能力的雷達圖。labels = 每個軸的名字（放在圖外圍，用 HTML 文字比較清楚）。滑鼠移到軸上（手機用點的）會顯示分數。 */
export function Radar({ abilities, series, max = 5, label, showLabels = true }: {
  abilities: Ability[]; series: RadarSeries[]; max?: number; label: string; showLabels?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showLabels]);
  const n = abilities.length;
  const ring = (level: number) => radarPoints(Array(n).fill(level), max);
  const axis = (i: number, r: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [50 + r * Math.cos(ang), 50 + r * Math.sin(ang)] as const;
  };
  let spokes = "";
  for (let i = 0; i < n; i++) {
    const [x, y] = axis(i, 40);
    spokes += `M50 50L${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  const named = series.filter((s) => s.name);
  const svg = (
    <svg viewBox="0 0 100 100" role="img" aria-label={label}
      style={showLabels ? { position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" } : { width: "100%", height: "auto", display: "block" }}>
      {[5, 4, 3, 2].filter((l) => l <= max).map((l) => (
        <polygon key={l} points={ring(l)} fill="none" stroke="#22304A" strokeWidth={0.3} />
      ))}
      <path d={spokes} stroke="#1E2A42" strokeWidth={0.3} />
      {hover !== null && (() => { const [x, y] = axis(hover, 40); return <line x1={50} y1={50} x2={x} y2={y} stroke="#60A5FA" strokeWidth={0.5} />; })()}
      {series.map((s, i) => <RadarShape key={i} s={s} max={max} delay={i * 90} />)}
      {hover !== null && named.map((s, i) => {
        const [x, y] = axis(hover, (40 * Math.max(0, Math.min(s.values[hover] ?? 0, max))) / max);
        return <circle key={i} cx={x} cy={y} r={1.4} fill={s.color} stroke="#0B1220" strokeWidth={0.4} />;
      })}
      {showLabels && named.length > 0 && abilities.map((a, i) => {
        // 點擊一律顯示這一項（不切換）：滑鼠移進來已經先顯示，切換會讓第一次點擊反而把提示框關掉
        // 透明的扇形感應區：滑鼠移過去、手指點下去都會顯示這一項的分數
        const [x1, y1] = axis(i - 0.5, 46), [x2, y2] = axis(i + 0.5, 46);
        return (
          <path key={a.key} d={`M50 50L${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}Z`} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            onClick={() => setHover(i)} style={{ cursor: "pointer" }} />
        );
      })}
    </svg>
  );
  if (!showLabels) return svg;
  const tip = hover !== null ? abilities[hover] : null;
  // 手機上圖比較小：能力名稱縮小一點、往外推一點，才不會互相重疊（360–400 像素寬實測過）
  const compact = boxWidth > 0 && boxWidth < 300;
  return (
    <div className="radar-wrap">
      <div ref={boxRef} style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }} onMouseLeave={() => setHover(null)}>
        {svg}
        {abilities.map((a, i) => {
          const [x, y] = axis(i, compact ? 47 : 45);
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          // 文字錨點隨角度平滑移動：右邊的字往右長、左邊的往左長；上方的字放在點上面、下方的放在點下面
          const c = Math.max(-1, Math.min(1, Math.cos(ang) / 0.3));
          const tx = -50 + 50 * c, ty = -50 + 50 * Math.sin(ang);
          return (
            <span key={a.key} aria-hidden="true" style={{
              position: "absolute", left: `${x.toFixed(1)}%`, top: `${y.toFixed(1)}%`, transform: `translate(${tx.toFixed(0)}%, ${ty.toFixed(0)}%)`,
              fontSize: compact ? 10 : 11, lineHeight: 1.1, color: hover === i ? "#FFFFFF" : "#B6C2D6", fontWeight: hover === i ? 700 : 400,
              whiteSpace: "nowrap", pointerEvents: "none",
            }}>{a.label}</span>
          );
        })}
        {tip && (
          <div className="radar-tip" role="status">
            <div style={{ fontWeight: 700 }}>{tip.label}<span className="faint" style={{ fontWeight: 400, fontSize: 12, marginLeft: 6 }}>{tip.category}</span></div>
            {named.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />{s.name}</span>
                <span className="num">{Number.isFinite(s.values[hover!]) ? (Number.isInteger(s.values[hover!]) ? s.values[hover!] : s.values[hover!].toFixed(1)) : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LegendLine({ color, dashed = false, children }: { color: string; dashed?: boolean; children: ReactNode }) {
  return (
    <span>
      <span style={dashed
        ? { display: "inline-block", width: 16, height: 0, borderTop: `2px dashed ${color}`, verticalAlign: "middle", marginRight: 6 }
        : { display: "inline-block", width: 16, height: 3, background: color, verticalAlign: "middle", marginRight: 6 }} />
      {children}
    </span>
  );
}

// ---------- 雙腳（慣用腳 / 弱腳）----------
export function Feet({ weakSide, label }: { weakSide: "" | "left" | "right"; label: string }) {
  const strong = weakSide === "left" ? "right" : weakSide === "right" ? "left" : "";
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" role="img" aria-label={label} style={{ flex: "none" }}>
      <path d="M30 8c9 0 14 10 14 24s-3 26-6 34-14 10-17 2-5-20-5-34S21 8 30 8z" fill={strong === "left" ? "#11A595" : "#1E2A42"} stroke="#E9EDF3" strokeWidth="1.5" filter="url(#chalk)" />
      <path d="M90 8c-9 0-14 10-14 24s3 26 6 34 14 10 17 2 5-20 5-34S99 8 90 8z" fill={strong === "right" ? "#11A595" : "#1E2A42"} stroke="#E9EDF3" strokeWidth="1.5" filter="url(#chalk)" />
      <text x="30" y="78" fontSize="10" fill="#8A97AD" textAnchor="middle">左</text>
      <text x="90" y="78" fontSize="10" fill="#8A97AD" textAnchor="middle">右</text>
    </svg>
  );
}

export function footText(weakSide: "" | "left" | "right", weakFootScore?: number): string {
  if (!weakSide) return "慣用腳：沒有填";
  const strong = weakSide === "left" ? "右腳" : "左腳";
  const weak = weakSide === "left" ? "左腳" : "右腳";
  return `慣用腳：${strong}；弱腳：${weak}` + (weakFootScore ? `（弱腳能力 ${weakFootScore} 分）` : "");
}

/** 「2026/10/05」 */
export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "—");
export const signed = (x: number, d = 2) => `${x > 0 ? "+" : ""}${fmt(x, d)}`;
