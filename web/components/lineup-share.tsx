"use client";
// 組隊：分享連結（編輯頁的設定面板）和分享頁本體（/l/[token]，不用登入）。
import { useEffect, useState, type ReactNode } from "react";
import { getSharedLineup, setLineupShare, type LineupRow, type SharedLineup } from "@/lib/api";
import { findFormation, formationsOf, type Formation } from "@/lib/lineup";
import { kickoffLabel } from "@/lib/matches";
import { LINEUP_RULES } from "@/lib/config";
import { message } from "@/lib/status";
import { downloadPitchPng, Pitch, pitchSvgMarkup, type SlotLabel } from "@/components/lineup-pitch";
import { ErrorBox, Loading, Logo, useToast } from "@/components/ui";

function shareUrl(token: string): string {
  if (typeof window === "undefined") return `/l/${token}`;
  return `${window.location.origin}/l/${token}`;
}

/** 編輯頁的「分享」面板：開關、顯示名字、複製連結、重新產生、下載圖片。 */
export function LineupShare({ row, labels, formation, onClose, onChanged }: {
  row: LineupRow; labels: Record<string, SlotLabel | null>; formation: Formation; onClose: () => void; onChanged: () => void;
}) {
  const say = useToast();
  const [token, setToken] = useState<string | null>(row.share_token);
  const [showNames, setShowNames] = useState(row.share_names);
  const [busy, setBusy] = useState(false);

  const act = async (shared: boolean, names = showNames, renew = false) => {
    setBusy(true);
    try {
      const r = await setLineupShare(row.id, shared, names, renew);
      if (r.status === "ok") {
        setToken(r.token ?? null);
        if (shared) setShowNames(names);
        onChanged();
      } else {
        say(message(r));
      }
    } catch (e) {
      say(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!token) return;
    try { await navigator.clipboard.writeText(shareUrl(token)); say("已複製連結"); }
    catch { say("複製失敗，請手動選取連結"); }
  };

  const download = () => downloadPitchPng(pitchSvgMarkup(formation, labels, row.name || formation.name), `${row.name || "陣容"}.png`);

  return (
    <div className="panel pad stack" style={{ gap: 12 }} role="dialog" aria-label="分享陣容">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <p style={{ margin: 0, fontWeight: 700 }}>分享陣容</p>
        <button type="button" className="btn-text" onClick={onClose}>關閉</button>
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        拿到連結的人都能看，不用登入；只會看到背號和位置，不會看到能力分數，也看不到是誰排的。
      </p>
      <div className="row" style={{ borderTop: 0, paddingTop: 0 }}>
        <button type="button" role="switch" className="switch" aria-checked={!!token} aria-busy={busy} disabled={busy}
          aria-label="開啟分享連結" onClick={() => act(!token)} />
        <span>{token ? "分享連結已開啟" : "分享連結已關閉"}</span>
      </div>
      {token && (
        <>
          <div className="row" style={{ borderTop: 0, paddingTop: 0 }}>
            <button type="button" role="switch" className="switch" aria-checked={showNames} aria-busy={busy} disabled={busy}
              aria-label="分享頁和圖片顯示名字" onClick={() => act(true, !showNames)} />
            <span>顯示名字（沒開只顯示背號）</span>
          </div>
          <div className="field" style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
            <span className="num" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", fontSize: 14 }}>{shareUrl(token)}</span>
            <button type="button" className="btn btn-line btn-sm" onClick={copy}>複製</button>
          </div>
          <div className="chips">
            <button type="button" className="btn btn-line btn-sm" disabled={busy} onClick={() => act(true, showNames, true)}>
              重新產生連結（舊連結會失效）
            </button>
            <button type="button" className="btn btn-line btn-sm" onClick={() => act(false)} disabled={busy}>關閉分享</button>
          </div>
        </>
      )}
      <button type="button" className="btn btn-main btn-wide" onClick={download}>下載陣容圖片（PNG）</button>
    </div>
  );
}

/** /l/[token]：分享頁本體，給沒登入的人看。 */
export function SharedLineupView({ token }: { token: string }) {
  const [data, setData] = useState<SharedLineup | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    getSharedLineup(token).then((r) => { if (alive) setData(r); }).catch(() => { if (alive) setErr("連不到伺服器，請稍後再試"); });
    return () => { alive = false; };
  }, [token]);

  if (err) return <Centered><ErrorBox text={err} /></Centered>;
  if (!data) return <Centered><Loading /></Centered>;
  if (data.status !== "ok" || !data.size || !data.formation) {
    return <Centered><p className="status warn">這個連結找不到，可能已經被關閉或重新產生過了。</p></Centered>;
  }

  const formation = findFormation(LINEUP_RULES.formations, data.size, data.formation) ?? formationsOf(LINEUP_RULES.formations, data.size)[0];
  const labels: Record<string, SlotLabel | null> = {};
  for (const [code, slot] of Object.entries(data.slots ?? {})) {
    labels[code] = slot ? { number: slot.number, text: slot.name ?? "", tag: "none", rated: false } : null;
  }
  const title = data.name || formation.name;

  return (
    <Centered>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Logo /><span style={{ fontWeight: 700 }}>Football Analysis Potato</span></div>
      <h1 style={{ fontSize: 26, margin: "0 0 4px" }}>{title}</h1>
      <p className="faint" style={{ margin: "0 0 16px" }}>
        {data.team_name}{data.season ? `（${data.season}）` : ""} · {formation.name}
        {data.match && <> · vs {data.match.opponent} · {kickoffLabel(data.match.kickoff)}</>}
      </p>
      <Pitch formation={formation} labels={labels} lockedSlots={new Set()} selectedSlot={null} onSlotClick={() => {}} />
      <button type="button" className="btn btn-main btn-wide" style={{ marginTop: 16 }}
        onClick={() => downloadPitchPng(pitchSvgMarkup(formation, labels, title), `${title}.png`)}>
        下載陣容圖片（PNG）
      </button>
      <p className="faint" style={{ marginTop: 16, fontSize: 13 }}>這個連結只能看，不能編輯。</p>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px" }}>{children}</div>;
}
