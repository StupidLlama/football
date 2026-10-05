"use client";
// 能力表（F9）：21 項能力 1–5 分（分 5 步，一個類別一步）＋ 位置、弱腳、暱稱、給球隊的話。
// 每改一次就存草稿在這台裝置，關掉再回來會接著填；送出後草稿清掉。目標：手機 3 分鐘內填完。
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { actions } from "@/lib/api";
import { ABILITIES, POSITIONS, RULES } from "@/lib/config";
import { read, write } from "@/lib/prefs";
import type { Scores } from "@/lib/rating";
import { message } from "@/lib/status";
import { useTeamView } from "@/lib/team";
import type { PlayerView } from "@/lib/teamview";
import { fromChoice, PositionPicker, toChoice, WeakFootPicker, type PosChoice } from "@/components/position-picker";
import { ErrorBox, Radar } from "@/components/ui";

const SCALE = ["很弱", "偏弱", "普通", "不錯", "很強"];
type Draft = { scores: Scores; pos: PosChoice; weak: "" | "left" | "right"; nick: string; msg: string; step: number; savedAt: string };

export default function FormPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const v = useTeamView();
  const p = v.myPlayer;
  if (!p) {
    const pending = !!(v.me.claim_player_id || v.me.claim_new_name);
    return (
      <div className="panel pad" style={{ maxWidth: 640 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 26 }}>能力表</h1>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          {pending ? "你的認領還在等教練確認。確認後就可以填能力表了。" : "要先連到名單上的自己，才能填能力表。"}
        </p>
        {!pending && <Link className="btn btn-main" href={`/t/${teamId}/claim`}>找到名單上的自己</Link>}
      </div>
    );
  }
  return <AbilityForm p={p} teamId={teamId} key={p.id} />;
}

