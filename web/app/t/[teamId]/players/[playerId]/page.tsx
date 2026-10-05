"use client";
// 球員報告：能力分析（雷達圖、強項、待加強、類別）、位置（球場圖、適合度）、比賽數據（之後）。
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { ABILITIES, CATEGORY_NAMES, POSITIONS, RULES } from "@/lib/config";
import { groupByLine, lineOf, PITCH } from "@/lib/positions";
import { rank, strengths } from "@/lib/rating";
import { useTeamView } from "@/lib/team";
import { Bar, CaptainBadge, dateLabel, Feet, fmt, footText, Kpi, LegendLine, PrefTag, Radar, signed } from "@/components/ui";

export default function ReportPage() {
  const { teamId, playerId } = useParams<{ teamId: string; playerId: string }>();
  const v = useTeamView();
  const [tab, setTab] = useState<"ability" | "pos" | "match">("ability");
  const R = v.players.find((p) => p.id === playerId);
  const back = <Link className="btn btn-line btn-sm" href={`/t/${teamId}/players`} style={{ marginBottom: 12 }}>回球員列表</Link>;
  if (!R) return <>{back}<p className="panel muted pad">找不到這位球員。</p></>;

  const team = v.rated.map((p) => p.scores!);
  const label = footText(R.weak_side, R.scores?.weak_foot);
  const header = (
    <header style={{ display: "flex", flexWrap: "wrap", gap: "16px 24px", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.2, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="num faint">{R.jersey_number ? `#${R.jersey_number}` : "#—"}</span>{R.name}<CaptainBadge badge={R.badge} size={15} />
        </h1>
        <p className="faint" style={{ margin: "4px 0 0" }}>{R.nickname ? `暱稱：${R.nickname}` : "　"}</p>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>{label}</p>
        {R.submittedAt && <p className="faint" style={{ margin: "2px 0 0", fontSize: 13 }}>能力表：{dateLabel(R.submittedAt)}{R.source === "form" ? "" : "（從 Google 表單匯入）"}</p>}
      </div>
      <Feet weakSide={R.weak_side} label={label} />
    </header>
  );
  const msg = R.message && (
    <p className="panel" style={{ margin: "16px 0 0", padding: "12px 16px" }}><span className="accent" style={{ marginRight: 8 }}>給球隊的話</span>{R.message}</p>
  );

  if (!R.scores) {
    return (
      <>{back}{header}
        <div className="panel pad" style={{ marginTop: 16 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{R.name} 還沒填能力表</p>
          <p className="muted" style={{ margin: "4px 0 0" }}>{R.id === v.me.player_id ? <Link href={`/t/${teamId}/form`}>現在去填（約 3 分鐘）</Link> : "填完之後這裡會出現雷達圖和位置分析。"}</p>
        </div>
        {msg}
      </>
    );
  }

  const S = R.scores;
  const { strong, weak } = strengths(S, team, RULES, 5);
  const best = strong[0];
  const avgs = v.rated.map((p) => p.avg);

  return (
    <>
      {back}
      {header}
      <div className="kpis" style={{ marginTop: 16 }}>
        <Kpi label="平均能力" value={fmt(R.avg)} sub={`比隊平均 ${signed(R.avg - v.teamAvg)}`} />
        <Kpi label="隊內排名" value={`#${rank(R.avg, avgs)}`} sub={`共 ${v.rated.length} 人（依平均能力）`} />
        <Kpi label="數據推薦位置" value={R.rec[0]} sub={`其次 ${R.rec.slice(1).join("、")}`} />
        <Kpi label="最強能力" value={best.label} sub={`${best.score} 分，隊內 #${best.rank}`} />
      </div>
      <div className="tabs" role="tablist" aria-label="球員報告" style={{ marginTop: 20 }}>
        {([["ability", "能力分析"], ["pos", "位置"], ["match", "比賽數據"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" className="tabbtn" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "ability" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <figure className="panel" style={{ flex: "3 1 340px", minWidth: 0, margin: 0, padding: 16 }}>
            <figcaption style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, marginBottom: 8 }}>
              <LegendLine color="#11A595">{R.name}</LegendLine><LegendLine color="#8A97AD" dashed>全隊平均</LegendLine>
            </figcaption>
            <Radar abilities={ABILITIES} label={`${R.name} 的 21 項能力雷達圖，和全隊平均比較。最強：${strong.map((s) => s.label).join("、")}`} series={[
              { values: ABILITIES.map((a) => v.teamScores[a.key] ?? 0), color: "#8A97AD", dashed: true, width: 0.6 },
              { values: ABILITIES.map((a) => S[a.key] ?? 0), color: "#11A595", fill: "rgba(17,165,149,.22)" },
            ]} />
          </figure>
          <div style={{ flex: "2 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <AbilityTable title="強項" rows={strong} />
            <AbilityTable title="待加強" rows={weak} />
            <div className="panel" style={{ padding: "12px 16px" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700 }}>類別分數</p>
              <div className="ab faint" style={{ gridTemplateColumns: "1fr 48px 56px 72px", borderTop: 0, fontSize: 13 }}>
                <span>類別</span><span style={{ textAlign: "right" }}>他</span><span style={{ textAlign: "right" }}>隊平均</span><span style={{ textAlign: "right" }}>隊內名次</span>
              </div>
              {CATEGORY_NAMES.map((c) => (
                <div key={c} className="ab" style={{ gridTemplateColumns: "1fr 48px 56px 72px" }}>
                  <span>{c}</span><span className="n">{fmt(R.cat[c])}</span><span className="n faint">{fmt(v.teamCat[c])}</span>
                  <span className="n faint">#{rank(R.cat[c], v.rated.map((p) => p.cat[c]))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "pos" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <figure className="panel" style={{ flex: "3 1 340px", minWidth: 0, margin: 0, padding: 16 }}>
            <figcaption style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, marginBottom: 12 }}>
              {groupByLine(POSITIONS).map(({ line }) => (
                <span key={line.name}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", marginRight: 6, verticalAlign: "middle", background: line.color }} />{line.name}</span>
              ))}
              <span className="faint">實心＝自評擅長　✕＝不擅長　★＝數據推薦</span>
            </figcaption>
            <div style={{ position: "relative", width: "100%", aspectRatio: "105 / 68", borderRadius: 10, background: "#13301F", overflow: "hidden" }}>
              <svg viewBox="0 0 105 68" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true" focusable="false">
                <g fill="none" stroke="rgba(233,237,243,.45)" strokeWidth="0.4">
                  <rect x="1" y="1" width="103" height="66" /><path d="M52.5 1V67" /><circle cx="52.5" cy="34" r="9" />
                  <rect x="1" y="14" width="16" height="40" /><rect x="88" y="14" width="16" height="40" />
                </g>
              </svg>
              {POSITIONS.filter((pos) => PITCH[pos]).map((pos) => {
                const [x, y] = PITCH[pos];
                const good = R.good_positions.includes(pos), bad = R.bad_positions.includes(pos), rec = R.rec.includes(pos);
                const lc = lineOf(pos).color;
                const style: CSSProperties = {
                  position: "absolute", left: `${(x / 105 * 100).toFixed(1)}%`, top: `${((68 - y) / 68 * 100).toFixed(1)}%`, transform: "translate(-50%, -50%)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, minWidth: 40, height: 40, padding: "0 4px", borderRadius: 99,
                  ...(good ? { background: lc, color: "#0B1220", border: `2px solid ${lc}` }
                    : bad ? { background: "#0B1220", color: lc, border: `2px dashed ${lc}` }
                    : { background: "rgba(11,18,32,.6)", color: lc, border: `1px solid ${lc}88` }),
                };
                return (
                  <span key={pos} style={style} title={`${pos}：適合度 ${Math.round(R.fit[pos])}${good ? "，自評擅長" : bad ? "，自評不擅長" : rec ? "，數據推薦" : ""}`}>
                    {(bad ? "✕ " : "") + pos.replace("/", " ") + (rec ? " ★" : "")}
                  </span>
                );
              })}
            </div>
            <p className="faint" style={{ margin: "8px 0 0", fontSize: 13 }}>進攻方向朝右。</p>
          </figure>
          <div style={{ flex: "2 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="panel" style={{ padding: "12px 16px" }}>
              <p style={{ margin: "0 0 8px", fontWeight: 700 }}>自評擅長</p>
              <div className="tags">{R.good_positions.length ? R.good_positions.map((x) => <PrefTag key={x} pos={x} kind="good" />) : <span className="faint">沒有填</span>}</div>
              <p style={{ margin: "12px 0 8px", fontWeight: 700 }}>自評不擅長</p>
              <div className="tags">{R.bad_positions.length ? R.bad_positions.map((x) => <PrefTag key={x} pos={x} kind="bad" />) : <span className="faint">沒有填</span>}</div>
            </div>
            <div className="panel" style={{ padding: "12px 16px" }}>
              <p style={{ margin: "0 0 8px", fontWeight: 700 }}>各位置適合度<span className="faint" style={{ fontWeight: 400, fontSize: 13, marginLeft: 6 }}>數據推算，滿分 100</span></p>
              {groupByLine(POSITIONS).map(({ line, positions }) => (
                <div key={line.name}>
                  <p style={{ margin: "10px 0 2px", fontSize: 14, fontWeight: 700, color: line.color }}>{line.name}</p>
                  {positions.slice().sort((a, b) => R.fit[b] - R.fit[a]).map((pos) => (
                    <div key={pos} style={{ display: "grid", gridTemplateColumns: "84px 1fr 36px", gap: 10, alignItems: "center", padding: "3px 0" }}>
                      <span style={{ fontSize: 14 }}>{pos}{R.rec.includes(pos) && <span style={{ color: "#FACC15", marginLeft: 4 }}>★</span>}</span>
                      <Bar frac={R.fit[pos] / 100} color={line.color} height={12} />
                      <span className="num" style={{ textAlign: "right" }}>{Math.round(R.fit[pos])}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "match" && (
        <div className="panel" style={{ padding: 24, display: "flex", gap: 16, alignItems: "center" }}>
          <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" focusable="false" style={{ flex: "none" }}><rect x="6" y="12" width="44" height="32" rx="4" fill="none" stroke="#4A5A7A" strokeWidth="2" /><path d="M24 22l10 6-10 6z" fill="#4A5A7A" /></svg>
          <div><p style={{ margin: 0, fontWeight: 700 }}>還沒有比賽數據</p><p className="muted" style={{ margin: "4px 0 0" }}>影片分析上線後（v3），跑動距離、傳球、熱區圖會出現在這裡。</p></div>
        </div>
      )}
      {msg}
    </>
  );
}

function AbilityTable({ title, rows }: { title: string; rows: { key: string; label: string; score: number; rank: number }[] }) {
  return (
    <div className="panel" style={{ padding: "12px 16px" }}>
      <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{title}</p>
      <div className="ab faint" style={{ gridTemplateColumns: "1fr 40px 72px", borderTop: 0, fontSize: 13 }}>
        <span>能力</span><span style={{ textAlign: "right" }}>分數</span><span style={{ textAlign: "right" }}>隊內名次</span>
      </div>
      {rows.map((s) => (
        <div key={s.key} className="ab" style={{ gridTemplateColumns: "1fr 40px 72px" }}>
          <span>{s.label}</span><span className="n">{s.score}</span><span className="n faint">#{s.rank}</span>
        </div>
      ))}
    </div>
  );
}
