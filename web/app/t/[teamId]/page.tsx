"use client";
// 我的（進到球隊的預設頁）：我的球員卡、待辦、裁判任務、編輯我的介紹。
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { updateMyPlayer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ABILITIES, POSITIONS, RULES } from "@/lib/config";
import { rank, strengths } from "@/lib/rating";
import { useTeamView } from "@/lib/team";
import { whenLabel, type PlayerView } from "@/lib/teamview";
import { todosFor } from "@/lib/todos";
import { fromChoice, PositionPicker, toChoice, WeakFootPicker, type PosChoice } from "@/components/position-picker";
import { TodoList } from "@/components/todos";
import { fmt, Kpi, PosTag, Radar, RoleBadge, signed, useToast } from "@/components/ui";

export default function MePage() {
  const { teamId } = useParams<{ teamId: string }>();
  const v = useTeamView();
  const auth = useAuth();
  const p = v.myPlayer;
  const todos = todosFor(v, teamId, !!auth.profile?.is_admin);
  const myDuties = v.duties.filter((d) => p && d.player_id === p.id);

  return (
    <>
      {p ? <MyCard p={p} /> : (
        <section className="panel" style={{ padding: "20px 24px", borderLeft: "4px solid #60A5FA" }}>
          <p style={{ margin: 0, display: "flex", gap: 8, flexWrap: "wrap" }}><span className="pill">{v.data.team.name}</span><RoleBadge coach={v.isCoach} /></p>
          <h1 style={{ margin: "8px 0 4px", fontSize: 30 }}>{auth.profile?.display_name || "歡迎"}</h1>
          <p className="muted" style={{ margin: 0 }}>你還沒連到名單上的球員，所以還看不到自己的球員卡。</p>
        </section>
      )}

      <div className="grid2" style={{ marginTop: 16 }}>
        <section aria-labelledby="me-todo" className="panel pad">
          <h2 id="me-todo" className="accent" style={{ margin: "0 0 4px", fontSize: 20 }}>我的待辦</h2>
          <TodoList todos={todos} />
        </section>
        <section aria-labelledby="me-duty" className="panel pad">
          <h2 id="me-duty" style={{ margin: "0 0 4px", fontSize: 20 }}>
            我的裁判任務<span className="faint" style={{ fontSize: 14, fontWeight: 400, marginLeft: 8 }}>這一季 {myDuties.length} 次</span>
          </h2>
          {myDuties.length === 0 && <p className="faint" style={{ margin: "8px 0 0" }}>{p ? "目前沒有排到你。" : "連到名單後，排到你的場次會出現在這裡。"}</p>}
          {myDuties.map((d) => {
            const past = d.kickoff ? d.kickoff.getTime() < Date.now() : false;
            return (
              <div key={d.id} className="row">
                <span className="faint" style={{ width: 120, flex: "none", fontSize: 14 }}>{d.fixture ? whenLabel(d.fixture) : ""}</span>
                <span style={{ flex: 1, minWidth: 0 }}><b>{d.fixture ? `${d.fixture.home} vs ${d.fixture.away}` : "比賽"}</b>
                  <span className="faint" style={{ display: "block", fontSize: 14 }}>{d.role}</span></span>
                <span className="tag" style={past ? { color: "#8A97AD" } : { color: "#F5A524", border: "1px solid #F5A52466" }}>{past ? "已結束" : "即將到來"}</span>
              </div>
            );
          })}
        </section>
      </div>

      {p && <EditMine p={p} key={p.id + (p.submittedAt ?? "")} />}
    </>
  );
}

