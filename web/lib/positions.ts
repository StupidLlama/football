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

// v2.11 位置小球場（components/position-map.tsx）的點：公尺（105 × 68），y 小 = 左邊路；左右邊路兩邊各一個；中路拉開，標籤才不會互相擋到
export const MAP_SPOTS: Record<string, [number, number][]> = {
  "GK": [[6, 34]], "CB": [[19, 24], [19, 44]], "LB/RB": [[24, 11], [24, 57]], "LWB/RWB": [[42, 7], [42, 61]],
  "CDM": [[36, 34]], "CM": [[52, 34]], "CAM": [[69, 34]], "LM/RM": [[62, 12], [62, 56]], "LW/RW": [[83, 15], [83, 53]], "ST": [[94, 34]],
};
/** 每個位置的活動範圍（x0, x1, y0, y1，公尺）；左右邊路兩個框，順序跟 MAP_SPOTS 一樣。 */
export const MAP_ZONES: Record<string, [number, number, number, number][]> = {
  "GK": [[1, 12, 22, 46]], "CB": [[12, 30, 18, 50]], "LB/RB": [[14, 36, 1, 16], [14, 36, 52, 67]], "LWB/RWB": [[36, 54, 1, 14], [36, 54, 54, 67]],
  "CDM": [[30, 44, 20, 48]], "CM": [[44, 58, 18, 50]], "CAM": [[58, 74, 20, 48]], "LM/RM": [[54, 74, 1, 16], [54, 74, 52, 67]],
  "LW/RW": [[74, 96, 1, 18], [74, 96, 50, 67]], "ST": [[78, 104, 22, 46]],
};
