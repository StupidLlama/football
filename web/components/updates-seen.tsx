"use client";
// 打開「更新紀錄」頁就算看過最新版（小圓點和大更新視窗都不再出現）。
import { useEffect } from "react";
import { useUpdateNotice } from "./updates";

export function MarkUpdatesSeen() {
  const { markSeen } = useUpdateNotice();
  useEffect(() => { markSeen(); }, [markSeen]);
  return null;
}
