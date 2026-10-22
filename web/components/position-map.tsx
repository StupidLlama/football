// v2.11：位置小球場（Sofascore／FotMob 球員頁的位置圖），取代一排位置標籤。
// 擅長＝實心（三線顏色）、不擅長＝灰色 ✕、其他位置＝暗點。進攻方向朝右。
import { lineOf, PITCH } from "@/lib/positions";
import { PITCH_BG } from "./lineup-pitch";

export function PositionMap({ good, bad }: { good: string[]; bad: string[] }) {
  const label = `位置圖。擅長：${good.join("、") || "沒有填"}；不擅長：${bad.join("、") || "沒有填"}`;
  return (
    <svg viewBox="0 0 105 68" role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block", borderRadius: 6 }}>
      <rect width="105" height="68" fill={PITCH_BG} />
      <g fill="none" stroke="rgba(233,237,243,.28)" strokeWidth="0.5">
        <rect x="1" y="1" width="103" height="66" /><path d="M52.5 1V67" /><circle cx="52.5" cy="34" r="9" />
        <rect x="1" y="14" width="16" height="40" /><rect x="88" y="14" width="16" height="40" />
      </g>
      {Object.entries(PITCH).map(([pos, [x, yy]]) => {
        const y = 68 - yy, on = good.includes(pos), off = bad.includes(pos);
        return (
          <g key={pos}>
            {on ? <circle cx={x} cy={y} r={4.2} fill={lineOf(pos).color} />
              : off ? <path d={`M${x - 3} ${y - 3}L${x + 3} ${y + 3}M${x + 3} ${y - 3}L${x - 3} ${y + 3}`} stroke="#8A97AD" strokeWidth="1.2" strokeLinecap="round" />
              : <circle cx={x} cy={y} r={1.3} fill="rgba(233,237,243,.3)" />}
            {(on || off) && <text x={x} y={y + 9} textAnchor="middle" fontSize="5" fill={on ? "#E9EDF3" : "#8A97AD"}>{pos}</text>}
          </g>
        );
      })}
    </svg>
  );
}