function AbilityForm({ p, teamId }: { p: PlayerView; teamId: string }) {
  const v = useTeamView();
  const draftKey = `fap:form:${teamId}:${p.id}`;
  const fresh = (): Draft => ({
    scores: { ...(p.scores ?? {}) }, pos: toChoice(p.good_positions, p.bad_positions), weak: p.weak_side,
    nick: p.nickname, msg: p.message, step: 0, savedAt: "",
  });
  const [d, setD] = useState<Draft>(fresh);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  // 讀草稿：比最新一筆能力表還新才用
  useEffect(() => {
    const raw = read(draftKey);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Draft;
        if (!p.submittedAt || Date.parse(saved.savedAt) > Date.parse(p.submittedAt)) { setD({ ...fresh(), ...saved }); setRestored(true); }
      } catch { /* 壞掉的草稿就不管 */ }
    }
    loaded.current = true;
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<Draft>) => {
    setD((cur) => {
      const next = { ...cur, ...patch, savedAt: new Date().toISOString() };
      if (loaded.current) write(draftKey, JSON.stringify(next));
      return next;
    });
  };

  const steps = [...RULES.categories.map((c) => c.name), "位置和介紹"];
  const last = steps.length - 1;
  const answered = ABILITIES.filter((a) => typeof d.scores[a.key] === "number").length;
  const missingCats = RULES.categories.map((c, i) => ({ name: c.name, i, n: c.abilities.filter((a) => typeof d.scores[a.key] !== "number").length }))
    .filter((c) => c.n > 0);
  const radarValues = useMemo(() => ABILITIES.map((a) => d.scores[a.key] ?? 0), [d.scores]);

  const go = (step: number) => {
    update({ step });
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  async function submit() {
    if (missingCats.length) { setError(`還有 ${ABILITIES.length - answered} 項沒填：${missingCats.map((c) => c.name).join("、")}`); return; }
    setBusy(true); setError("");
    const { good, bad } = fromChoice(d.pos);
    const scores = Object.fromEntries(ABILITIES.map((a) => [a.key, d.scores[a.key]]));
    const r = await actions.submitRating(teamId, { scores, good, bad, weakSide: d.weak, nickname: d.nick.trim(), message: d.msg.trim() });
    if (r.status === "ok") {
      write(draftKey, null);
      await v.reload();
      setDone(true);
    } else {
      setError(message(r));
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="panel" style={{ padding: 24, maxWidth: 640, borderTop: "3px solid #2DD4BF" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 28 }}>送出了，謝謝！</h1>
        <p className="muted" style={{ margin: "0 0 16px" }}>隊友現在看得到你的能力雷達圖和擅長位置。之後有進步，隨時可以回來重填（舊的紀錄會保留）。</p>
        <div className="chips">
          <Link className="btn btn-main" href={`/t/${teamId}/players/${p.id}`}>看我的球員報告</Link>
          <Link className="btn btn-line" href={`/t/${teamId}/players`}>看全隊能力</Link>
        </div>
      </div>
    );
  }

  const cat = RULES.categories[d.step];
  return (
    <div ref={top} style={{ scrollMarginTop: 16 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 28 }}>{p.scores ? "重新填能力表" : "能力表"}</h1>
      <p className="muted" style={{ margin: "0 0 12px" }}>
        {v.data.team.name}{v.data.team.season ? `（${v.data.team.season}）` : ""}・照你現在的程度誠實填，沒有對錯。每一步都會自動存在這台裝置。
      </p>
      {restored && (
        <p className="status" role="status">
          已接著你上次沒填完的部分。
          <button type="button" className="btn btn-text" onClick={() => { write(draftKey, null); setD(fresh()); setRestored(false); }}>清掉草稿重來</button>
        </p>
      )}

      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#0B1220", padding: "8px 0 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6, gap: 8 }}>
          <span><b>第 {d.step + 1} / {steps.length} 步</b>：{steps[d.step]}</span>
          <span className="faint num">{answered} / {ABILITIES.length} 項</span>
        </div>
        <div className="progress" role="progressbar" aria-label="已填幾項" aria-valuemin={0} aria-valuemax={ABILITIES.length} aria-valuenow={answered}>
          <span style={{ width: `${(answered / ABILITIES.length) * 100}%` }} />
        </div>
        <div className="chips" style={{ marginTop: 8, gap: 6 }}>
          {steps.map((s, i) => {
            const c = RULES.categories[i];
            const full = c ? c.abilities.every((a) => typeof d.scores[a.key] === "number") : false;
            return (
              <button key={s} type="button" className="chip" aria-current={i === d.step ? "step" : undefined} onClick={() => go(i)}
                style={i === d.step ? { borderColor: "#60A5FA", background: "#16305E", color: "#fff", fontWeight: 700, minHeight: 32 }
                  : { minHeight: 32, ...(full ? { borderColor: "#2DD4BF66", color: "#7EEADB" } : {}) }}>
                {full ? "✓ " : ""}{s}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <section className="panel pad" style={{ flex: "3 1 340px", minWidth: 0 }} aria-label={steps[d.step]}>
          {cat ? (
            <>
              <p className="faint" style={{ margin: "0 0 4px", fontSize: 13 }}>1 {SCALE[0]}・2 {SCALE[1]}・3 {SCALE[2]}・4 {SCALE[3]}・5 {SCALE[4]}</p>
              {cat.abilities.map((a) => (
                <div key={a.key} className="qrow" role="radiogroup" aria-label={a.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <b style={{ fontSize: 17 }}>{a.label}</b>
                    <span className="faint" style={{ fontSize: 13 }}>{d.scores[a.key] ? SCALE[d.scores[a.key] - 1] : "還沒選"}</span>
                  </div>
                  <div className="scale">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={d.scores[a.key] === n} aria-label={`${a.label} ${n} 分（${SCALE[n - 1]}）`}
                        onClick={() => update({ scores: { ...d.scores, [a.key]: n } })}>{n}</button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="stack" style={{ gap: 16 }}>
              <div>
                <p style={{ margin: "0 0 4px", fontWeight: 700 }}>擅長和不擅長的位置</p>
                <p className="faint" style={{ margin: "0 0 8px", fontSize: 14 }}>點一下是「擅長」，再點一下是「不擅長」，第三下取消。可以不選。</p>
                <PositionPicker positions={POSITIONS} value={d.pos} onChange={(pos) => update({ pos })} />
              </div>
              <div>
                <p style={{ margin: "0 0 8px", fontWeight: 700 }}>弱腳是哪一腳</p>
                <WeakFootPicker value={d.weak} onChange={(weak) => update({ weak })} />
              </div>
              <label className="label">暱稱（希望別人怎麼叫你，可以空白）
                <input className="field" value={d.nick} maxLength={20} onChange={(e) => update({ nick: e.target.value })} placeholder="例如：阿成" />
              </label>
              <label className="label">有什麼是你希望球隊上的人知道的？（可以空白）
                <textarea className="field" value={d.msg} maxLength={300} onChange={(e) => update({ msg: e.target.value })} placeholder="例如：想多練弱腳、週三晚上不能練球" />
              </label>
              {missingCats.length > 0 && (
                <div className="status warn" role="status">
                  還有 {ABILITIES.length - answered} 項能力沒填：
                  {missingCats.map((c) => (
                    <button key={c.name} type="button" className="btn btn-text" onClick={() => go(c.i)}>{c.name}（{c.n}）</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {error && <div style={{ marginTop: 12 }}><ErrorBox text={error} /></div>}
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {d.step > 0 && <button type="button" className="btn btn-line" onClick={() => go(d.step - 1)}>上一步</button>}
            {d.step < last
              ? <button type="button" className="btn btn-main" style={{ flex: 1 }} onClick={() => go(d.step + 1)}>下一步：{steps[d.step + 1]}</button>
              : <button type="button" className="btn btn-main" style={{ flex: 1 }} onClick={submit} disabled={busy}>{busy ? "送出中…" : "送出能力表"}</button>}
          </div>
        </section>
        <figure className="panel" style={{ flex: "1 1 240px", minWidth: 0, maxWidth: 420, margin: 0, padding: 16 }}>
          <figcaption className="faint" style={{ fontSize: 13, marginBottom: 4 }}>你的雷達圖（灰色虛線是全隊平均）</figcaption>
          <Radar abilities={ABILITIES} showLabels={false} label="目前填的能力雷達圖" series={[
            ...(v.rated.length ? [{ values: ABILITIES.map((a) => v.teamScores[a.key] ?? 0), color: "#8A97AD", dashed: true, width: 0.6 }] : []),
            { values: radarValues, color: "#11A595", fill: "rgba(17,165,149,.22)" },
          ]} />
        </figure>
      </div>
    </div>
  );
}
