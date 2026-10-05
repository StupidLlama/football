"use client";
// 找到自己：選名單上的自己，或申請新增名字。教練確認後才會連上。
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { actions } from "@/lib/api";
import { message } from "@/lib/status";
import { useTeamView } from "@/lib/team";
import { JoinSteps } from "@/components/steps";
import { ErrorBox, useToast } from "@/components/ui";

export default function ClaimPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const v = useTeamView();
  const router = useRouter();
  const say = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const me = v.me;
  const free = v.players.filter((p) => !p.accountId);
  const pendingName = me.claim_player_id ? v.players.find((p) => p.id === me.claim_player_id)?.name : me.claim_new_name;

  async function claim(run: () => ReturnType<typeof actions.claimPlayer>) {
    setBusy(true); setError("");
    const r = await run();
    setBusy(false);
    if (r.status === "ok") {
      await v.reload();
      say("已送出，等教練確認");
      router.push(`/t/${teamId}`);
    } else setError(message(r));
  }

  if (me.player_id) {
    return (
      <div style={{ maxWidth: 460 }}>
        <JoinSteps step={3} />
        <h1 style={{ margin: "0 0 4px", fontSize: 28 }}>你已經連到名單了</h1>
        <p className="muted">你在名單上是「{v.myPlayer?.name}」。要改的話請找教練。</p>
        <Link className="btn btn-main" href={`/t/${teamId}`}>回到我的</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <JoinSteps step={2} />
      <h1 style={{ margin: "0 0 4px", fontSize: 28 }}>名單上哪一位是你？</h1>
      <p className="muted" style={{ margin: "0 0 16px" }}>已加入{v.data.team.name}。選你的名字，教練確認後就會連到你的球員卡。</p>
      {pendingName && (
        <p className="status" role="status">你已經申請「{pendingName}」，等教練確認中。想改的話，重新選一個就會取代原本的申請。</p>
      )}
      {error && <ErrorBox text={error} />}
      {free.length === 0 && <p className="faint">名單上的人都已經連到帳號了。</p>}
      <div className="stack" style={{ gap: 8 }}>
        {free.map((p) => (
          <button key={p.id} type="button" className="note" disabled={busy} onClick={() => claim(() => actions.claimPlayer(teamId, p.id))}
            style={{ minHeight: 52, padding: "0 16px", background: "#131C2E", borderColor: me.claim_player_id === p.id ? "#60A5FA" : "#22304A",
              justifyContent: "space-between", fontSize: 18 }}>
            <span>{p.name}{p.jersey_number && <span className="faint num" style={{ fontSize: 14, marginLeft: 8 }}>#{p.jersey_number}</span>}</span>
            <span className="faint" style={{ fontSize: 14 }}>{p.nickname}</span>
          </button>
        ))}
      </div>
      {!showNew ? (
        <button type="button" className="btn btn-text" onClick={() => setShowNew(true)} style={{ marginTop: 12 }}>名單上沒有我，申請新增名字</button>
      ) : (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (newName.trim()) claim(() => actions.claimNewName(teamId, newName.trim())); }}
          className="panel pad" style={{ marginTop: 16 }}>
          <label className="label">你的名字（教練確認後會加到名單上）
            <input className="field" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} required placeholder="本名" />
          </label>
          <button type="submit" className="btn btn-main" disabled={busy} style={{ marginTop: 12 }}>送出申請</button>
        </form>
      )}
      <p style={{ marginTop: 24 }}><Link href={`/t/${teamId}`}>先跳過，之後再說</Link></p>
    </div>
  );
}
