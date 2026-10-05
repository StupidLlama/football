"use client";
// 球員：球員列表（排行榜合併在這裡：可依平均、任一類別或能力排序，格子可以顯示分數或隊內名次）＋ 比較。
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { ABILITIES, CATEGORY_NAMES, POSITIONS, RULES } from "@/lib/config";
import { groupByLine } from "@/lib/positions";
import { jerseyValue, rank, rankAsc, sortBy, type SortDir, type SortKey } from "@/lib/rating";
import { read, write } from "@/lib/prefs";
import { useTeamView } from "@/lib/team";
import type { PlayerView } from "@/lib/teamview";
import { Bar, fmt, Kpi, LegendLine, PrefTag, Radar, signed } from "@/components/ui";

type Col = { label: string; val: (p: PlayerView) => number; dec: number };

const heat = (v: number): CSSProperties => {
  const t = Math.max(0, Math.min(1, (v - 1) / 4));
  return { background: `rgba(59,130,246,${(0.10 + t * 0.70).toFixed(2)})`, color: t > 0.55 ? "#06122A" : "#E9EDF3" };
};

export default function PlayersPage() {
  const [tab, setTab] = useState<"list" | "compare">("list");
  useEffect(() => { if (read("fap:players-tab") === "compare") setTab("compare"); }, []);
  const pick = (t: "list" | "compare") => { setTab(t); write("fap:players-tab", t); };
  return (
    <>
      <h1 className="hide-sm" style={{ margin: "0 0 12px", fontSize: 30 }}>球員</h1>
      <div className="tabs" role="tablist" aria-label="球員功能">
        <button type="button" role="tab" className="tabbtn" aria-selected={tab === "list"} onClick={() => pick("list")}>球員列表</button>
        <button type="button" role="tab" className="tabbtn" aria-selected={tab === "compare"} onClick={() => pick("compare")}>比較</button>
      </div>
      {tab === "list" ? <Overview /> : <Compare />}
    </>
  );
}

