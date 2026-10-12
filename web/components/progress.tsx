"use client";
// 賽季進步（v2.8 F8）：同一個人在同一支隊伍（各賽季）的能力變化。
// 資料來自 get_progress：同一個系列自動串起來，同隊的人都看得到（不需要打開生涯開關）。
// 每季用最後一份能力表代表；同一季較早填的可以展開看。
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getProgress } from "@/lib/api";
import { ABILITIES, RULES } from "@/lib/config";
import { buildProgress, categoryTrend, compareTwo, latestChange, trendOf, type Delta, type Progress, type ProgressResult } from "@/lib/progress";
import { message } from "@/lib/status";
import { AnimatedNumber } from "@/components/anim";
import { ChangeList } from "@/components/career";
import { LineChart, type LineSeries } from "@/components/line-chart";
import { dateLabel, ErrorBox, Kpi, LegendLine, Loading, Radar } from "@/components/ui";

const AVG = { key: "avg", name: "平均能力", color: "#E9EDF3" };
const OLD = "#F5A524", NEW = "#2DD4BF";

export function ProgressPanel({ teamId, playerId, name, extra }: { teamId: string; playerId: string; name: string; extra?: ReactNode }) {
  const [res, setRes] = useState<ProgressResult | null>(null);
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let alive = true;
    setRes(null); setError("");
    getProgress(teamId, playerId)
      .then((r) => { if (!alive) return; if (r.status === "ok") setRes(r); else setError(message(r)); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [teamId, playerId, tries]);

  const progress = useMemo(() => (res?.seasons ? buildProgress(res.seasons, RULES) : null), [res]);
  if (error) return <ErrorBox text={`讀取進步紀錄失敗：${error}`} onRetry={() => setTries((t) => t + 1)} />;
  if (!res || !progress) return <Loading text="讀取進步紀錄…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {progress.seasons.length <= 1 && (
        <p className="panel muted pad" style={{ margin: 0 }}>
          這是 {name} 在這支隊伍的第一個賽季。球隊管理員開新賽季之後，新的一季重填能力表，這裡就會出現前後比較。
        </p>
      )}
      {progress.seasons.length > 1 && progress.withData.length < 2 && (
        <p className="panel muted pad" style={{ margin: 0 }}>
          有 {progress.seasons.length} 個賽季，但至少要有兩季填過能力表才看得到進步。
        </p>
      )}
      {progress.withData.length >= 2 && <Body progress={progress} name={name} />}
      {extra}
      <Seasons progress={progress} />
    </div>
  );
}

const ARROW: Record<Delta["kind"], string> = { up: "▲", down: "▼", same: "＝" };
const COLOR: Record<Delta["kind"], string> = { up: "#2DD4BF", down: "#F5A524", same: "#8A97AD" };

function Body({ progress, name }: { progress: Progress; name: string }) {
  const ch = latestChange(progress, RULES)!;
  const tp = trendOf(progress);
  return (
    <>
      <div className="kpis">
        <Kpi label="這一季平均" value={<AnimatedNumber value={ch.to.avg} />} sub={ch.to.label} />
        <Kpi label="上一季平均" value={<AnimatedNumber value={ch.from.avg} />} sub={ch.from.label} />
        <Kpi label="進步幅度" value={<span style={{ color: COLOR[ch.avg.kind] }}><span aria-hidden="true">{ARROW[ch.avg.kind]} </span><AnimatedNumber value={ch.avg.d} signed /></span>}
          sub={ch.avg.kind === "up" ? "比上一季進步" : ch.avg.kind === "down" ? "比上一季退步" : "跟上一季差不多"} />
        <Kpi label="填過能力表的賽季" value={<><AnimatedNumber value={tp.length} digits={0} /> 季</>} sub={`共 ${progress.seasons.length} 個賽季`} />
      </div>

      <section className="panel" style={{ padding: "12px 16px" }} aria-labelledby="pg-cat">
        <h2 id="pg-cat" style={{ margin: "0 0 8px", fontSize: 18 }}>各類別 vs 上一季</h2>
        <div className="chips" style={{ gap: 8 }}>
          {RULES.categories.map((c) => {
            const d = ch.cat[c.name];
            return (
              <span key={c.name} className="chip pop-in" style={{ borderColor: `${COLOR[d.kind]}88`, cursor: "default" }}
                aria-label={`${c.name}${d.kind === "up" ? "進步" : d.kind === "down" ? "退步" : "持平"} ${Math.abs(d.d)}`}>
                {c.name} <span style={{ color: COLOR[d.kind], marginLeft: 6 }}><span aria-hidden="true">{ARROW[d.kind]}</span> {d.d > 0 ? "+" : ""}{d.d}</span>
              </span>
            );
          })}
        </div>
      </section>

      <Trend progress={progress} name={name} />
      <TwoSeasons progress={progress} name={name} />
    </>
  );
}

