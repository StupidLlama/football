"use client";
// 組隊：球場陣容圖（SVG，球場 105×68，進攻方向朝右；跟 infra/charts/pitch.py 同樣的座標系統）。
// 顏色跟其他頁面一樣：擅長綠、不擅長紅虛線、數據推算藍（web/components/ui.tsx 的 PrefTag 同一套）。
import type { CSSProperties, DragEvent } from "react";
import type { Formation, Slot } from "@/lib/lineup";

export const PITCH_BG = "#0F2A1E";
const STRIPE = "#13331F";
const LINE = "#3E5C4C";
const GOOD = "#4ADE80", BAD = "#F87171", REC = "#60A5FA", EMPTY = "#64748B";
const L = 105, W = 68;

export type SlotTag = "good" | "bad" | "none";
export type SlotLabel = { number: string | null; text: string; tag: SlotTag; rated: boolean };

// 拖曳時放進 dataTransfer 的內容：from 可能是某個位置（slot）或替補名單（bench）。
export type DragToken = { kind: "slot" | "bench"; id: string };
const MIME = "application/x-lineup-token";

export function dragStart(e: DragEvent, token: DragToken): void {
  e.dataTransfer.setData(MIME, JSON.stringify(token));
  e.dataTransfer.effectAllowed = "move";
}

export function dropToken(e: DragEvent): DragToken | null {
  e.preventDefault();
  try {
    const raw = e.dataTransfer.getData(MIME);
    return raw ? (JSON.parse(raw) as DragToken) : null;
  } catch {
    return null;
  }
}

function PitchMarkings() {
  const stripes = [];
  for (let x = 0; x < L; x += 15) stripes.push(<rect key={x} x={x} y={0} width={7.5} height={W} fill={STRIPE} />);
  return (
    <g aria-hidden="true">
      <rect x={0} y={0} width={L} height={W} fill={PITCH_BG} />
      {stripes}
      <g stroke={LINE} strokeWidth={0.5} fill="none">
        <rect x={0.3} y={0.3} width={L - 0.6} height={W - 0.6} />
        <line x1={L / 2} y1={0} x2={L / 2} y2={W} />
        <circle cx={L / 2} cy={W / 2} r={9.15} />
        <rect x={0} y={W / 2 - 20.16} width={16.5} height={40.32} />
        <rect x={L - 16.5} y={W / 2 - 20.16} width={16.5} height={40.32} />
      </g>
    </g>
  );
}

/** 一個位置的框：有人就顯示背號＋名字（截斷），沒人顯示位置代碼和「缺人」。 */
function SlotBox({ slot, label, locked, selected, draggable, onClick, onDragOver, onDrop, onDragStart }: {
  slot: Slot; label: SlotLabel | null; locked: boolean; selected: boolean; draggable: boolean;
  onClick: () => void; onDragOver?: (e: DragEvent) => void; onDrop?: (e: DragEvent) => void; onDragStart?: (e: DragEvent) => void;
}) {
  const bw = 15.5, bh = 12.5;
  const x0 = slot.x - bw / 2, y0 = (W - slot.y) - bh / 2;   // SVG y 往下，所以要反過來（y 大 = 左邊路 = 畫面上方）
  const color = !label ? EMPTY : label.tag === "good" ? GOOD : label.tag === "bad" ? BAD : label.rated ? REC : EMPTY;
  const dashed = !label || label.tag === "bad" || !label.rated;
  const name = label?.text ?? "";
  const short = name.length > 7 ? `${name.slice(0, 6)}…` : name;
  // SVGProps<SVGGElement> 沒有宣告 draggable（但瀏覽器支援），型別檢查過不了，用 any 繞過。
  // Chrome/Safari（WebKit）對非圖片/連結元素，光有 draggable="true" 不會真的能拖，
  // 要加 -webkit-user-drag: element，不然滑鼠按下去會變成選取文字（這就是「拖不動」的原因）。
  const dragProps = { draggable, onDragStart, onDragOver, onDrop } as unknown as Record<string, unknown>;
  const dragStyle: CSSProperties & Record<string, string> = draggable
    ? { cursor: "pointer", WebkitUserDrag: "element", userSelect: "none", WebkitUserSelect: "none" }
    : { cursor: "pointer" };
  return (
    <g className="pop-in" style={dragStyle} onClick={onClick} {...dragProps}>
      <rect x={x0} y={y0} width={bw} height={bh} rx={1.6}
        fill={label ? `${color}33` : "transparent"} stroke={selected ? "#F5A524" : color}
        strokeWidth={selected ? 1.4 : 0.9} strokeDasharray={dashed && !selected ? "1.4 1.1" : undefined} />
      <text x={slot.x} y={y0 + 4.3} textAnchor="middle" fontSize={3.4} fontWeight={700} fill="#E2E8F0">{slot.code}</text>
      {label ? (
        <text x={slot.x} y={y0 + bh - 2} textAnchor="middle" fontSize={3} fill="#E2E8F0">
          {label.number ? `#${label.number} ` : ""}{short}
        </text>
      ) : (
        <text x={slot.x} y={y0 + bh - 2} textAnchor="middle" fontSize={2.8} fill="#64748B">缺人</text>
      )}
      {locked && <text x={x0 + bw - 1.6} y={y0 + 3.2} textAnchor="middle" fontSize={3.4}>🔒</text>}
    </g>
  );
}

