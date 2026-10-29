"use client";
// v2.11.1 未登入首頁的「轉播」動畫：像看直播，球員是追蹤圓點、戰術箭頭畫在草地上，鏡頭跟著球。
// 每一格的位置都在 lib/broadcast.ts 算；這裡只負責畫。
// 用 requestAnimationFrame 播（Motion 不適合逐格算的透視畫面），所以自己看 useReducedMotionConfig：
// 「減少動態效果」開著就停在進球後那一格；捲出畫面就暫停。
import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotionConfig } from "motion/react";
import {
  ARROWS, GOAL_AT, OURS, STILL_AT, THEM, TOTAL, VIEW, ZOOM,
  arrowAt, arrowFade, ballAt, bannerAt, barShake, cameraTarget, clockAt, kickAt, netShake, playersAt, points, project, segment,
  type Pt,
} from "@/lib/broadcast";

const CHALK = "rgba(241,236,226,.75)";

// 草地和白線不會動，算一次就好
const STRIPES = Array.from({ length: 15 }, (_, i) => 30 + i * 6).map((x) => ({ x, d: points([[x, 0], [x + 6, 0], [x + 6, 68], [x, 68]]) }));
const LINES = [
  [...segment([40, 1], [105, 1]), ...segment([105, 1], [105, 67]), ...segment([105, 67], [40, 67])],
  segment([52.5, 1], [52.5, 67]),
  [[105, 13.8], ...segment([88.5, 13.8], [88.5, 54.2]), [105, 54.2]] as Pt[],
  [[105, 24.8], [99.5, 24.8], [99.5, 43.2], [105, 43.2]] as Pt[],
  Array.from({ length: 13 }, (_, i) => { const a = -0.93 + i * 1.86 / 12; return [94 - 9.15 * Math.cos(a), 34 + 9.15 * Math.sin(a)] as Pt; }).filter((p) => p[0] < 88.5),
  Array.from({ length: 17 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 16; return [52.5 + 9.15 * Math.cos(a), 34 + 9.15 * Math.sin(a)] as Pt; }),
].map(points);
const xy = (p: number[], dx = 0) => `${(p[0] + dx).toFixed(1)},${p[1].toFixed(1)}`;
const FRAME = [project(105, 30.3), project(105, 30.3, 2.44), project(105, 37.7, 2.44), project(105, 37.7)].map((p) => xy(p)).join(" ");
const PLAYERS = [...Object.keys(OURS).map((id) => ({ id, color: "#60A5FA", num: id })), ...Object.keys(THEM).map((id) => ({ id, color: id === "gk" ? "#B9A04A" : "#9B5D66", num: "" }))];

function netLines(shake: number) {
  return Array.from({ length: 7 }, (_, i) => {
    const y = 30.3 + i * 7.4 / 6;
    return [project(105, y, 2.44), project(107.5, y, 1.6), project(107.5, y, 0)].map((p) => xy(p, shake)).join(" ");
  });
}

type View = { t: number; cam: Pt };
const still = (): View => ({ t: STILL_AT, cam: cameraTarget(STILL_AT) });

