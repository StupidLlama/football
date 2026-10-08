"use client";
// 隊伍聊天室（v2.6 F6）：置頂區、貼文列表、展開回覆、底部輸入框。
// 即時更新：Supabase Realtime 訂閱 + 每 30 秒輪詢備援（Realtime 斷線時補漏）。
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getLineups, getMessages, markChatRead, subscribeMessages, type LineupRow, type Message } from "@/lib/api";
import { splitPinned, threadsOf } from "@/lib/chat";
import { useTeamView } from "@/lib/team";
import { ChatComposer } from "@/components/chat-composer";
import { ChatMessage } from "@/components/chat-message";
import { ErrorBox, Loading, useNow } from "@/components/ui";

export default function ChatPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const v = useTeamView();
  const now = useNow(30_000);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState("");
  const [lineups, setLineups] = useState<LineupRow[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try { setMessages(await getMessages(teamId)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!v.isCoach) return;
    getLineups(teamId).then((rows) => setLineups(rows.filter((r) => r.kind === "official"))).catch(() => {});
  }, [teamId, v.isCoach]);

  // Realtime 訂閱這一隊的訊息；斷線保險：每 30 秒也重抓一次
  useEffect(() => {
    const unsub = subscribeMessages(teamId, load);
    const t = setInterval(load, 30_000);
    return () => { unsub(); clearInterval(t); };
  }, [teamId, load]);

  // 有新訊息就標記已讀（更新側邊欄未讀紅點、首頁待辦）
  const markedUntil = useRef("");
  useEffect(() => {
    if (!messages || !messages.length) return;
    const latest = messages[messages.length - 1].created_at;
    if (latest === markedUntil.current) return;
    markedUntil.current = latest;
    markChatRead(teamId).then(() => v.reload()).catch(() => {});
  }, [messages, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (error) return <ErrorBox text={error} onRetry={load} />;
  if (messages === null) return <Loading />;

  const { pinned, others } = splitPinned(threadsOf(messages));
  const myId = v.me.user_id;

  return (
    <section className="stack fade-up" style={{ gap: 16 }}>
      <h1 className="hide-sm" style={{ margin: 0, fontSize: 30 }}>聊天室</h1>

      <ChatComposer teamId={teamId} isCoach={v.isCoach} lineups={lineups} onPosted={load} />

      {pinned.length > 0 && (
        <div className="stack" style={{ gap: 12 }}>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>置頂（{pinned.length}）</p>
          {pinned.map((t) => (
            <ChatMessage key={t.post.id} thread={t} teamId={teamId} myUserId={myId} isCoach={v.isCoach}
              nameOf={v.nameOf} lineups={lineups} now={now} onChanged={load}
              open={open.has(t.post.id)} onToggleOpen={() => toggle(t.post.id)}
              reply={<ChatComposer teamId={teamId} isCoach={v.isCoach} lineups={[]} parentId={t.post.id} onPosted={load} />} />
          ))}
        </div>
      )}

      {pinned.length === 0 && others.length === 0 && (
        <p className="faint">還沒有人發言，第一句話留給你。</p>
      )}

      <div className="stack" style={{ gap: 12 }}>
        {others.map((t) => (
          <ChatMessage key={t.post.id} thread={t} teamId={teamId} myUserId={myId} isCoach={v.isCoach}
            nameOf={v.nameOf} lineups={lineups} now={now} onChanged={load}
            open={open.has(t.post.id)} onToggleOpen={() => toggle(t.post.id)}
            reply={<ChatComposer teamId={teamId} isCoach={v.isCoach} lineups={[]} parentId={t.post.id} onPosted={load} />} />
        ))}
      </div>
    </section>
  );
}
