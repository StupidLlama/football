// 位置的分線與球場座標（畫面用的設定，跟評分規則無關）。
// 三線顏色：進攻紅、中場綠、防守黃（門將算防守），跟 v2.1.1 設計稿一樣。

export type Line = { name: string; color: string; positions: string[] };

export const LINES: Line[] = [
  { name: "進攻", color: "#F87171", positions: ["LW/RW", "ST"] },
  { name: "中場", color: "#4ADE80", positions: ["CDM", "CM", "CAM", "LM/RM"] },
  { name: "防守", color: "#FACC15", positions: ["GK", "CB", "LB/RB", "LWB/RWB"] },
];

/** 這個位置屬於哪一線；不認得的位置（例如設定檔新增的）算中場。 */
export function lineOf(pos: string): Line {
  return LINES.find((l) => l.positions.includes(pos))
    ?? LINES.find((l) => l.positions.some((p) => p.split("/").includes(pos.split("/")[0])))
    ?? LINES[1];
}

/** 把位置清單依三線分組（保留每線裡的順序；不在三線裡的放中場最後）。 */
export function groupByLine(positions: string[]): { line: Line; positions: string[] }[] {
  return LINES.map((line) => ({ line, positions: positions.filter((p) => lineOf(p) === line) }))
    .filter((g) => g.positions.length > 0);
}

/** 球場圖上每個位置的座標（公尺，球場 105 × 68，進攻方向朝右）。 */
export const PITCH: Record<string, [number, number]> = {
  "GK": [6, 34], "CB": [22, 34], "LB/RB": [26, 58], "LWB/RWB": [44, 60], "CDM": [40, 34],
  "CM": [52, 40], "CAM": [68, 34], "LM/RM": [58, 10], "LW/RW": [80, 57], "ST": [92, 34],
};