function MyCard({ p }: { p: PlayerView }) {
  const v = useTeamView();
  const { teamId } = useParams<{ teamId: string }>();
  const avgs = v.rated.map((x) => x.avg);
  const best = p.scores ? strengths(p.scores, v.rated.map((x) => x.scores!), RULES, 1).strong[0] : null;
  return (
    <>
      <section aria-label="我的球員卡" className="panel" style={{ padding: "20px 24px", borderLeft: "4px solid #60A5FA", display: "flex",
        flexWrap: "wrap", gap: "16px 32px", alignItems: "center" }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <p style={{ margin: 0, display: "flex", gap: 8, flexWrap: "wrap" }}><span className="pill">{v.data.team.name}</span><RoleBadge coach={v.isCoach} /></p>
          <h1 style={{ margin: "8px 0 0", fontSize: 38, lineHeight: 1.2 }}>
            <span className="num" style={{ color: "#60A5FA", marginRight: 12 }}>{p.jersey_number ? `#${p.jersey_number}` : "#—"}</span>{p.name}
          </h1>
          <p className="muted" style={{ margin: "4px 0 12px" }}>{p.nickname ? `暱稱：${p.nickname}` : "還沒有暱稱"}</p>
          <div className="tags">
            {p.good_positions.map((x) => <PosTag key={x} pos={x} />)}
            {p.bad_positions.map((x) => <PosTag key={x} pos={x} bad />)}
          </div>
        </div>
        {p.scores ? (
          <figure style={{ margin: 0, flex: "0 1 240px", minWidth: 200 }}>
            <Radar abilities={ABILITIES} showLabels={false} label={`${p.name} 的 21 項能力，和全隊平均比較`} series={[
              { values: ABILITIES.map((a) => v.teamScores[a.key] ?? 0), color: "#8A97AD", dashed: true, width: 0.7 },
              { values: ABILITIES.map((a) => p.scores![a.key] ?? 0), color: "#60A5FA", fill: "rgba(59,130,246,.25)", width: 1 },
            ]} />
            <figcaption className="faint" style={{ fontSize: 13, textAlign: "center" }}>藍色是你，灰色虛線是全隊平均</figcaption>
          </figure>
        ) : (
          <div style={{ flex: "0 1 260px" }}>
            <p className="muted" style={{ margin: "0 0 8px" }}>填完能力表，這裡會出現你的能力雷達圖。</p>
            <Link className="btn btn-main" href={`/t/${teamId}/form`}>填能力表（約 3 分鐘）</Link>
          </div>
        )}
      </section>
      {p.scores && best && (
        <div className="kpis" style={{ marginTop: 16 }}>
          <Kpi label="平均能力" value={<span className="num">{fmt(p.avg)}</span>} sub={`比隊平均 ${signed(p.avg - v.teamAvg)}`} />
          <Kpi label="隊內排名" value={<span className="num">#{rank(p.avg, avgs)}</span>} sub={`共 ${v.rated.length} 人（依平均能力）`} />
          <Kpi label="數據推薦位置" value={p.rec[0]} sub={`其次 ${p.rec.slice(1).join("、")}`} />
          <Kpi label="最強能力" value={best.label} sub={`${best.score} 分，隊內 #${best.rank}`} />
        </div>
      )}
      {p.scores && (
        <p style={{ margin: "8px 0 0" }}><Link href={`/t/${teamId}/players/${p.id}`}>看完整的球員報告（隊友看到的我）</Link></p>
      )}
    </>
  );
}

function EditMine({ p }: { p: PlayerView }) {
  const v = useTeamView();
  const say = useToast();
  const [nick, setNick] = useState(p.nickname);
  const [msg, setMsg] = useState(p.message);
  const [pos, setPos] = useState<PosChoice>(toChoice(p.good_positions, p.bad_positions));
  const [weak, setWeak] = useState(p.weak_side);
  const [busy, setBusy] = useState(false);
  const { teamId } = useParams<{ teamId: string }>();

  async function save() {
    setBusy(true);
    try {
      const { good, bad } = fromChoice(pos);
      await updateMyPlayer(p.id, { nickname: nick.trim(), message: msg.trim(), good_positions: good, bad_positions: bad, weak_side: weak });
      await v.reload();
      say("已儲存，隊友看得到你的新介紹");
    } catch (e) {
      say(`沒有儲存成功：${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="me-edit" className="panel pad" style={{ marginTop: 16 }}>
      <h2 id="me-edit" style={{ margin: "0 0 4px", fontSize: 20 }}>編輯我的介紹</h2>
      <p className="faint" style={{ margin: "0 0 12px", fontSize: 14 }}>隊友會在你的球員報告看到這些。名字、背號、隊長標記要請球隊管理員改。</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <label className="label">暱稱（希望別人怎麼叫你）
          <input className="field" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="例如：阿成" maxLength={20} />
        </label>
        <label className="label">給球隊的話
          <input className="field" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="例如：想多練弱腳" maxLength={300} />
        </label>
      </div>
      <p className="muted" style={{ margin: "16px 0 6px", fontSize: 14 }}>位置：點一下是「擅長」，再點一下是「不擅長」，第三下取消</p>
      <PositionPicker positions={POSITIONS} value={pos} onChange={setPos} />
      <p className="muted" style={{ margin: "16px 0 6px", fontSize: 14 }}>弱腳是哪一腳</p>
      <WeakFootPicker value={weak} onChange={setWeak} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <button type="button" className="btn btn-main" onClick={save} disabled={busy}>{busy ? "儲存中…" : "儲存"}</button>
        <Link className="btn btn-line" href={`/t/${teamId}/form`}>{p.scores ? "重新填能力表" : "填能力表"}</Link>
      </div>
    </section>
  );
}
