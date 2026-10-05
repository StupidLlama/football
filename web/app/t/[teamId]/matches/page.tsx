"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ComingSoon } from "@/components/ui";

export default function MatchesPage() {
  const { teamId } = useParams<{ teamId: string }>();
  return (
    <ComingSoon title="比賽" version="v2.5">
      比賽列表（即將進行、已結束、已分析）和出賽登記：一鍵回覆會不會到，出席名單直接帶進組隊。
      下一場、近期戰績和裁判任務現在在 <Link href={`/t/${teamId}/home`}>首頁</Link> 看得到。
    </ComingSoon>
  );
}
