"use client";
// v3.0 比賽頁的「影片分析」：狀態和進度（自動更新）、結果和白話原因；球隊管理員建立／取消分析。
// 影片本身不經過網站：管理員在 Colab 筆記本貼上這裡給的分析權杖，筆記本從自己的 Google Drive 讀影片。
import Link from "next/link";
import { useEffect, useState } from "react";
import { cancelVideoJob, createVideoJob, subscribeVideos } from "@/lib/api";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";
import { useTeamView } from "@/lib/team";
import { NOTEBOOK_URL, isActive, latestVideo, reasonText, videoInfo, videoLabel } from "@/lib/video";
import { ConfirmButton } from "./confirm-button";
import { useToast } from "./ui";

export function MatchVideo({ matchId, ended }: { matchId: string; ended: boolean }) {
  const v = useTeamView();
  const say = useToast();
  const video = latestVideo(v.data.videos, matchId);
  const active = isActive(video);
  const [fileName, setFileName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { reload } = v;
  const teamId = v.data.team.id;

  // 有分析在跑才訂閱；Realtime 斷線時每 20 秒再讀一次當備援
  useEffect(() => {
    if (!active) return;
    const off = subscribeVideos(teamId, () => { void reload(); });
    const timer = setInterval(() => { void reload(); }, 20000);
    return () => { off(); clearInterval(timer); };
  }, [active, teamId, reload]);

  const manage = v.isCoach && !v.archived;
  if (!ended || (!video && !manage)) return null;

  const create = async () => {
    setBusy(true);
    try {
      const r = await createVideoJob(matchId, fileName);
      if (r.status === "ok" && r.token) { setToken(r.token); setFileName(""); await reload(); }
      else say(r.detail ?? "建立失敗");
    } finally { setBusy(false); }
  };
  const copy = async () => {
    if (!token) return;
    // 連線碼 = 網址＋publishable key（公開的）＋權杖，筆記本一次貼上就好
    const text = JSON.stringify({ url: SUPABASE_URL, key: SUPABASE_KEY, token });
    try { await navigator.clipboard.writeText(text); say("已複製連線碼"); }
    catch { say("複製失敗，請手動選取"); }
  };
  const cancel = async () => {
    if (!video) return;
    const r = await cancelVideoJob(video.id);
    if (r.status === "ok") { setToken(null); say("已取消"); await reload(); } else say(r.detail ?? "取消失敗");
  };

  return (
    <div className="panel pad stack" style={{ gap: 10 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>影片分析</p>

      {video && (
        <div className="stack" style={{ gap: 6 }}>
          <p style={{ margin: 0 }}>
            <span style={{ fontWeight: 600 }}>{videoLabel(video)}</span>
            <span className="faint" style={{ marginLeft: 8, fontSize: 13 }}>{video.file_name}</span>
          </p>
          {video.status === "processing" && (
            <div className="progress" role="progressbar" aria-valuenow={video.progress} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${video.progress}%` }} />
            </div>
          )}
          {video.status === "queued" && <p className="faint" style={{ margin: 0, fontSize: 13 }}>等球隊管理員在 Colab 開始跑。</p>}
          {videoInfo(video) && <p className="muted num" style={{ margin: 0, fontSize: 14 }}>{videoInfo(video)}</p>}
          {video.status === "done" && video.reasons.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {video.reasons.map((r) => <li key={r}>{reasonText(r)}</li>)}
            </ul>
          )}
          {video.status === "failed" && <p className="muted" style={{ margin: 0 }}>{video.error || "Colab 那邊出錯了，可以重新建立一次。"}</p>}
          {(video.grade === "low" || video.grade === "reject") && (
            <Link href="/video-guide" style={{ fontSize: 14 }}>怎麼拍才拍得好？</Link>
          )}
        </div>
      )}

      {manage && token && active && (
        <div className="stack" style={{ gap: 6 }}>
          <p style={{ margin: 0 }}>分析權杖（<b>只顯示這一次</b>，7 天內有效）：</p>
          <code style={{ wordBreak: "break-all", fontSize: 13 }}>{token}</code>
          <div className="chips">
            <button type="button" className="btn btn-sm" onClick={copy}>複製連線碼</button>
            <a className="btn btn-line btn-sm" href={NOTEBOOK_URL} target="_blank" rel="noopener noreferrer">打開 Colab 筆記本</a>
          </div>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>在筆記本按「全部執行」，照提示填影片路徑、貼上連線碼。不要把連線碼貼到聊天室。</p>
        </div>
      )}

      {manage && active && (
        <div className="chips">
          <ConfirmButton label="取消分析" confirm="確定取消？" onConfirm={cancel} className="btn btn-line btn-sm" />
        </div>
      )}

      {manage && !active && (
        <div className="stack" style={{ gap: 6 }}>
          <label className="label">影片檔名（例如 2026-11-01_vs對手.mp4）
            <input className="field" value={fileName} maxLength={200} onChange={(e) => setFileName(e.target.value)} />
          </label>
          <div className="chips">
            <button type="button" className="btn btn-sm" disabled={busy || !fileName.trim()} onClick={create}>
              {video ? "重新分析" : "建立影片分析"}
            </button>
            <Link className="btn btn-line btn-sm" href="/video-guide">怎麼拍比賽影片</Link>
          </div>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>影片不用上傳到網站，放在你自己的 Google Drive 就好。</p>
        </div>
      )}
    </div>
  );
}
