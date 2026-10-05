"use client";
// /t/[teamId] 底下每一頁共用：要登入、讀這一隊的資料一次、側邊欄。
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { RequireLogin } from "@/components/guard";
import { TeamShell } from "@/components/shell";
import { TeamProvider } from "@/lib/team";

export default function TeamLayout({ children }: { children: ReactNode }) {
  const { teamId } = useParams<{ teamId: string }>();
  return (
    <RequireLogin>
      <TeamProvider teamId={teamId}>
        <TeamShell teamId={teamId}>{children}</TeamShell>
      </TeamProvider>
    </RequireLogin>
  );
}
