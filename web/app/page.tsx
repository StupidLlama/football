"use client";
// 首頁：沒登入 → 簡介和「開始使用」；登入後自動帶到球隊（0 隊 → 加入，1 隊 → 那一隊，好幾隊 → 選球隊）。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import { configured } from "@/lib/supabase";
import { motion } from "motion/react";
import { Footer, Loading, Logo } from "@/components/ui";

export default function Home() {
  const { ready, session, teams } = useAuth();
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const [deleted, setDeleted] = useState(false);
  useEffect(() => { setDeleted(new URLSearchParams(window.location.search).get("deleted") === "1"); }, []);

  useEffect(() => {
    if (session && teams) router.replace(homeFor(teams));
  }, [session, teams, router]);

  if (!configured) return <SetupMissing />;
  if (!ready || session) return <div className="narrow"><Loading /></div>;

  return (
    <div className="page">
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Logo size={36} text />
        </div>
        <Link className="btn btn-line" href="/login" style={{ flex: "none" }}>登入</Link>
      </header>

      {deleted && <p className="status ok" role="status">你的帳號和資料已經刪除。謝謝你用過 Football Analysis Potato。</p>}
      <section style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "24px 40px", paddingTop: 16 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <h1 style={{ margin: "0 0 16px", fontSize: "clamp(34px, 6vw, 46px)", lineHeight: 1.25 }}>你的球隊，<br />一個地方全看得到</h1>
          <p className="muted" style={{ margin: "0 0 24px", maxWidth: "26em", fontSize: 18 }}>
            球員能力、陣容、比賽和裁判任務都在這裡。拿到 Team ID、登入、加入球隊，一分鐘就好。
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
            <Link className="btn btn-main btn-lg" href="/login">開始使用</Link>
            <button type="button" className="btn btn-text" onClick={() => setHelp(!help)} aria-expanded={help}>Team ID 去哪裡拿？</button>
          </div>
          {help && (
            <p style={{ margin: "16px 0 0", maxWidth: "26em", padding: "12px 16px", border: "1px dashed #4A5A7A", borderRadius: 10, color: "#C9D3E3" }}>
              問你的隊長或球隊管理員。Team ID 是 8 個英文和數字，長得像{" "}
              <b className="accent" style={{ fontSize: 19, letterSpacing: "0.06em" }}>K7Q4-MZP9</b>，大小寫都可以。
            </p>
          )}
        </div>
        <figure style={{ flex: "1.5 1 440px", minWidth: 0, margin: 0 }}>
          <PassingLoop />
        </figure>
      </section>

      <section aria-labelledby="peek-h" style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid #22304A" }}>
        <h2 id="peek-h" className="accent" style={{ margin: "0 0 16px", fontSize: 22 }}>加入後你會看到</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <div className="panel" style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true" focusable="false">
                <path d="M42 6 L76 30 L64 74 L20 74 L8 30 Z" fill="none" stroke="#2E3D5C" strokeWidth="1.5" />
                <path d="M42 18 L66 34 L56 64 L26 60 L20 34 Z" fill="rgba(96,165,250,.2)" stroke="#60A5FA" strokeWidth="2" />
              </svg>
              <div><div className="num faint" style={{ fontSize: 18 }}>#10</div><div style={{ fontWeight: 700, fontSize: 18 }}>你的名字</div><div className="faint" style={{ fontSize: 13 }}>CM、ST</div></div>
            </div>
            <h3 style={{ margin: "12px 0 2px", fontSize: 18 }}>球員卡</h3>
            <p className="muted" style={{ margin: 0 }}>能力雷達圖和擅長位置，可以跟隊友比較。</p>
          </div>
          <div className="panel" style={{ padding: 16 }}>
            <svg width="100%" height="84" viewBox="0 0 220 84" aria-hidden="true" focusable="false">
              <rect x="4" y="4" width="212" height="76" rx="6" fill="none" stroke="#2E3D5C" strokeWidth="1.5" />
              <path d="M110 4 V80" stroke="#2E3D5C" strokeWidth="1.5" />
              <g fill="#60A5FA">
                <circle cx="22" cy="42" r="5" /><circle cx="60" cy="18" r="5" /><circle cx="60" cy="42" r="5" /><circle cx="60" cy="66" r="5" />
                <circle cx="110" cy="28" r="5" /><circle cx="110" cy="56" r="5" /><circle cx="160" cy="42" r="5" />
              </g>
              <path d="M118 56 C 140 60, 150 50, 160 46" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <h3 style={{ margin: "12px 0 2px", fontSize: 18 }}>組隊</h3>
            <p className="muted" style={{ margin: 0 }}>依能力和擅長位置排出先發和替補。</p>
          </div>
          <div className="panel" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", minHeight: 84 }}>
              <div><div className="accent" style={{ fontSize: 17 }}>下一場</div><div style={{ fontWeight: 700, fontSize: 20 }}>vs 對手</div></div>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                <span className="num" style={{ fontSize: 40, lineHeight: 1 }}>3</span><span className="faint" style={{ fontSize: 13 }}>天</span>
                <span className="num" style={{ fontSize: 40, lineHeight: 1 }}>05</span><span className="faint" style={{ fontSize: 13 }}>小時</span>
              </div>
            </div>
            <h3 style={{ margin: "12px 0 2px", fontSize: 18 }}>比賽和裁判任務</h3>
            <p className="muted" style={{ margin: 0 }}>下一場倒數、近期戰績，輪到你吹哨也看得到。</p>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}

// v2.11：三個人傳球，最後一腳射中橫桿彈回第一個人，一直循環。
// 用 Motion 動 transform（x、y）：系統開了「減少動態效果」時 MotionConfig 會關掉，球停在第一個人腳下。
const FEET = [[90, 296], [230, 296], [370, 296]] as const;
const BAR: [number, number] = [520, 150];
const BALL = {
  x: [0, 70, 140, 210, 280, 355, BAR[0] - FEET[0][0], 230, 0],
  y: [0, -70, 0, -60, 0, -90, BAR[1] - FEET[0][1], -70, 0],
};

function PassingLoop() {
  return (
    <svg viewBox="0 0 600 360" role="img" aria-label="動畫：三個球員互相傳球，最後一腳射中橫桿，球彈回第一個人" style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="4" y="4" width="592" height="352" rx="16" fill="#111A2B" />
      <path d="M24 306 H576" stroke="#1F2B42" strokeWidth="2" />
      <path d={`M${BAR[0] - 20} 306 V${BAR[1]} H${BAR[0] + 60} V306`} fill="none" stroke="#E9EDF3" strokeWidth="5" strokeLinejoin="round" />
      <path d={`M${BAR[0] - 20} ${BAR[1]} L${BAR[0] + 10} 190 M${BAR[0] + 60} ${BAR[1]} L${BAR[0] + 30} 190 M${BAR[0] + 10} 190 H${BAR[0] + 30} V306 M${BAR[0] + 10} 190 V306`} fill="none" stroke="#2E3D5C" strokeWidth="2" />
      {FEET.map(([x], i) => (
        <g key={i} fill="#60A5FA">
          <circle cx={x - 6} cy={232} r={11} />
          <rect x={x - 17} y={248} width={22} height={34} rx={8} />
          <rect x={x - 14} y={280} width={7} height={24} rx={3} /><rect x={x - 3} y={280} width={7} height={24} rx={3} />
          <text x={x - 6} y={270} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0B1220">{[7, 8, 10][i]}</text>
        </g>
      ))}
      <motion.circle cx={FEET[0][0] + 14} cy={FEET[0][1]} r={9} fill="#F59E0B" stroke="#0B1220" strokeWidth="2"
        animate={BALL} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", times: [0, .1, .2, .3, .4, .5, .62, .8, 1] }} />
    </svg>
  );
}

function SetupMissing() {
  return (
    <div className="narrow">
      <h1 style={{ fontSize: 28 }}>還沒設定 Supabase</h1>
      <p className="muted">在 <code>web</code> 資料夾建立 <code>.env.local</code>，填入 Supabase 的網址和 publishable key，再重新執行 <code>npm run dev</code>。步驟在 <code>docs/V2_2_SETUP.md</code>。</p>
    </div>
  );
}
