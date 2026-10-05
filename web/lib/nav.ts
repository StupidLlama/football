// 登入後要去哪一頁。
export function homeFor(teams: { team: { id: string } }[]): string {
  if (teams.length === 0) return "/join";
  if (teams.length === 1) return `/t/${teams[0].team.id}`;
  return "/teams";
}

/** 只允許站內路徑（避免 ?next=https://壞網站 這種跳轉）。 */
export function safeNext(path: string | null | undefined): string | null {
  return path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : null;
}

/** 今天的日期「2026-10-05」（用這台裝置的時區）。 */
export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
