"use client";
// 首頁：沒登入 → 簡介和「開始使用」；登入後自動帶到球隊（0 隊 → 加入，1 隊 → 那一隊，好幾隊 → 選球隊）。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import { configured } from "@/lib/supabase";
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
          <Logo />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Football Analysis Potato</span>
        </div>
        <Link className="btn btn-line" href="/login">登入</Link>
      </header>

      {deleted && <p className="status ok" role="status">你的帳號和資料已經刪除。謝謝你用過 Football Analysis Potato。</p>}
      <section style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "24px 40px", paddingTop: 16 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <h1 style={{ margin: "0 0 16px", fontSize: "clamp(34px, 6vw, 46px)", lineHeight: 1.25 }}>你的球隊，<br />一個地方全看得到</h1>
          <p className="muted" style={{ margin: "0 0 24px", maxWidth: "26em", fontSize: 18 }}>
            球員能力、陣容、比賽和裁判任務都在這裡。跟著右邊三步，一分鐘就能加入。
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
          <TacticsBoard />
        </figure>
      </section>

      <section aria-labelledby="peek-h" style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid #22304A" }}>
        <h2 id="peek-h" className="accent" style={{ margin: "0 0 16px", fontSize: 22 }}>加入後你會看到</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <div className="panel" style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true" focusable="false">
                <path d="M42 6 L76 30 L64 74 L20 74 L8 30 Z" fill="none" stroke="#2E3D5C" strokeWidth="1.5" />
                <path d="M42 18 L66 34 L56 64 L26 60 L20 34 Z" fill="rgba(17,165,149,.25)" stroke="#11A595" strokeWidth="2" filter="url(#chalk)" />
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
              <g fill="#2DD4BF" filter="url(#chalk)">
                <circle cx="22" cy="42" r="5" /><circle cx="60" cy="18" r="5" /><circle cx="60" cy="42" r="5" /><circle cx="60" cy="66" r="5" />
                <circle cx="110" cy="28" r="5" /><circle cx="110" cy="56" r="5" /><circle cx="160" cy="42" r="5" />
              </g>
              <path d="M118 56 C 140 60, 150 50, 160 46" fill="none" stroke="#F5A524" strokeWidth="2" strokeLinecap="round" filter="url(#chalk)" />
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

function TacticsBoard() {
  return (
    <svg viewBox="0 0 560 360" role="img" aria-label="戰術板，用粉筆畫出加入的三個步驟：1 拿到 Team ID，2 登入，3 加入球隊" style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="4" y="4" width="552" height="352" rx="16" fill="#101A2C" />
      <g fill="none" stroke="#E9EDF3" strokeWidth="2" strokeLinecap="round" opacity="0.55" filter="url(#chalk)">
        <path d="M28 28 L532 27 L533 332 L27 333 Z" /><path d="M280 27 L281 333" /><circle cx="280" cy="180" r="48" />
        <path d="M532 100 L452 101 L453 260 L533 259" /><path d="M532 140 L496 141 L496 220 L533 219" /><path d="M28 100 L108 101 L107 260 L27 259" />
      </g>
      <g stroke="#E9EDF3" strokeWidth="3" strokeLinecap="round" opacity="0.5" filter="url(#chalk)">
        <path d="M380 64 l14 14 M394 64 l-14 14" /><path d="M410 250 l14 14 M424 250 l-14 14" /><path d="M330 150 l14 14 M344 150 l-14 14" />
      </g>
      <path className="chalk-draw" d="M96 268 C 150 250, 170 200, 210 176 S 300 120, 340 112 S 430 150, 488 182" fill="none" stroke="#F5A524" strokeWidth="3" strokeLinecap="round" filter="url(#chalk)" />
      <path className="chalk-late" style={{ animationDelay: "2.2s" }} d="M474 172 L490 183 L475 194" fill="none" stroke="#F5A524" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter="url(#chalk)" />
      <g fill="#0B1220" stroke="#2DD4BF" strokeWidth="3" filter="url(#chalk)">
        <circle cx="96" cy="268" r="16" /><circle cx="250" cy="156" r="16" /><circle cx="488" cy="182" r="16" className="chalk-late" style={{ animationDelay: "2.2s" }} />
      </g>
      <g fontWeight="700" fontSize="19" fill="#2DD4BF" textAnchor="middle">
        <text x="96" y="275">1</text><text x="250" y="163">2</text><text x="488" y="189" className="chalk-late" style={{ animationDelay: "2.2s" }}>3</text>
      </g>
      <g fontSize="22" fill="#E9EDF3">
        <text x="122" y="306">拿到 Team ID</text><text x="200" y="118">登入</text>
        <text x="404" y="232" className="chalk-late" style={{ animationDelay: "2.4s" }} fill="#F5A524">加入球隊</text>
      </g>
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
