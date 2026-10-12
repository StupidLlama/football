"use client";
// 「同時通知隊友」的勾選框（新增／修改練習、固定練習、AI 匯入共用）：
//   ☐ 同時發到站內聊天室（以「筆記」的形式發）
//   ☐ 同時推到 Discord（這一隊設定過 Webhook 才會出現）
// 兩個各自決定、預設都不勾；勾了才會出現可以修改的通知文字。以後要加 LINE 之類的，在這裡多一個選項就好。
import { useEffect, useState } from "react";
import { getChatDiscord } from "@/lib/api";

export type Notify = { chat: boolean; discord: boolean; text: string };
export const NO_NOTIFY: Notify = { chat: false, discord: false, text: "" };

/** 這一隊有沒有設定 Discord Webhook（只有球隊管理員查得到；查不到就當作沒有）。 */
export function useDiscordConfigured(teamId: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    getChatDiscord(teamId).then((r) => { if (alive) setOn(r.status === "ok" && !!r.configured); }).catch(() => { if (alive) setOn(false); });
    return () => { alive = false; };
  }, [teamId]);
  return on;
}

export function NotifyBoxes({ teamId, value, defaultText, onChange }: {
  teamId: string; value: Notify; defaultText: string; onChange: (next: Notify) => void;
}) {
  const discordOn = useDiscordConfigured(teamId);
  const any = value.chat || value.discord;

  const toggle = (key: "chat" | "discord", on: boolean) => {
    const next = { ...value, [key]: on };
    // 第一次勾的時候帶入預設文字；之後管理員改過的不覆蓋
    if ((next.chat || next.discord) && !next.text.trim()) next.text = defaultText;
    onChange(next);
  };

  return (
    <fieldset className="stack" style={{ gap: 6, border: "1px dashed var(--line-2)", borderRadius: 10, padding: "10px 12px", margin: 0 }}>
      <legend className="faint" style={{ fontSize: 13, padding: "0 6px" }}>通知隊友（選填）</legend>
      <label className="check">
        <input type="checkbox" checked={value.chat} onChange={(e) => toggle("chat", e.target.checked)} />
        <span>同時發到站內聊天室<span className="faint" style={{ fontSize: 13 }}>（以筆記形式）</span></span>
      </label>
      {discordOn && (
        <label className="check">
          <input type="checkbox" checked={value.discord} onChange={(e) => toggle("discord", e.target.checked)} />
          <span>同時推到 Discord</span>
        </label>
      )}
      {any && (
        <label className="label">通知內容（可以修改）
          <textarea className="field" rows={4} maxLength={2000} value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })} />
        </label>
      )}
    </fieldset>
  );
}

/** 送出時用：沒勾就不帶文字。 */
export function notifyArgs(n: Notify): { announce: string; toChat: boolean; toDiscord: boolean } {
  const on = n.chat || n.discord;
  return { announce: on ? n.text.trim() : "", toChat: n.chat, toDiscord: n.discord };
}

/** 通知結果的一句話，接在「已儲存」後面。 */
export function notifyDone(r: { chat?: boolean; discord?: boolean }, asked: Notify): string {
  const parts: string[] = [];
  if (asked.chat && r.chat) parts.push("聊天室");
  if (asked.discord && r.discord) parts.push("Discord");
  return parts.length ? `，已通知${parts.join("、")}` : "";
}
