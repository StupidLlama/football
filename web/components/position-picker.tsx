"use client";
// 選位置：點一下「擅長」，再點一下「不擅長」，第三下取消。依三線分組上色。
import { groupByLine } from "@/lib/positions";

export type PosChoice = Record<string, "good" | "bad">;

export function toChoice(good: string[], bad: string[]): PosChoice {
  const c: PosChoice = {};
  for (const p of good) c[p] = "good";
  for (const p of bad) if (!c[p]) c[p] = "bad";
  return c;
}

export function fromChoice(c: PosChoice): { good: string[]; bad: string[] } {
  const keys = Object.keys(c);
  return { good: keys.filter((k) => c[k] === "good"), bad: keys.filter((k) => c[k] === "bad") };
}

export function PositionPicker({ positions, value, onChange }: {
  positions: string[]; value: PosChoice; onChange: (v: PosChoice) => void;
}) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {groupByLine(positions).map(({ line, positions: ps }) => (
        <div key={line.name} role="group" aria-label={line.name} className="chips">
          <span style={{ width: 40, fontSize: 14, fontWeight: 700, color: line.color }}>{line.name}</span>
          {ps.map((pos) => {
            const s = value[pos];
            const style = s === "good" ? { borderColor: line.color, background: line.color, color: "#0B1220", fontWeight: 700 }
              : s === "bad" ? { border: `1px dashed ${line.color}`, color: line.color }
              : { borderColor: `${line.color}55`, color: "#C9D3E3" };
            return (
              <button key={pos} type="button" className="chip" style={style}
                aria-label={`${pos}：${s === "good" ? "擅長" : s === "bad" ? "不擅長" : "沒選"}，點一下切換`}
                onClick={() => {
                  const next = { ...value };
                  if (!s) next[pos] = "good"; else if (s === "good") next[pos] = "bad"; else delete next[pos];
                  onChange(next);
                }}>
                {s === "bad" ? "✕ " : ""}{pos}
                {s && <span style={{ marginLeft: 6, fontSize: 12 }}>{s === "good" ? "擅長" : "不擅長"}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function WeakFootPicker({ value, onChange }: { value: "" | "left" | "right"; onChange: (v: "" | "left" | "right") => void }) {
  const opts: ["left" | "right" | "", string][] = [["left", "左腳"], ["right", "右腳"], ["", "不確定"]];
  return (
    <div role="radiogroup" aria-label="弱腳是哪一腳" className="chips">
      {opts.map(([k, label]) => (
        <button key={label} type="button" role="radio" className="chip" aria-checked={value === k} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}
