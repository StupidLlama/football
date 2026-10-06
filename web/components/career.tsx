"use client";
// 球員生涯（v2.3）：同一個帳號在不同球隊（賽季）的能力表串成一條時間線。
// 資料來自 get_career：本人看得到自己所有隊伍（沒放進生涯的標「只有你看得到」）；隊友只看得到放進生涯的隊伍＋這一隊。
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCareer } from "@/lib/api";
import { buildCareer, defaultPair, pointLabel, trendPoints, type Career, type CareerResult } from "@/lib/career";
import { changes } from "@/lib/compare";
import { ABILITIES, RULES } from "@/lib/config";
import { message } from "@/lib/status";
import { AnimatedNumber } from "@/components/anim";
import { LineChart, type LineSeries } from "@/components/line-chart";
import { Bar, CaptainBadge, dateLabel, ErrorBox, Kpi, LegendLine, Loading, PrefTag, Radar } from "@/components/ui";

const AVG = { key: "avg", name: "平均能力", color: "#E9EDF3" };
const OLD = "#F5A524", NEW = "#2DD4BF";

export function CareerPanel({ teamId, playerId, name }: { teamId: string; playerId: string; name: string }) {
  const [res, setRes] = useState<CareerResult | null>(null);
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let alive = true;
    setRes(null); setError("");
    getCareer(teamId, playerId)
      .then((r) => { if (!alive) return; if (r.status === "ok") setRes(r); else setError(message(r)); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [teamId, playerId, tries]);

  const career = useMemo(() => (res?.entries ? buildCareer(res.entries, RULES) : null), [res]);

  if (error) return <ErrorBox text={`讀取生涯失敗：${error}`} onRetry={() => setTries((t) => t + 1)} />;
  if (!res || !career) return <Loading text="讀取生涯紀錄…" />;
  if (!res.linked) {
    return <p className="panel muted pad">{name} 還沒有連結帳號（名單上的名字還沒被認領），所以沒有生涯紀錄。</p>;
  }
  return <CareerBody career={career} self={!!res.self} name={name} teamId={teamId} />;
}

function CareerBody({ career, self, name, teamId }: { career: Career; self: boolean; name: string; teamId: string }) {
  const pts = career.points;
  const hidden = career.seasons.filter((s) => !s.current && !s.shared).length;
  const first = pts[0], last = pts[pts.length - 1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {self && (
        <div className="panel" style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 260px" }}>
            {hidden
              ? <>有 {hidden} 隊還沒放進生涯（標「只有你看得到」），隊友看不到那幾隊。</>
              : career.teamCount > 1 ? <>你所有的球隊都已經放進生涯，隊友看得到。</> : <>你目前只有這一隊。之後加入新賽季的球隊，可以把這一隊放進生涯。</>}
          </span>
          <Link className="btn btn-line btn-sm" href={`/settings?team=${encodeURIComponent(teamId)}#s-career`}>管理我的生涯</Link>
        </div>
      )}
      {!self && career.teamCount <= 1 && (
        <p className="panel muted pad" style={{ margin: 0 }}>{name} 目前只有這一隊的紀錄（或還沒把其他球隊放進生涯）。</p>
      )}

      <div className="kpis">
        <Kpi label="生涯球隊" value={<AnimatedNumber value={career.teamCount} digits={0} />} sub={career.seasons.map((s) => s.season ?? s.team_name).join("、")} />
        <Kpi label="能力表" value={<><AnimatedNumber value={pts.length} digits={0} /> 次</>} sub={first ? `第一次 ${dateLabel(first.date)}` : "還沒填過"} />
        <Kpi label="目前平均能力" value={last ? <AnimatedNumber value={last.avg} /> : "—"} sub={last ? last.teamLabel : ""} />
        <Kpi label="生涯變化" value={first && last && pts.length > 1 ? <AnimatedNumber value={last.avg - first.avg} signed /> : "—"}
          sub={pts.length > 1 ? "最新 − 第一次" : "填兩次以上才看得到"} />
      </div>

      <Timeline career={career} self={self} />
      {pts.length > 0 && <Trend career={career} name={name} />}
      {pts.length > 1 && <TwoPoints career={career} name={name} />}
    </div>
  );
}

function Timeline({ career, self }: { career: Career; self: boolean }) {
  return (
    <section className="panel" style={{ padding: "12px 16px" }} aria-labelledby="career-tl">
      <h2 id="career-tl" style={{ margin: "0 0 4px", fontSize: 18 }}>每一隊</h2>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {career.seasons.slice().reverse().map((s, i) => (
          <li key={s.team_id} className="fade-up" style={{ animationDelay: `${i * 0.07}s`, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(90px, 160px) 44px",
            gap: "4px 12px", alignItems: "center", padding: "10px 0", borderTop: i ? "1px solid #1E2A42" : 0, opacity: !s.current && !s.shared ? 0.75 : undefined }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <b>{s.label}</b>
                {s.jersey_number && <span className="num faint">#{s.jersey_number}</span>}
                <CaptainBadge badge={s.badge} />
                {s.current && <span className="tag" style={{ border: "1px solid #60A5FA88", color: "#BFDBFE" }}>這一隊</span>}
                {self && !s.current && !s.shared && <span className="tag" style={{ border: "1px dashed #4A5A7A", color: "#8A97AD" }}>只有你看得到</span>}
              </div>
              <div className="tags" style={{ marginTop: 4 }}>
                {s.good_positions.length ? s.good_positions.map((p) => <PrefTag key={p} pos={p} kind="good" />) : <span className="faint" style={{ fontSize: 13 }}>沒有填擅長位置</span>}
                <span className="faint" style={{ fontSize: 13 }}>{s.points.length ? `能力表 ${s.points.length} 次，最新 ${dateLabel(s.latest!.date)}` : "這一隊沒有填能力表"}</span>
              </div>
            </div>
            {s.latest ? <Bar frac={s.latest.avg / RULES.maxScore} color="#60A5FA" height={10} delay={i * 70} /> : <span />}
            <span className="num" style={{ textAlign: "right" }}>{s.latest ? <AnimatedNumber value={s.latest.avg} /> : "—"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Trend({ career, name }: { career: Career; name: string }) {
  const tp = trendPoints(career);
  const [on, setOn] = useState<string[]>([AVG.key]);
  const options = [AVG, ...RULES.categories.map((c) => ({ key: c.name, name: c.name, color: c.color }))];
  const series: LineSeries[] = options.filter((o) => on.includes(o.key)).map((o) => ({
    key: o.key, name: o.name, color: o.color, width: o.key === AVG.key ? 2.5 : 2,
    values: tp.map((p) => (o.key === AVG.key ? p.avg : p.cat[o.key] ?? null)),
  }));
  const toggle = (k: string) => setOn((cur) => (cur.includes(k) ? (cur.length > 1 ? cur.filter((x) => x !== k) : cur) : [...cur, k]));

  return (
    <figure className="panel" style={{ margin: 0, padding: 16 }}>
      <figcaption style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 18 }}>生涯趨勢</span>
        <span className="chips" role="group" aria-label="顯示哪些線">
          {options.map((o) => (
            <button key={o.key} type="button" className="chip" aria-pressed={on.includes(o.key)} onClick={() => toggle(o.key)}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: o.color, marginRight: 6 }} />{o.name}
            </button>
          ))}
        </span>
      </figcaption>
      {tp.length < 2 && <p className="faint" style={{ margin: "0 0 8px", fontSize: 14 }}>目前只有一個時間點；之後再填能力表或加入新賽季的球隊，就會連成線。</p>}
      <LineChart label={`${name} 的生涯趨勢：${series.map((s) => s.name).join("、")}，從 ${tp[0].teamLabel} 到 ${tp[tp.length - 1].teamLabel}`}
        xLabels={tp.map((p) => p.teamLabel)} xSub={tp.map((p) => dateLabel(p.date))} series={series} />
      <p className="faint" style={{ margin: "8px 0 0", fontSize: 13 }}>每隊取第一次和最新的能力表，滿分 {RULES.maxScore}。滑鼠移到（手機點）時間點看數字。</p>
    </figure>
  );
}

function TwoPoints({ career, name }: { career: Career; name: string }) {
  const pts = career.points;
  const pair = defaultPair(career)!;
  const [a, setA] = useState(pair[0]);
  const [b, setB] = useState(pair[1]);
  const A = pts.find((p) => p.key === a) ?? pts[0];
  const B = pts.find((p) => p.key === b) ?? pts[pts.length - 1];
  const ch = changes(A.scores, B.scores, RULES, 5);

  const picker = (id: string, label: string, value: string, set: (v: string) => void, color: string) => (
    <label className="label" style={{ flex: "1 1 220px", minWidth: 0 }}>
      <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: color, marginRight: 8 }} />{label}</span>
      <select id={id} className="field" value={value} onChange={(e) => set(e.target.value)}>
        {pts.slice().reverse().map((p) => <option key={p.key} value={p.key}>{pointLabel(p)}</option>)}
      </select>
    </label>
  );

  return (
    <section className="panel" style={{ padding: 16 }} aria-labelledby="career-two">
      <h2 id="career-two" style={{ margin: "0 0 8px", fontSize: 18 }}>兩個時間點比較</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {picker("career-a", "之前", a, setA, OLD)}
        {picker("career-b", "之後", b, setB, NEW)}
      </div>
      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 16 }}>
        <figure style={{ flex: "3 1 340px", minWidth: 0, margin: 0 }}>
          <figcaption style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, marginBottom: 8 }}>
            <LegendLine color={OLD} dashed>之前：{pointLabel(A)}</LegendLine><LegendLine color={NEW}>之後：{pointLabel(B)}</LegendLine>
          </figcaption>
          <Radar abilities={ABILITIES} label={`${name} 兩個時間點的能力雷達圖：${pointLabel(A)} 和 ${pointLabel(B)}`} series={[
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

function ChangeList({ title, rows, color, empty }: { title: string; rows: { key: string; label: string; category: string; a: number; b: number; d: number }[]; color: string; empty: string }) {
  return (
    <div className="panel" style={{ padding: "12px 16px", background: "var(--panel-2)" }}>
      <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{title}</p>
      {!rows.length && <p className="faint" style={{ margin: 0, fontSize: 14 }}>{empty}</p>}
      {rows.length > 0 && (
        <div className="ab faint" style={{ gridTemplateColumns: "1fr 44px 44px 48px", borderTop: 0, fontSize: 13 }}>
          <span>能力</span><span style={{ textAlign: "right" }}>之前</span><span style={{ textAlign: "right" }}>之後</span><span style={{ textAlign: "right" }}>變化</span>
        </div>
      )}
      {rows.map((r, i) => (
        <div key={r.key} className="ab fade-up" style={{ gridTemplateColumns: "1fr 44px 44px 48px", animationDelay: `${i * 0.06}s` }}>
          <span>{r.label}<span className="faint" style={{ fontSize: 13, marginLeft: 6 }}>{r.category}</span></span>
          <span className="n">{r.b}</span><span className="n">{r.a}</span>
          <span className="n" style={{ color }}>{r.d > 0 ? "+" : ""}{r.d}</span>
        </div>
      ))}
    </div>
  );
}
