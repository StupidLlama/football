"use client";
// 我的（進到球隊的預設頁）：我的球員卡、待辦、裁判任務、編輯我的介紹。
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useLeaveGuard } from "@/components/back-button";
import { updateMyPlayer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ABILITIES, POSITIONS, RULES } from "@/lib/config";
import { rank, strengths } from "@/lib/rating";
import { useTeamView } from "@/lib/team";
import { whenLabel, type PlayerView } from "@/lib/teamview";
import { todosFor } from "@/lib/todos";
import { fromChoice, PositionPicker, toChoice, WeakFootPicker, type PosChoice } from "@/components/position-picker";
import { TodoList } from "@/components/todos";
import { AttendanceRateCard } from "@/components/attendance-rate";
import { Radar, Rate, useToast } from "@/components/ui";
import { PositionMap } from "@/components/position-map";

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
        <section className="profile" style={{ display: "block" }}>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{v.data.team.name} · {v.isCoach ? "球隊管理員" : "球員"}</p>
          <h1 style={{ margin: "4px 0", fontSize: 30 }}>{auth.profile?.display_name || "歡迎"}</h1>
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
                <span className="tag" style={past ? { color: "#8A97AD" } : { color: "#F59E0B", border: "1px solid #F59E0B66" }}>{past ? "已結束" : "即將到來"}</span>
              </div>
            );
          })}
        </section>
      </div>

      {p && <div style={{ marginTop: 16 }}><AttendanceRateCard playerId={p.id} title="我的出席率" /></div>}

      {p && !v.archived && <EditMine p={p} key={p.id + (p.submittedAt ?? "")} />}
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
      {/* v2.11：Sofascore／FotMob 球員頁的頁首：不包卡片，背號方塊＋名字＋一行資料、數據列、位置小球場、雷達圖 */}
      <header aria-label="我的球員卡" className="profile">
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span className="shirt num" aria-label={`背號 ${p.jersey_number || "沒有"}`}>{p.jersey_number || "—"}</span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.2 }}>{p.name}</h1>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>
                {[v.data.team.name, v.isCoach ? "球隊管理員" : "球員", p.nickname && `暱稱 ${p.nickname}`].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          {p.scores && best && (
            <dl className="statrow">
              <div><dt>平均能力</dt><dd><Rate v={p.avg} /></dd></div>
              <div><dt>隊內排名</dt><dd className="num">{rank(p.avg, avgs)}<span className="faint" style={{ fontSize: 14 }}> / {v.rated.length}</span></dd></div>
              <div><dt>推薦位置</dt><dd className="num">{p.rec[0]}</dd></div>
              <div><dt>最強能力</dt><dd>{best.label}</dd></div>
            </dl>
          )}
          <div style={{ maxWidth: 300, marginTop: 16 }}><PositionMap good={p.good_positions} bad={p.bad_positions} /></div>
        </div>
        {p.scores ? (
          <figure style={{ margin: 0, flex: "1 1 300px", minWidth: 0, maxWidth: 420 }}>
            <Radar abilities={ABILITIES} label={`${p.name} 的 21 項能力，和全隊平均比較`} series={[
              { values: ABILITIES.map((a) => v.teamScores[a.key] ?? 0), color: "#8A97AD", dashed: true, width: 0.7, name: "全隊平均" },
              { values: ABILITIES.map((a) => p.scores![a.key] ?? 0), color: "#60A5FA", fill: "rgba(59,130,246,.25)", width: 1, name: p.name },
            ]} />
            <figcaption className="faint" style={{ fontSize: 13, textAlign: "center" }}>藍色是你，灰色虛線是全隊平均；點能力名稱看分數</figcaption>
          </figure>
        ) : (
          <div style={{ flex: "0 1 260px" }}>
            <p className="muted" style={{ margin: "0 0 8px" }}>填完能力表，這裡會出現你的能力雷達圖。</p>
            <Link className="btn btn-main" href={`/t/${teamId}/form`}>填能力表（約 3 分鐘）</Link>
          </div>
        )}
      </header>
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
  // 跟「已儲存的內容」比；儲存後 v.reload() 讓 p 更新，就不算改過
  const dirty = JSON.stringify([nick, msg, pos, weak]) !== JSON.stringify([p.nickname, p.message, toChoice(p.good_positions, p.bad_positions), p.weak_side]);
  const guard = useLeaveGuard(dirty);

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
      {guard}
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