function Overview() {
  const v = useTeamView();
  const router = useRouter();
  const { teamId } = useParams<{ teamId: string }>();
  const P = v.rated;
  const [filter, setFilter] = useState<string[]>([]);
  const [scope, setScope] = useState<string>("cat");
  const [sortKey, setSortKey] = useState<SortKey>("avg");
  const [dir, setDir] = useState<SortDir>("desc");
  const [cell, setCell] = useState<"score" | "rank">("score");

  const unrated = v.players.filter((p) => !p.scores);
  if (P.length === 0) {
    return (
      <div className="panel pad">
        <p style={{ margin: 0, fontWeight: 700 }}>還沒有人填能力表</p>
        <p className="muted" style={{ margin: "4px 0 0" }}>隊友認領自己、填完能力表後，全隊的能力會出現在這裡。</p>
      </div>
    );
  }

  const cols: Col[] = scope === "cat"
    ? CATEGORY_NAMES.map((c) => ({ label: c, val: (p) => p.cat[c] ?? 0, dec: 1 }))
    : ABILITIES.filter((a) => a.category === scope).map((a) => ({ label: a.label, val: (p) => p.scores?.[a.key] ?? 0, dec: 0 }));
  const key: SortKey = sortKey.startsWith("col:") && Number(sortKey.slice(4)) >= cols.length ? "avg" : sortKey;
  const rankMode = key !== "num" && key !== "name";
  const sortVal = (p: PlayerView): number | string | null =>
    key === "avg" ? p.avg : key === "num" ? jerseyValue(p.jersey_number) : key === "name" ? p.name : cols[Number(key.slice(4))].val(p);
  const filtered = P.filter((p) => !filter.length || p.good_positions.some((g) => filter.includes(g)));
  const rows = sortBy(filtered, sortVal, (p) => p.avg, dir);
  const allVals = P.map((p) => sortVal(p) as number);

  // KPI
  const catAvg = Object.fromEntries(CATEGORY_NAMES.map((c) => [c, P.reduce((t, p) => t + (p.cat[c] ?? 0), 0) / P.length]));
  const bestCat = CATEGORY_NAMES.slice().sort((a, b) => catAvg[b] - catAvg[a])[0];
  const posCount = Object.fromEntries(POSITIONS.map((pos) => [pos, v.players.filter((p) => p.good_positions.includes(pos)).length]));
  const topPos = POSITIONS.slice().sort((a, b) => posCount[b] - posCount[a])[0];
  const maxCount = Math.max(1, ...POSITIONS.map((p) => posCount[p]));

  const chooseScope = (s: string) => {
    setScope(s);
    if (key.startsWith("col:")) { setSortKey("avg"); setDir("desc"); }
  };
  const chooseSort = (k: SortKey) => { setSortKey(k); setDir(k === "num" || k === "name" ? "asc" : "desc"); };
  const dirLabel = dir === "asc" ? (key === "num" ? "小 → 大" : key === "name" ? "筆畫少 → 多" : "低 → 高")
    : (key === "num" ? "大 → 小" : key === "name" ? "筆畫多 → 少" : "高 → 低");
  const hl = (on: boolean): CSSProperties | undefined => (on ? { color: "#93C5FD", fontWeight: 700 } : undefined);
  const sorts: [SortKey, string][] = [["avg", "平均能力"], ["num", "背號"], ["name", "姓名"], ...cols.map((c, i) => [`col:${i}` as SortKey, c.label] as [SortKey, string])];

  return (
    <>
      <div className="kpis">
        <Kpi label="球員數" value={P.length} sub={unrated.length ? `已填能力表（另有 ${unrated.length} 人還沒填）` : "全部都填了能力表"} />
        <Kpi label="隊伍平均能力" value={fmt(v.teamAvg)} sub="滿分 5" />
        <Kpi label="最強類別" value={bestCat} sub={`平均 ${fmt(catAvg[bestCat])} 分`} />
        <Kpi label="最多人擅長" value={posCount[topPos] ? topPos : "—"} sub={posCount[topPos] ? `${posCount[topPos]} 人自評擅長` : "還沒有人填擅長位置"} />
      </div>

      <div className="panel" style={{ margin: "20px 0 12px", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="muted" style={{ fontSize: 14 }}>篩選擅長位置{filter.length > 0 && <button type="button" className="btn btn-text" style={{ fontSize: 14 }} onClick={() => setFilter([])}>清除</button>}</span>
        {groupByLine(POSITIONS).map(({ line, positions }) => (
          <div key={line.name} role="group" aria-label={line.name} className="chips">
            <span style={{ width: 40, fontSize: 14, fontWeight: 700, color: line.color }}>{line.name}</span>
            {positions.map((pos) => {
              const on = filter.includes(pos);
              return (
                <button key={pos} type="button" className="chip" aria-pressed={on}
                  style={on ? { borderColor: line.color, background: line.color, color: "#0B1220", fontWeight: 700 } : { borderColor: `${line.color}66`, color: line.color }}
                  onClick={() => setFilter(on ? filter.filter((x) => x !== pos) : [...filter, pos])}>{pos}</button>
              );
            })}
          </div>
        ))}
      </div>

      <div role="radiogroup" aria-label="要看哪些能力" className="chips" style={{ marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 14, marginRight: 4 }}>顯示</span>
        {[["cat", "五大類別"], ...RULES.categories.map((c) => [c.name, `${c.name}（${c.abilities.length}）`])].map(([k, label]) => (
          <button key={k} type="button" role="radio" className="chip" aria-checked={scope === k} onClick={() => chooseScope(k)}>{label}</button>
        ))}
      </div>
      <div role="radiogroup" aria-label="排序方式" className="chips" style={{ marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 14, marginRight: 4 }}>排序</span>
        {sorts.map(([k, label]) => (
          <button key={k} type="button" role="radio" className="chip" aria-checked={key === k} onClick={() => chooseSort(k)}>{label}</button>
        ))}
        <button type="button" className="btn btn-line btn-sm" style={{ marginLeft: 4 }} onClick={() => setDir(dir === "asc" ? "desc" : "asc")}
          aria-label={`目前${dir === "asc" ? "由小到大" : "由大到小"}，點一下反過來`}>{dirLabel}</button>
      </div>
      <div role="radiogroup" aria-label="格子裡顯示什麼" className="chips" style={{ marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 14, marginRight: 4 }}>格子顯示</span>
        <button type="button" role="radio" className="chip" aria-checked={cell === "score"} onClick={() => setCell("score")}>分數</button>
        <button type="button" role="radio" className="chip" aria-checked={cell === "rank"} onClick={() => setCell("rank")}>隊內名次</button>
      </div>

      {rows.length === 0 ? (
        <p className="panel muted" style={{ padding: 16, margin: 0 }}>沒有符合篩選條件的球員。點上面的位置可以取消篩選。</p>
      ) : (
        <>
          <div className="tbl" style={{ ["--n" as string]: cols.length, ["--scw" as string]: `${cols.length * 44 + (cols.length - 1) * 4}px` } as CSSProperties}>
            <div className="prow head" aria-hidden="true">
              <span className="c-num" style={hl(key === "num")}>{rankMode ? "名次" : "背號"}</span>
              <span className="c-name" style={hl(key === "name")}>球員</span>
              <span className="c-avg" style={hl(key === "avg")}>平均</span>
              <span className="c-sc">{cols.map((c, i) => <span key={c.label} className="sch" style={hl(key === `col:${i}`)}>{c.label}</span>)}</span>
              <span className="c-pos" style={{ display: "block", textAlign: "right", whiteSpace: "nowrap" }}>
                <span style={{ color: "#BFDBFE" }}>★ 數據推薦</span><span style={{ color: "#86EFAC", marginLeft: 14 }}>擅長</span><span style={{ color: "#FCA5A5", marginLeft: 14 }}>不擅長</span>
              </span>
            </div>
            {rows.map((p) => {
              const sv = sortVal(p) as number;
              const rk = rankMode ? (dir === "asc" ? rankAsc(sv, allVals) : rank(sv, allVals)) : 0;
              const podium = rankMode && dir === "desc" && rk <= 3;
              return (
                <button key={p.id} type="button" className="prow" onClick={() => router.push(`/t/${teamId}/players/${p.id}`)}
                  aria-label={`打開${p.name}的球員報告，平均 ${fmt(p.avg)}`}>
                  <span className="c-num">
                    <span style={podium
                      ? { display: "inline-block", minWidth: 34, padding: "1px 6px", borderRadius: 99, textAlign: "center", fontWeight: 700,
                          background: ["#F5A524", "#93C5FD", "#60A5FA"][rk - 1], color: "#0B1220" }
                      : { fontVariantNumeric: "tabular-nums", ...(rankMode ? { fontWeight: 700, color: "#C7D7F5" } : { color: "#8A97AD" }) }}>
                      {rankMode ? `#${rk}` : p.jersey_number || "—"}
                    </span>
                  </span>
                  <span className="c-name">
                    <b style={{ fontSize: 17 }}>{p.name}</b>
                    {rankMode && p.jersey_number && <span className="faint num" style={{ fontSize: 13, marginLeft: 6 }}>#{p.jersey_number}</span>}
                    {p.nickname && <span className="faint" style={{ fontSize: 13, marginLeft: 6 }}>{p.nickname}</span>}
                  </span>
                  <span className="c-avg" style={{ fontSize: 18 }}>{fmt(p.avg)}</span>
                  <span className="c-sc">
                    {cols.map((c, i) => {
                      const val = c.val(p);
                      const ring = key === `col:${i}` ? { boxShadow: "0 0 0 2px #93C5FD" } : {};
                      if (cell === "rank") {
                        const r = rank(val, P.map(c.val));
                        return <span key={c.label} className="sc" style={{ ...heat(5 - (4 * (r - 1)) / Math.max(1, P.length - 1)), fontSize: 14, ...ring }}>#{r}</span>;
                      }
                      return <span key={c.label} className="sc" style={{ ...heat(val), ...ring }}>{fmt(val, c.dec)}</span>;
                    })}
                  </span>
                  <span className="c-pos">
                    <span className="tags" style={{ justifyContent: "flex-end" }}>{p.rec.map((x) => <PrefTag key={x} pos={x} kind="rec" />)}</span>
                    <span className="tags" style={{ justifyContent: "flex-end" }}>
                      {p.good_positions.length || p.bad_positions.length
                        ? [...p.good_positions.map((x) => <PrefTag key={`g${x}`} pos={x} kind="good" />), ...p.bad_positions.map((x) => <PrefTag key={`b${x}`} pos={x} kind="bad" />)]
                        : <span className="faint" style={{ fontSize: 13 }}>沒有填擅長位置</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="faint" style={{ margin: "8px 0 0", fontSize: 13 }}>
            {cell === "rank" ? "格子裡是隊內名次（1 = 最強），同分同名次，顏色越深名次越前面。"
              : `自評能力 1–5 分，顏色越深分數越高。${rankMode ? "同分同名次。" : ""}`}點任何一列可以打開球員報告。
          </p>
        </>
      )}

      {unrated.length > 0 && (
        <section className="panel pad" style={{ marginTop: 16 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>還沒填能力表（{unrated.length}）</h2>
          <div className="chips">{unrated.map((p) => <span key={p.id} className="pill">{p.name}</span>)}</div>
        </section>
      )}

      <section aria-labelledby="poscount-h" className="panel" style={{ marginTop: 24, padding: "16px 24px" }}>
        <h2 id="poscount-h" style={{ margin: "0 0 12px", fontSize: 20 }}>各位置自評擅長人數</h2>
        {groupByLine(POSITIONS).map(({ line, positions }) => (
          <div key={line.name}>
            <p style={{ margin: "10px 0 2px", fontSize: 14, fontWeight: 700, color: line.color }}>{line.name}</p>
            {positions.map((pos) => (
              <div key={pos} title={`${pos}：${posCount[pos]} 人`} style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) 36px", gap: 12, alignItems: "center", padding: "3px 0" }}>
                <span style={{ fontSize: 14 }}>{pos}</span><Bar frac={posCount[pos] / maxCount} color={line.color} height={14} />
                <span className="num" style={{ textAlign: "right" }}>{posCount[pos]}</span>
              </div>
            ))}
          </div>
        ))}
      </section>
    </>
  );
}

function Compare() {
  const v = useTeamView();
  const P = v.rated;
  const [a, setA] = useState<string>(v.myPlayer?.scores ? v.myPlayer.id : P[0]?.id ?? "");
  const [b, setB] = useState<string>(P.find((p) => p.id !== a)?.id ?? "");
  const [vsTeam, setVsTeam] = useState(P.length < 2);
  if (P.length === 0) return <p className="panel muted pad">還沒有人填能力表，沒辦法比較。</p>;

  const A = P.find((p) => p.id === a) ?? P[0];
  const Bp = P.find((p) => p.id === b) ?? P.find((p) => p.id !== A.id) ?? P[0];
  const useTeam = vsTeam || P.length < 2;
  const bScores = useTeam ? v.teamScores : Bp.scores!;
  const bCat = useTeam ? v.teamCat : Bp.cat;
  const bAvg = useTeam ? v.teamAvg : Bp.avg;
  const bName = useTeam ? "全隊平均" : Bp.name;
  const diffs = ABILITIES.map((x) => ({ ...x, a: A.scores![x.key] ?? 0, b: bScores[x.key] ?? 0 }))
    .map((x) => ({ ...x, d: x.a - x.b })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 5);
  const diffStyle = (d: number): CSSProperties => ({ textAlign: "right", color: d > 0 ? "#2DD4BF" : d < 0 ? "#F5A524" : "#8A97AD" });

  return (
    <>
      <div className="panel pad">
        <p style={{ margin: "0 0 8px", fontWeight: 700 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "#11A595", marginRight: 8 }} />球員 A</p>
        <div className="chips">{P.map((p) => <button key={p.id} type="button" className="chip" aria-pressed={p.id === A.id} onClick={() => setA(p.id)}>{p.name}</button>)}</div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 10, margin: "16px 0 8px", cursor: "pointer" }}>
          <input type="checkbox" checked={useTeam} disabled={P.length < 2} onChange={() => setVsTeam(!vsTeam)} style={{ width: 20, height: 20, accentColor: "#2DD4BF" }} />和全隊平均比
        </label>
        {!useTeam && (
          <>
            <p style={{ margin: "8px 0", fontWeight: 700 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "#D08000", marginRight: 8 }} />球員 B</p>
            <div className="chips">{P.map((p) => <button key={p.id} type="button" className="chip" aria-pressed={p.id === Bp.id} onClick={() => setB(p.id)}>{p.name}</button>)}</div>
          </>
        )}
      </div>
      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16 }}>
        <figure className="panel" style={{ flex: "3 1 340px", minWidth: 0, margin: 0, padding: 16 }}>
          <figcaption style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, marginBottom: 8 }}>
            <LegendLine color="#11A595">{A.name}</LegendLine>
            <LegendLine color={useTeam ? "#8A97AD" : "#D08000"} dashed={useTeam}>{bName}</LegendLine>
          </figcaption>
          <Radar abilities={ABILITIES} label={`${A.name} 和 ${bName} 的 21 項能力雷達圖`} series={[
            { values: ABILITIES.map((x) => bScores[x.key] ?? 0), color: useTeam ? "#8A97AD" : "#D08000", fill: useTeam ? "none" : "rgba(208,128,0,.18)", dashed: useTeam, width: 0.7 },
            { values: ABILITIES.map((x) => A.scores![x.key] ?? 0), color: "#11A595", fill: "rgba(17,165,149,.22)" },
          ]} />
        </figure>
        <div style={{ flex: "2 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Kpi label={A.name} value={fmt(A.avg)} sub={`平均能力（${signed(A.avg - bAvg)}）`} />
            <Kpi label={bName} value={fmt(bAvg)} sub="平均能力" />
          </div>
          <div className="panel" style={{ padding: "12px 16px" }}>
            <p style={{ margin: "0 0 4px", fontWeight: 700 }}>差距最大的 5 項能力</p>
            <div className="ab faint" style={{ gridTemplateColumns: "1fr 40px 48px 52px", borderTop: 0, fontSize: 13 }}><span>能力</span><span style={{ textAlign: "right" }}>A</span><span style={{ textAlign: "right" }}>{useTeam ? "隊平均" : "B"}</span><span style={{ textAlign: "right" }}>差距</span></div>
            {diffs.map((d) => (
              <div key={d.key} className="ab" style={{ gridTemplateColumns: "1fr 40px 48px 52px" }}>
                <span>{d.label}<span className="faint" style={{ fontSize: 13, marginLeft: 6 }}>{d.category}</span></span>
                <span className="n">{fmt(d.a, 0)}</span><span className="n">{fmt(d.b, useTeam ? 1 : 0)}</span><span className="n" style={diffStyle(d.d)}>{signed(d.d, 1)}</span>
              </div>
            ))}
          </div>
          <div className="panel" style={{ padding: "12px 16px" }}>
            <p style={{ margin: "0 0 4px", fontWeight: 700 }}>類別分數</p>
            <div className="ab faint" style={{ gridTemplateColumns: "1fr 48px 52px 56px", borderTop: 0, fontSize: 13 }}><span>類別</span><span style={{ textAlign: "right" }}>A</span><span style={{ textAlign: "right" }}>{useTeam ? "隊平均" : "B"}</span><span style={{ textAlign: "right" }}>差距</span></div>
            {CATEGORY_NAMES.map((c) => {
              const d = (A.cat[c] ?? 0) - (bCat[c] ?? 0);
              return (
                <div key={c} className="ab" style={{ gridTemplateColumns: "1fr 48px 52px 56px" }}>
                  <span>{c}</span><span className="n">{fmt(A.cat[c] ?? 0)}</span><span className="n">{fmt(bCat[c] ?? 0)}</span><span className="n" style={diffStyle(d)}>{signed(d)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