function Trend({ progress, name }: { progress: Progress; name: string }) {
  const tp = trendOf(progress);
  const [on, setOn] = useState<string[]>([AVG.key]);
  const options = [AVG, ...RULES.categories.map((c) => ({ key: c.name, name: c.name, color: c.color }))];
  const series: LineSeries[] = options.filter((o) => on.includes(o.key)).map((o) => ({
    key: o.key, name: o.name, color: o.color, width: o.key === AVG.key ? 2.5 : 2,
    values: o.key === AVG.key ? tp.map((p) => p.avg) : categoryTrend(progress, o.key),
  }));
  const toggle = (k: string) => setOn((cur) => (cur.includes(k) ? (cur.length > 1 ? cur.filter((x) => x !== k) : cur) : [...cur, k]));
  const short = tp.map((p) => progress.seasons.find((s) => s.teamId === p.teamId)?.season ?? p.label);
  return (
    <figure className="panel" style={{ margin: 0, padding: 16 }}>
      <figcaption style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 18 }}>賽季趨勢</span>
        <span className="chips" role="group" aria-label="顯示哪些線">
          {options.map((o) => (
            <button key={o.key} type="button" className="chip" aria-pressed={on.includes(o.key)} onClick={() => toggle(o.key)}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: o.color, marginRight: 6 }} />{o.name}
            </button>
          ))}
        </span>
      </figcaption>
      <LineChart label={`${name} 的賽季趨勢：${series.map((s) => s.name).join("、")}，從 ${tp[0].label} 到 ${tp[tp.length - 1].label}`}
        xLabels={tp.map((p) => p.label)} xShort={short} xSub={tp.map((p) => dateLabel(p.date))} series={series} />
      <p className="faint" style={{ margin: "8px 0 0", fontSize: 13 }}>每季取最後一份能力表，滿分 {RULES.maxScore}。滑鼠移到（手機、平板點）時間點看數字。</p>
    </figure>
  );
}

function TwoSeasons({ progress, name }: { progress: Progress; name: string }) {
  const tp = trendOf(progress);
  const [a, setA] = useState(tp[tp.length - 2].key);
  const [b, setB] = useState(tp[tp.length - 1].key);
  const A = tp.find((p) => p.key === a) ?? tp[0];
  const B = tp.find((p) => p.key === b) ?? tp[tp.length - 1];
  const ch = compareTwo(A, B, RULES, 5);
  const picker = (id: string, label: string, value: string, set: (v: string) => void, color: string) => (
    <label className="label" style={{ flex: "1 1 220px", minWidth: 0 }}>
      <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: color, marginRight: 8 }} />{label}</span>
      <select id={id} className="field" value={value} onChange={(e) => set(e.target.value)}>
        {tp.slice().reverse().map((p) => <option key={p.key} value={p.key}>{p.label} · {dateLabel(p.date)}</option>)}
      </select>
    </label>
  );
  return (
    <section className="panel" style={{ padding: 16 }} aria-labelledby="pg-two">
      <h2 id="pg-two" style={{ margin: "0 0 8px", fontSize: 18 }}>兩季比較</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {picker("pg-a", "之前", a, setA, OLD)}
        {picker("pg-b", "之後", b, setB, NEW)}
      </div>
      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 16 }}>
        <figure style={{ flex: "3 1 340px", minWidth: 0, margin: 0 }}>
          <figcaption style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, marginBottom: 8 }}>
            <LegendLine color={OLD} dashed>之前：{A.label}</LegendLine><LegendLine color={NEW}>之後：{B.label}</LegendLine>
          </figcaption>
          <Radar abilities={ABILITIES} label={`${name} 兩季的能力雷達圖：${A.label} 和 ${B.label}`} series={[
            { values: ABILITIES.map((x) => A.scores[x.key] ?? 0), color: OLD, dashed: true, width: 0.7, name: "之前" },
            { values: ABILITIES.map((x) => B.scores[x.key] ?? 0), color: NEW, fill: "rgba(45,212,191,.2)", name: "之後" },
          ]} />
        </figure>
        <div style={{ flex: "2 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Kpi label="之前平均" value={<AnimatedNumber value={A.avg} />} />
            <Kpi label="之後平均" value={<AnimatedNumber value={B.avg} />} sub={<>變化 <AnimatedNumber value={B.avg - A.avg} signed /></>} />
          </div>
          <ChangeList title="進步最多" rows={ch.up} color="#2DD4BF" empty="沒有進步的項目" />
          <ChangeList title="退步最多" rows={ch.down} color="#F5A524" empty="沒有退步的項目" />
          {ch.same > 0 && <p className="faint" style={{ margin: 0, fontSize: 13 }}>另外 {ch.same} 項沒有變。</p>}
        </div>
      </div>
    </section>
  );
}

/** 每一季一列；同一季填過不只一次的，可以展開看較早的幾份。 */
function Seasons({ progress }: { progress: Progress }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="panel" style={{ padding: "12px 16px" }} aria-labelledby="pg-list">
      <h2 id="pg-list" style={{ margin: "0 0 4px", fontSize: 18 }}>每一季</h2>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {progress.seasons.slice().reverse().map((s, i) => (
          <li key={s.teamId} style={{ borderTop: i ? "1px solid #1E2A42" : 0, padding: "8px 0" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <b>{s.label}</b>
              {s.jersey && <span className="num faint">#{s.jersey}</span>}
              {s.archived && <span className="tag" style={{ border: "1px dashed #4A5A7A", color: "#8A97AD" }}>舊賽季</span>}
              <span style={{ flex: 1 }} />
              <span className="num">{s.last ? <>{s.last.avg.toFixed(2)}</>
                : <span className="faint" style={{ fontSize: 14 }}>這一季沒有填能力表</span>}</span>
            </div>
            {s.last && <p className="faint" style={{ margin: "2px 0 0", fontSize: 13 }}>最後一份：{dateLabel(s.last.date)}</p>}
            {s.earlier.length > 0 && (
              <>
                <button type="button" className="btn btn-line btn-sm" style={{ marginTop: 6 }} aria-expanded={open === s.teamId}
                  onClick={() => setOpen(open === s.teamId ? null : s.teamId)}>
                  {open === s.teamId ? "收起" : `這一季較早的 ${s.earlier.length} 份`}
                </button>
                {open === s.teamId && (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {s.earlier.slice().reverse().map((p) => (
                      <li key={p.key} className="muted" style={{ fontSize: 14 }}>{dateLabel(p.date)}：平均 {p.avg.toFixed(2)}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