export function Pitch({ formation, labels, lockedSlots, selectedSlot, onSlotClick, draggable = false, onDrop }: {
  formation: Formation; labels: Record<string, SlotLabel | null>; lockedSlots: Set<string>; selectedSlot: string | null;
  onSlotClick: (code: string) => void; draggable?: boolean; onDrop?: (slot: string, token: DragToken) => void;
}) {
  return (
    <div style={{ width: "100%", maxWidth: 680, margin: "0 auto" }}>
      <svg viewBox={`-2 -2 ${L + 4} ${W + 4}`} role="img" aria-label={`${formation.name} 陣容圖`}
        style={{ width: "100%", height: "auto", display: "block", borderRadius: 10 }}>
        <PitchMarkings />
        {formation.slots.map((slot) => (
          <SlotBox key={slot.code} slot={slot} label={labels[slot.code] ?? null} locked={lockedSlots.has(slot.code)}
            selected={selectedSlot === slot.code}
            draggable={draggable && !lockedSlots.has(slot.code)}
            onDragStart={(e) => dragStart(e, { kind: "slot", id: slot.code })}
            onDragOver={(e) => { if (onDrop) e.preventDefault(); }}
            onDrop={(e) => { const t = dropToken(e); if (t && onDrop) onDrop(slot.code, t); }}
            onClick={() => onSlotClick(slot.code)} />
        ))}
      </svg>
      <p className="faint" style={{ fontSize: 12, textAlign: "center", margin: "6px 0 0" }}>進攻方向朝右 →</p>
    </div>
  );
}

export const legendStyle: CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 };
export { GOOD as GOOD_COLOR, BAD as BAD_COLOR, REC as REC_COLOR, EMPTY as EMPTY_COLOR };

// ---------- 下載陣容圖片 ----------
// 不用畫面上那個會互動的 <svg>（尺寸會跟著版面縮放，截圖容易模糊），另外畫一張固定大小、適合貼 LINE / IG 的直式圖。
const EXPORT_W = 1080, EXPORT_H = 1350; // 4:5，手機和 IG 貼文都好看
const PAD = 60;

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 產生可以直接存成 PNG 的 SVG 字串（固定尺寸，不受畫面縮放影響）。 */
export function pitchSvgMarkup(formation: Formation, labels: Record<string, SlotLabel | null>, title: string): string {
  const pitchW = EXPORT_W - PAD * 2, pitchH = pitchW * (W / L);
  const pitchY = PAD + 90;
  const sx = pitchW / L, sy = pitchH / W;
  const bw = 15.5 * sx, bh = 12.5 * sy;
  let boxes = "";
  const stripes = Array.from({ length: Math.ceil(L / 15) }, (_, i) => i * 15)
    .map((x) => `<rect x="${(x * sx).toFixed(1)}" y="0" width="${(7.5 * sx).toFixed(1)}" height="${pitchH.toFixed(1)}" fill="${STRIPE}" />`).join("");
  for (const slot of formation.slots) {
    const label = labels[slot.code] ?? null;
    const cx = slot.x * sx, cy = (W - slot.y) * sy;
    const x0 = cx - bw / 2, y0 = cy - bh / 2;
    const color = !label ? EMPTY : label.tag === "good" ? GOOD : label.tag === "bad" ? BAD : label.rated ? REC : EMPTY;
    const fill = label ? `${color}33` : "transparent";
    const name = label?.text ? escXml(label.number ? `#${label.number} ${label.text}` : label.text) : "缺人";
    boxes += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="6" `
      + `fill="${fill}" stroke="${color}" stroke-width="2" />`
      + `<text x="${cx.toFixed(1)}" y="${(y0 + 20).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="700" fill="#E2E8F0">${escXml(slot.code)}</text>`
      + `<text x="${cx.toFixed(1)}" y="${(y0 + bh - 10).toFixed(1)}" text-anchor="middle" font-size="13" fill="${label ? "#E2E8F0" : "#64748B"}">${name}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_W}" height="${EXPORT_H}" viewBox="0 0 ${EXPORT_W} ${EXPORT_H}" font-family="sans-serif">`
    + `<rect width="${EXPORT_W}" height="${EXPORT_H}" fill="#0B1220" />`
    + `<text x="${EXPORT_W / 2}" y="${PAD + 10}" text-anchor="middle" font-size="34" font-weight="700" fill="#E9EDF3">${escXml(title)}</text>`
    + `<g transform="translate(${PAD}, ${pitchY})">`
    + `<rect width="${pitchW.toFixed(1)}" height="${pitchH.toFixed(1)}" fill="${PITCH_BG}" />${stripes}`
    + `<rect x="1" y="1" width="${(pitchW - 2).toFixed(1)}" height="${(pitchH - 2).toFixed(1)}" fill="none" stroke="${LINE}" stroke-width="1.5" />`
    + `<line x1="${(pitchW / 2).toFixed(1)}" y1="0" x2="${(pitchW / 2).toFixed(1)}" y2="${pitchH.toFixed(1)}" stroke="${LINE}" stroke-width="1.5" />`
    + `<circle cx="${(pitchW / 2).toFixed(1)}" cy="${(pitchH / 2).toFixed(1)}" r="${(9.15 * sx).toFixed(1)}" fill="none" stroke="${LINE}" stroke-width="1.5" />`
    + boxes + `</g>`
    + `<text x="${EXPORT_W / 2}" y="${EXPORT_H - 24}" text-anchor="middle" font-size="16" fill="#8B9AB4">Football Analysis Potato 🥔</text>`
    + `</svg>`;
}

/** 把 SVG 字串轉成 PNG 並觸發下載（瀏覽器端，不會上傳到任何伺服器）。 */
export function downloadPitchPng(svg: string, filename: string): void {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_W; canvas.height = EXPORT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };
  img.src = url;
}
