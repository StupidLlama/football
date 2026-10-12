// 賽季分組（v2.8）：同一支隊伍的各個賽季（teams 共用 lineage_id）收成一組，選球隊時只看到一張卡。純計算。
export type SeasonTeam = {
  team: { id: string; lineage_id: string; archived_at: string | null; created_at: string };
};
export type SeasonGroup<T extends SeasonTeam> = {
  lineage: string;
  /** 目前這一季：沒封存的最新一季；全都封存（例如新賽季被移出）就用最新的那一季 */
  current: T;
  /** 其他賽季（新到舊），都是舊賽季，只能看 */
  past: T[];
};

const time = (iso: string) => Date.parse(iso) || 0;

/** 依 lineage_id 分組；組與組之間照「目前這一季」的建立時間（新到舊）。 */
export function groupSeasons<T extends SeasonTeam>(teams: T[]): SeasonGroup<T>[] {
  const by = new Map<string, T[]>();
  for (const t of teams) {
    const list = by.get(t.team.lineage_id);
    if (list) list.push(t); else by.set(t.team.lineage_id, [t]);
  }
  const groups: SeasonGroup<T>[] = [];
  for (const [lineage, list] of by) {
    const sorted = list.slice().sort((a, b) => time(b.team.created_at) - time(a.team.created_at));
    const current = sorted.find((t) => !t.team.archived_at) ?? sorted[0];
    groups.push({ lineage, current, past: sorted.filter((t) => t !== current) });
  }
  return groups.sort((a, b) => time(b.current.team.created_at) - time(a.current.team.created_at));
}
