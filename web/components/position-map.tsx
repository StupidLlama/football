// v2.11：位置小球場（使用者選的樣式 A：橫向全場、位置寫在小標籤裡）。進攻方向朝右。
// 左右邊路（LB/RB 這種）兩邊各畫一個；資料庫左右存在一起，所以兩邊一起亮。
// 擅長＝三線顏色的實心標籤＋該位置的活動範圍框、不擅長＝灰色虛線圈＋✕＋灰色虛線框、其他位置＝暗點、沒有框。
import { lineOf, MAP_SPOTS as SPOTS, MAP_ZONES } from "@/lib/positions";
import { PITCH_BG } from "./lineup-pitch";

const half = (pos: string, i: number) => (pos.includes("/") ? pos.split("/")[i] : pos);

export function PositionMap({ good, bad }: { good: string[]; bad: string[] }) {
  const label = `位置圖。擅長：${good.join("、") || "沒有填"}；不擅長：${bad.join("、") || "沒有填"}。框是該位置的活動範圍`;
  return (
    <svg viewBox="0 0 105 68" role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block", borderRadius: 6 }}>
      <rect width="105" height="68" fill={PITCH_BG} />
      <g fill="none" stroke="rgba(233,237,243,.28)" strokeWidth="0.4">
        <rect x="1" y="1" width="103" height="66" /><path d="M52.5 1V67" /><circle cx="52.5" cy="34" r="9" />
        <rect x="1" y="14" width="16" height="40" /><rect x="88" y="14" width="16" height="40" />
        <rect x="1" y="25" width="5.5" height="18" /><rect x="98.5" y="25" width="5.5" height="18" />
      </g>
      {Object.entries(MAP_ZONES).flatMap(([pos, zones]) => {
        const on = good.includes(pos), off = bad.includes(pos);
        if (!on && !off) return [];
        const c = lineOf(pos).color;
        return zones.map(([x0, x1, y0, y1], i) => (
          <rect key={`z${pos}${i}`} x={x0 + 0.6} y={y0 + 0.6} width={x1 - x0 - 1.2} height={y1 - y0 - 1.2} rx={1.8}
            {...(on ? { fill: c, fillOpacity: 0.16, stroke: c, strokeOpacity: 0.7, strokeWidth: 0.5 }
              : { fill: "none", stroke: "#8A97AD", strokeWidth: 0.5, strokeDasharray: "1.4 1.1" })} />
        ));
      })}
      {Object.entries(SPOTS).flatMap(([pos, spots]) => spots.map(([x, y], i) => {
        const name = half(pos, i), on = good.includes(pos), off = bad.includes(pos);
        if (on) {
          const w = 4 + name.length * 2.5;
          return (
            <g key={pos + i}>
              <rect x={x - w / 2} y={y - 2.8} width={w} height={5.6} rx={2.8} fill={lineOf(pos).color} />
              <text x={x} y={y + 1.4} textAnchor="middle" fontSize="4" fontWeight="700" fill="#0B1220" style={{ fontFamily: "var(--font-barlow), sans-serif" }}>{name}</text>
            </g>
          );
        }
        if (off) {
          return (
            <g key={pos + i} stroke="#8A97AD" strokeLinecap="round">
              <circle cx={x} cy={y} r={3.2} fill="none" strokeWidth="0.5" strokeDasharray="1 0.9" />
              <path d={`M${x - 1.6} ${y - 1.6}L${x + 1.6} ${y + 1.6}M${x + 1.6} ${y - 1.6}L${x - 1.6} ${y + 1.6}`} strokeWidth="0.8" />
              <text x={x} y={y + 7} textAnchor="middle" fontSize="3.6" fill="#8A97AD" stroke="none" style={{ fontFamily: "var(--font-barlow), sans-serif" }}>{name}</text>
            </g>
          );
        }
        return <circle key={pos + i} cx={x} cy={y} r={1} fill="rgba(233,237,243,.3)" />;
      }))}
    </svg>
  );
}