export function BroadcastHero() {
  const reduce = useReducedMotionConfig();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [view, setView] = useState<View>(still);
  const clock = useRef({ elapsed: 0, cam: null as Pt | null });

  useEffect(() => {
    if (reduce) { setView(still()); return; }
    if (!inView) return;
    let raf = 0, last: number | null = null;
    const loop = (now: number) => {
      const c = clock.current;
      const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000); // 切回分頁時不要一次跳太多
      last = now;
      c.elapsed += dt;
      const t = c.elapsed % TOTAL, target = cameraTarget(t);
      const k = c.cam ? 1 - Math.exp(-dt * 2.2) : 1;
      c.cam = c.cam ? [c.cam[0] + (target[0] - c.cam[0]) * k, c.cam[1] + (target[1] - c.cam[1]) * k] : target;
      setView({ t, cam: c.cam });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduce, inView]);

  const { t, cam } = view;
  const pos = playersAt(t);
  const order = PLAYERS.slice().sort((a, b) => pos[a.id][1] - pos[b.id][1]); // 遠的先畫，近的蓋上去
  const [bx, by, bh] = ballAt(t), [gx, gy, gs] = project(bx, by, 0), [sx, sy] = project(bx, by, bh);
  const fade = arrowFade(t), banner = bannerAt(t);
  const camera = `translate(${VIEW.w / 2} ${VIEW.h / 2}) scale(${ZOOM}) translate(${(-cam[0]).toFixed(2)} ${(-cam[1]).toFixed(2)})`;

  return (
    <div ref={ref} className="tv" role="img" aria-label="直播畫面動畫：A 隊對 B 隊，8 號傳 10 號、7 號前插接直塞射門中橫桿，10 號補射進球，比分變成 1 比 0">
      <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} aria-hidden="true" focusable="false">
        <g transform={camera}>
          <rect width={VIEW.w} height={VIEW.h} fill="#0C2416" />
          {STRIPES.map((s) => <polygon key={s.x} points={s.d} fill={(s.x / 6) % 2 ? "#14422A" : "#103A24"} />)}
          {LINES.map((d, i) => <polyline key={i} points={d} fill="none" stroke={CHALK} strokeWidth={1.6} strokeLinejoin="round" />)}
          {ARROWS.map((a, i) => (
            <polyline key={i} points={arrowAt(a, t)} fill="none" stroke={a.run ? "#60A5FA" : "#F1ECE2"} strokeWidth={2.2} strokeLinecap="round"
              strokeDasharray={a.run ? "2 6" : undefined} opacity={fade * (a.run ? 1 : 0.9)} />
          ))}
          <g>
            {order.map(({ id, color, num }) => {
              const [x, y, s] = project(...pos[id]), kick = kickAt(id, t);
              return (
                <g key={id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(s * 1.25).toFixed(3)})`}>
                  <ellipse rx={7.5} ry={2.6} cy={1} fill="rgba(0,0,0,.4)" />
                  <circle cy={-7} r={7 + kick * 4} fill="none" stroke="#F1ECE2" strokeWidth={1.5} opacity={kick * 0.9} />
                  <circle cy={-7} r={7} fill={color} stroke="rgba(11,18,32,.6)" strokeWidth={1} />
                  {num && <text y={-4.2} textAnchor="middle" fontSize={8} fontWeight={700} fill="#0B1220" className="num">{num}</text>}
                </g>
              );
            })}
            <ellipse cx={gx} cy={gy} rx={3 * gs * Math.max(0.4, 1 - bh / 6)} ry={1.2} fill="rgba(0,0,0,.45)" />
            <circle cx={sx} cy={sy} r={2.4 + gs * 1.6} fill="#FFFFFF" stroke="#0B1220" strokeWidth={0.8} />
          </g>
          <g transform={`translate(${barShake(t).toFixed(2)} 0)`}>
            {netLines(netShake(t)).map((d, i) => <polyline key={i} points={d} fill="none" stroke="rgba(241,236,226,.35)" strokeWidth={0.8} />)}
            <polyline points={FRAME} fill="none" stroke="#F1ECE2" strokeWidth={3} strokeLinejoin="round" />
          </g>
        </g>
      </svg>
      <div className="tv-bug num" aria-hidden="true">
        <span className="tv-team">A</span><span className="tv-score">{t >= GOAL_AT ? "1 – 0" : "0 – 0"}</span><span className="tv-team">B</span>
        <span className="tv-clock">{clockAt(t)}</span>
      </div>
      <div className="tv-banner" aria-hidden="true">
        <div className="num" style={{ opacity: banner === null ? 0 : 1, transform: `translateY(${banner ?? 70}px)` }}>GOAL · #10</div>
      </div>
    </div>
  );
}
