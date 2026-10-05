"use client";
// 一支球隊的資料：進到 /t/[teamId] 底下任何一頁時讀一次，各頁共用。改了資料就呼叫 reload()。
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getTeamData, type TeamData } from "./api";
import { useAuth } from "./auth";
import { RULES } from "./config";
import { buildTeamView, type TeamView } from "./teamview";

type TeamCtx = { view: TeamView | null; loading: boolean; error: string; missing: boolean; reload: () => Promise<void> };
const Ctx = createContext<TeamCtx | null>(null);

export function TeamProvider({ teamId, children }: { teamId: string; children: ReactNode }) {
  const { userId } = useAuth();
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const d = await getTeamData(teamId, userId);
      setData(d); setMissing(!d); setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [teamId, userId]);

  useEffect(() => { setLoading(true); reload(); }, [reload]);

  const view = useMemo(() => (data ? buildTeamView(data, RULES) : null), [data]);
  return <Ctx.Provider value={{ view, loading, error, missing, reload }}>{children}</Ctx.Provider>;
}

export function useTeam(): TeamCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTeam 要放在 TeamProvider 裡面");
  return v;
}

/** 頁面裡用：一定有資料（TeamShell 會先處理讀取中和讀不到的情況）。 */
export function useTeamView(): TeamView & { reload: () => Promise<void> } {
  const { view, reload } = useTeam();
  if (!view) throw new Error("球隊資料還沒讀到");
  return { ...view, reload };
}
