"use client";
// 出席率卡片（v2.8）：比賽和練習分開算。自己看得到自己的；球隊管理員看得到全隊（見 coach 的「賽季」分頁）。
import { matchRate, practiceRate, rateText, type Rate } from "@/lib/attendance-rate";
import { useTeamView } from "@/lib/team";
import { AnimatedNumber } from "@/components/anim";
import { Kpi } from "@/components/ui";

export function rateSub(r: Rate): string {
  if (r.events === 0) return "還沒有已結束的場次";
  const bits = [`出席 ${r.attended} / 算 ${r.counted} 場`];
  if (r.leave) bits.push(`請假 ${r.leave}`);
  if (r.missed) bits.push(`沒回覆 ${r.missed}`);
  return bits.join("，");
}

export function RateKpi({ label, r }: { label: string; r: Rate }) {
  return <Kpi label={label} value={r.pct === null ? "—" : <><AnimatedNumber value={r.pct} digits={0} />%</>} sub={rateSub(r)} />;
}

export function AttendanceRateCard({ playerId, title = "出席率" }: { playerId: string; title?: string }) {
  const v = useTeamView();
  const now = new Date();
  const m = matchRate(playerId, v.data.matches, v.data.attendance, now);
  const p = practiceRate(playerId, v.data.practices, v.data.practiceAttendance, now);
  return (
    <section className="panel" style={{ padding: "12px 16px" }} aria-labelledby={`rate-${playerId}`}>
      <h2 id={`rate-${playerId}`} style={{ margin: "0 0 8px", fontSize: 18 }}>{title}<span className="faint" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>{v.data.team.season ?? "這一季"}</span></h2>
      <div className="kpis">
        <RateKpi label="比賽出席率" r={m} />
        <RateKpi label="練習出席率" r={p} />
      </div>
      <p className="faint" style={{ margin: "8px 0 0", fontSize: 13 }}>
        只算已經結束的場次；請假不算進去；已結束卻沒回覆的算沒到。{rateText(m) === "—" && rateText(p) === "—" ? "目前還沒有可以算的場次。" : ""}
      </p>
    </section>
  );
}
