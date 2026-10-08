"use client";
// 組隊（F3）：選賽制和陣型、自動排、拖曳／點選換人、鎖定重排、替補、「為什麼是他」、存檔。
// 分享連結和陣容圖片在 LineupShare（v2.4 D）。
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LINEUP_RULES } from "@/lib/config";
import {
  assign, autoLineup, candidates, carryOver, cleanLocked, findFormation, formationsOf, LineupError, manualLineup,
  picksOf, reason, shortageText, swapSlots, type Lineup, type LineupPlayer, type Picks,
} from "@/lib/lineup";
import { deleteLineup, getLineups, saveLineup, type LineupKind, type LineupRow } from "@/lib/api";
import { answerOf, kickoffLabel } from "@/lib/matches";
import { message } from "@/lib/status";
import { useTeamView } from "@/lib/team";
import type { PlayerView } from "@/lib/teamview";
import { ErrorBox, Loading, useToast } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { dragStart, Pitch, type DragToken, type SlotLabel } from "@/components/lineup-pitch";
import { LineupShare } from "@/components/lineup-share";

const SIZES = [11, 8] as const;

function toLineupPlayer(p: PlayerView): LineupPlayer {
  return { id: p.id, name: p.name, scores: p.scores, good_positions: p.good_positions, bad_positions: p.bad_positions };
}

