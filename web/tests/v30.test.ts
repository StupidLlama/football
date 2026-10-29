// v3.0 影片分析：狀態文字、最新一次分析、影片資訊。
import { test } from "node:test";
import assert from "node:assert/strict";
import { isActive, latestVideo, reasonText, videoInfo, videoLabel, type MatchVideo } from "../lib/video.ts";

const base: MatchVideo = {
  id: "v1", team_id: "t", match_id: "m1", file_name: "a.mp4", status: "queued", progress: 0, grade: null, reasons: [],
  width: null, height: null, fps: null, seconds: null, error: "", created_at: "2026-11-01T10:00:00Z", updated_at: "",
};

test("狀態文字", () => {
  assert.equal(videoLabel(null), "");
  assert.equal(videoLabel(base), "等待分析");
  assert.equal(videoLabel({ ...base, status: "processing", progress: 35 }), "分析中 35%");
  assert.equal(videoLabel({ ...base, status: "done", progress: 100, grade: "low" }), "可以分析，但可信度低");
  assert.equal(videoLabel({ ...base, status: "failed" }), "分析失敗");
});

test("最新一次分析：取消的不算、別場的不算", () => {
  const old = { ...base, id: "old", status: "done" as const, grade: "ok" as const };
  const newer = { ...base, id: "new", status: "cancelled" as const, created_at: "2026-11-02T00:00:00Z" };
  const other = { ...base, id: "x", match_id: "m2", created_at: "2026-11-03T00:00:00Z" };
  assert.equal(latestVideo([old, newer, other], "m1")?.id, "old");
  assert.equal(latestVideo([], "m1"), null);
  assert.equal(isActive(base), true);
  assert.equal(isActive(old), false);
});

test("原因白話、影片資訊", () => {
  assert.equal(reasonText("dark"), "畫面太暗");
  assert.equal(reasonText("???"), "???");
  assert.equal(videoInfo({ ...base, width: 1920, height: 1080, fps: 29.97, seconds: 5400 }), "1920×1080 · 30 fps · 90 分鐘");
});