export default function LineupPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const v = useTeamView();
  const say = useToast();
  const isCoach = v.isCoach;
  const myId = v.me.user_id;

  const [rows, setRows] = useState<LineupRow[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [kind, setKind] = useState<LineupKind>(isCoach ? "official" : "draft");
  const [name, setName] = useState("");
  const [size, setSize] = useState<11 | 8>(11);
  const [formationName, setFormationName] = useState(formationsOf(LINEUP_RULES.formations, 11)[0].name);
  const [attending, setAttending] = useState<Set<string>>(() => new Set(v.players.map((p) => p.id)));
  const [picks, setPicks] = useState<Picks>({});
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);

  const formation = findFormation(LINEUP_RULES.formations, size, formationName) ?? formationsOf(LINEUP_RULES.formations, size)[0];
  const byId = useMemo(() => new Map(v.players.map((p) => [p.id, p])), [v.players]);
  const attendingPlayers = useMemo(
    () => v.players.filter((p) => attending.has(p.id)).map(toLineupPlayer),
    [v.players, attending]);

  const sortedMatches = useMemo(
    () => v.data.matches.slice().sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()),
    [v.data.matches]);
  const boundMatch = matchId ? v.data.matches.find((m) => m.id === matchId) ?? null : null;
  // 綁定比賽：出席名單跟著比賽的出席登記走（即時）；不綁定：維持手動勾選（attending 這個 state）。
  const attendingIdsFor = (mId: string | null): Set<string> =>
    mId ? new Set(v.players.filter((p) => answerOf(v.data.attendance, mId, p.id) === "in").map((p) => p.id))
        : new Set(v.players.map((p) => p.id));

  const reload = async () => {
    try { setRows(await getLineups(teamId)); setLoadErr(""); }
    catch (e) { setLoadErr(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { reload(); }, [teamId]);

  const applyAuto = (base: Picks = picks) => {
    const lockedPicks = cleanLocked(Object.fromEntries([...locked].map((c) => [c, base[c] ?? null])), attendingPlayers, formation);
    try {
      const lu = autoLineup(attendingPlayers, formation, LINEUP_RULES, lockedPicks);
      setPicks(picksOf(lu));
    } catch (e) {
      say(e instanceof LineupError ? e.message : "自動排人失敗");
    }
  };

  const freshLineup = (mId: string | null = matchId) => {
    const m = mId ? v.data.matches.find((x) => x.id === mId) ?? null : null;
    const size0 = (m?.size as 11 | 8 | undefined) ?? 11;
    const f0 = formationsOf(LINEUP_RULES.formations, size0)[0];
    setCurrentId(null); setName(""); setKind(isCoach ? "official" : "draft");
    setSize(size0); setFormationName(f0.name); setLocked(new Set()); setSelected(null);
    const ids = attendingIdsFor(mId);
    setAttending(ids);
    const players = v.players.filter((p) => ids.has(p.id)).map(toLineupPlayer);
    try { setPicks(picksOf(autoLineup(players, f0, LINEUP_RULES))); } catch { setPicks({}); }
  };
  useEffect(() => {
    if (rows !== null && currentId === null && Object.keys(picks).length === 0) {
      const params = new URLSearchParams(window.location.search);
      // ?open= 一組既有陣容的 id（例如從聊天室的附件連過來）：直接打開那一組
      const openRow = params.get("open") ? rows.find((r) => r.id === params.get("open")) ?? null : null;
      if (openRow) { loadRow(openRow); return; }
      const fromUrl = params.get("match");
      const m = fromUrl && v.data.matches.some((x) => x.id === fromUrl) ? fromUrl : null;
      setMatchId(m);
      freshLineup(m);
    }
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRow = (row: LineupRow) => {
    const f = findFormation(LINEUP_RULES.formations, row.size, row.formation);
    if (!f) { say("這組陣容用的陣型找不到了"); return; }
    setCurrentId(row.id); setName(row.name); setKind(row.kind); setSize(row.size as 11 | 8); setFormationName(row.formation);
    setMatchId(row.match_id);
    setAttending(row.match_id ? attendingIdsFor(row.match_id) : new Set(row.attending));
    setLocked(new Set(row.locked)); setPicks(row.picks); setSelected(null);
  };

  /** 換成綁定（或解除綁定）一場比賽：賽制跟著比賽改、名單換成那場的出席登記，排走的人被踢出去的位置清空。 */
  const bindMatch = (id: string | null) => {
    setMatchId(id);
    const m = id ? v.data.matches.find((x) => x.id === id) ?? null : null;
    if (m && m.size !== size) changeSize(m.size as 11 | 8);
    const ids = attendingIdsFor(id);
    setAttending(ids);
    setPicks((p) => Object.fromEntries(Object.entries(p).map(([c, pid]) => [c, pid && ids.has(pid) ? pid : null])));
  };

  const changeSize = (s: 11 | 8) => {
    const f = formationsOf(LINEUP_RULES.formations, s)[0];
    setSize(s); setFormationName(f.name);
    setPicks((p) => carryOver(p, f));
    setLocked((l) => new Set([...l].filter((c) => f.slots.some((x) => x.code === c))));
    setSelected(null);
  };
  const changeFormation = (fname: string) => {
    const f = findFormation(LINEUP_RULES.formations, size, fname);
    if (!f) return;
    setFormationName(fname);
    setPicks((p) => carryOver(p, f));
    setLocked((l) => new Set([...l].filter((c) => f.slots.some((x) => x.code === c))));
    setSelected(null);
  };

  const toggleAttending = (id: string) => {
    setAttending((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setPicks((p) => Object.fromEntries(Object.entries(p).map(([c, pid]) => [c, pid === id && attending.has(id) ? null : pid])));
  };

  const lineup: Lineup | null = useMemo(() => {
    try { return manualLineup(attendingPlayers, formation, LINEUP_RULES, picks); }
    catch { return null; }
  }, [attendingPlayers, formation, picks]);

  const labels = useMemo(() => {
    const out: Record<string, SlotLabel | null> = {};
    if (!lineup) return out;
    for (const o of lineup.starters) {
      const p = byId.get(o.id);
      out[o.slot] = { number: p?.jersey_number ?? null, text: o.name, tag: o.good ? "good" : o.bad ? "bad" : "none", rated: o.rated };
    }
    return out;
  }, [lineup, byId]);

  const onSlotClick = (code: string) => {
    if (locked.has(code)) { say("先解除鎖定才能換人"); return; }
    if (selected === code) { setSelected(null); return; }
    if (selected && !locked.has(selected)) {
      setPicks((p) => swapSlots(p, selected, code));
      setSelected(null);
      return;
    }
    setSelected(code);
  };

  const onDrop = (slotCode: string, token: DragToken) => {
    if (locked.has(slotCode)) { say("先解除鎖定才能換人"); return; }
    if (token.kind === "slot") {
      if (locked.has(token.id)) return;
      setPicks((p) => swapSlots(p, token.id, slotCode));
    } else {
      setPicks((p) => assign(p, slotCode, token.id).picks);
    }
    setSelected(null);
  };

  const toggleLock = (code: string) => {
    setLocked((prev) => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await saveLineup({
        team: teamId, lineup: currentId, kind, name, size, formation: formationName,
        picks, locked: [...locked], attending: [...attending], match: matchId,
      });
      if (r.status === "ok") {
        say("已存檔");
        if (r.id) setCurrentId(r.id);
        await reload();
      } else {
        say(message(r, "找不到這組陣容"));
      }
    } catch (e) {
      say(e instanceof Error ? e.message : "存檔失敗");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!currentId) return;
    const r = await deleteLineup(currentId);
    if (r.status === "ok") { say("已刪除"); freshLineup(); await reload(); }
    else say(message(r));
  };

  if (loadErr) return <ErrorBox text={loadErr} onRetry={reload} />;
  if (rows === null) return <Loading />;

  const currentRow = rows.find((r) => r.id === currentId) ?? null;
  const canEdit = !currentRow || (currentRow.kind === "official" ? isCoach : currentRow.owner_id === myId);
  const shortage = lineup ? shortageText(lineup) : null;
  const selectedOption = selected ? lineup?.starters.find((o) => o.slot === selected) ?? null : null;
  const selectedSlotObj = selected ? formation.slots.find((s) => s.code === selected) ?? null : null;
  const cands = selectedSlotObj ? candidates(attendingPlayers, selectedSlotObj, LINEUP_RULES) : [];

  return (
    <section className="stack" style={{ gap: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 className="hide-sm" style={{ margin: 0, fontSize: 30 }}>組隊</h1>
        <button type="button" className="btn btn-line btn-sm" onClick={() => freshLineup()}>開新陣容</button>
      </header>

      {rows.length > 0 && (
        <div className="panel pad">
          <p className="faint" style={{ margin: "0 0 8px", fontSize: 13 }}>我的陣容</p>
          <div className="stack" style={{ gap: 4 }}>
            {rows.map((r) => (
              <button key={r.id} type="button" className="row" style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex",
                justifyContent: "space-between", gap: 12, padding: "8px 4px", cursor: "pointer",
                background: r.id === currentId ? "#16305E" : "transparent", borderRadius: 8 }}
                onClick={() => loadRow(r)}>
                <span>{r.name || "（未命名）"} <span className="faint" style={{ fontSize: 13 }}>· {r.size} 人制 {r.formation}{r.kind === "draft" ? " · 草稿" : ""}</span></span>
                {r.share_token && <span className="pill">已分享</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel pad stack" style={{ gap: 12 }}>
        <label className="label">這組陣容要排哪一場
          <select className="field" value={matchId ?? ""} disabled={!canEdit}
            onChange={(e) => bindMatch(e.target.value || null)}>
            <option value="">不綁定（從全隊選）</option>
            {sortedMatches.map((m) => <option key={m.id} value={m.id}>{kickoffLabel(m.kickoff)} vs {m.opponent}</option>)}
          </select>
        </label>
        <div className="chips">
          <div role="radiogroup" aria-label="賽制" className="seg">
            {SIZES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={size === s} onClick={() => changeSize(s)}
                disabled={!canEdit || !!boundMatch} title={boundMatch ? "賽制跟著綁定的比賽，不能單獨改" : undefined}>{s} 人制</button>
            ))}
          </div>
          <select className="field" style={{ minWidth: 140, width: "auto" }} value={formationName} disabled={!canEdit}
            onChange={(e) => changeFormation(e.target.value)} aria-label="陣型">
            {formationsOf(LINEUP_RULES.formations, size).map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
          </select>
          <button type="button" className="btn btn-line btn-sm" onClick={() => applyAuto()} disabled={!canEdit}>自動排</button>
        </div>
        <input className="field" placeholder="陣容名稱（選填）" value={name} maxLength={40}
          onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
        {isCoach && (
          <div role="radiogroup" aria-label="陣容種類" className="seg">
            <button type="button" role="radio" aria-checked={kind === "official"} onClick={() => setKind("official")} disabled={!canEdit}>正式陣容（全隊看得到）</button>
            <button type="button" role="radio" aria-checked={kind === "draft"} onClick={() => setKind("draft")} disabled={!canEdit}>我的草稿</button>
          </div>
        )}
      </div>

      <details className="panel pad" open>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>
          {boundMatch ? `出席名單（${attending.size} / ${v.players.length}）` : `今天誰會來（${attending.size} / ${v.players.length}）`}
        </summary>
        {boundMatch ? (
          <p className="faint" style={{ fontSize: 13, margin: "8px 0" }}>
            跟著 vs {boundMatch.opponent} 的出席登記自動更新；要改名單請去
            <Link href={`/t/${teamId}/matches/${boundMatch.id}`}> 比賽詳情</Link>登記。
          </p>
        ) : (
          <>
            <p className="faint" style={{ fontSize: 13, margin: "8px 0" }}>手動勾選；上面也可以直接選一場比賽，改用那場的出席登記。</p>
            <div className="chips" style={{ marginBottom: 8 }}>
              <button type="button" className="btn btn-line btn-sm" onClick={() => setAttending(new Set(v.players.map((p) => p.id)))} disabled={!canEdit}>全選</button>
              <button type="button" className="btn btn-line btn-sm" onClick={() => setAttending(new Set())} disabled={!canEdit}>全不選</button>
            </div>
            <div className="chips">
              {v.players.map((p) => (
                <button key={p.id} type="button" className="chip" aria-pressed={attending.has(p.id)} onClick={() => toggleAttending(p.id)} disabled={!canEdit}>
                  {p.jersey_number ? `#${p.jersey_number} ` : ""}{p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </details>

      {shortage && <p className="status warn">{shortage}</p>}
      {!canEdit && <p className="status">這是別人的陣容，你只能看。</p>}

      <Pitch formation={formation} labels={labels} lockedSlots={locked} selectedSlot={selected}
        onSlotClick={canEdit ? onSlotClick : () => {}} draggable={canEdit} onDrop={canEdit ? onDrop : undefined} />

      {selectedSlotObj && (
        <div className="panel pad stack" style={{ gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ margin: 0, fontWeight: 700 }}>位置 {selectedSlotObj.code}{selectedOption ? `：${selectedOption.name}` : "（缺人）"}</p>
            <div className="chips">
              <button type="button" className="btn btn-line btn-sm" onClick={() => toggleLock(selectedSlotObj.code)} disabled={!canEdit}>
                {locked.has(selectedSlotObj.code) ? "解除鎖定" : "鎖定"}
              </button>
              {selectedOption && canEdit && (
                <button type="button" className="btn btn-line btn-sm" onClick={() => { setPicks((p) => assign(p, selectedSlotObj.code, null).picks); setSelected(null); }}>清空</button>
              )}
            </div>
          </div>
          {selectedOption && <p className="faint" style={{ margin: 0, fontSize: 13 }}>{reason(selectedOption)}</p>}
          <p className="faint" style={{ margin: "4px 0 0", fontSize: 13 }}>再點一次球場上別的位置可以直接互換；或從下面選人：</p>
          <div className="stack" style={{ gap: 2, maxHeight: 260, overflowY: "auto" }}>
            {cands.map((c) => {
              const isHere = c.id === selectedOption?.id;
              const elsewhereSlot = Object.entries(picks).find(([code, id]) => id === c.id && code !== selectedSlotObj.code)?.[0];
              return (
                <button key={c.id} type="button" className="prow" disabled={!canEdit || isHere}
                  style={{ opacity: isHere ? 0.6 : 1, cursor: isHere ? "default" : "pointer", gridTemplateColumns: "1fr auto" }}
                  onClick={() => { setPicks((p) => assign(p, selectedSlotObj.code, c.id).picks); setSelected(null); }}>
                  <span>{byId.get(c.id)?.jersey_number ? `#${byId.get(c.id)?.jersey_number} ` : ""}{c.name}
                    <span className="faint" style={{ marginLeft: 8, fontSize: 12 }}>{reason(c)}</span></span>
                  <span className="faint" style={{ fontSize: 13 }}>{isHere ? "目前" : elsewhereSlot ? `與 ${elsewhereSlot} 互換` : "換成他"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {lineup && lineup.bench.length > 0 && (
        <div className="panel pad">
          <p style={{ margin: "0 0 8px", fontWeight: 700 }}>替補（{lineup.bench.length}）</p>
          <div className="stack" style={{ gap: 2 }}>
            {lineup.bench.map((o) => (
              <button key={o.id} type="button" className="prow" disabled={!canEdit} style={{ gridTemplateColumns: "1fr auto" }}
                draggable={canEdit} onDragStart={(e) => dragStart(e, { kind: "bench", id: o.id })}
                onClick={() => setPicks((p) => assign(p, o.slot, o.id).picks)}>
                <span>{byId.get(o.id)?.jersey_number ? `#${byId.get(o.id)?.jersey_number} ` : ""}{o.name}</span>
                <span className="faint" style={{ fontSize: 13 }}>最適合 {o.slot} · {reason(o)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chips">
        <button type="button" className="btn btn-main" onClick={save} disabled={saving || !canEdit}>{saving ? "存檔中…" : "存檔"}</button>
        {currentId && canEdit && (
          <ConfirmButton label="刪除" confirm="確定刪除？" onConfirm={remove} className="btn btn-danger btn-sm" />
        )}
        {currentId && currentRow && (
          <button type="button" className="btn btn-line btn-sm" onClick={() => setSharing(true)} disabled={!canEdit}>分享</button>
        )}
      </div>

      {sharing && currentRow && (
        <LineupShare row={currentRow} labels={labels} formation={formation} onClose={() => setSharing(false)} onChanged={reload} />
      )}
    </section>
  );
}
