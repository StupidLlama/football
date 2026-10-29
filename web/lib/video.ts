// v3.0 比賽影片分析：狀態文字、品質原因的白話翻譯（純計算，跟 domain/video.py 的原因代碼一致，tests/test_v30.py 會檢查）。

export type VideoStatus = "queued" | "processing" | "done" | "failed" | "cancelled";
export type VideoGrade = "ok" | "low" | "reject";
export type MatchVideo = {
  id: string; team_id: string; match_id: string; file_name: string; status: VideoStatus; progress: number;
  grade: VideoGrade | null; reasons: string[]; width: number | null; height: number | null;
  fps: number | null; seconds: number | null; error: string; created_at: string; updated_at: string;
};

export const REASON_TEXT: Record<string, string> = {
  resolution: "解析度不到 1080p",
  fps: "幀率要在每秒 25–60 格",
  too_long: "影片超過 120 分鐘",
  too_short: "影片不到 1 分鐘",
  unreadable: "讀不到影片畫面（檔案壞掉或格式不支援）",
  blurry: "畫面太糊",
  dark: "畫面太暗",
  bright: "畫面太亮（過曝）",
  shaky: "鏡頭晃動或移動太多",
  no_lines: "看不太到場地線",
};

export const GRADE_TEXT: Record<VideoGrade, string> = { ok: "品質合格", low: "可以分析，但可信度低", reject: "影片不合格" };

export const reasonText = (code: string) => REASON_TEXT[code] ?? code;

/** 這場比賽最新的一次分析（取消的不算）。 */
export function latestVideo(videos: MatchVideo[], matchId: string): MatchVideo | null {
  let best: MatchVideo | null = null;
  for (const v of videos) {
    if (v.match_id !== matchId || v.status === "cancelled") continue;
    if (!best || v.created_at > best.created_at) best = v;
  }
  return best;
}

export const isActive = (v: MatchVideo | null) => !!v && (v.status === "queued" || v.status === "processing");

/** 比賽列表、比賽頁上的一句話，例如「分析中 35%」「影片不合格」。 */
export function videoLabel(v: MatchVideo | null): string {
  if (!v) return "";
  if (v.status === "queued") return "等待分析";
  if (v.status === "processing") return `分析中 ${v.progress}%`;
  if (v.status === "failed") return "分析失敗";
  if (v.status === "done" && v.grade) return GRADE_TEXT[v.grade];
  return "";
}

/** 影片資訊：「1920×1080 · 30 fps · 90 分鐘」 */
export function videoInfo(v: MatchVideo): string {
  const parts: string[] = [];
  if (v.width && v.height) parts.push(`${v.width}×${v.height}`);
  if (v.fps) parts.push(`${Math.round(Number(v.fps))} fps`);
  if (v.seconds) parts.push(`${Math.round(Number(v.seconds) / 60)} 分鐘`);
  return parts.join(" · ");
}

/** 在 Colab 打開筆記本的網址（筆記本在 repo 的 main 分支）。 */
export const NOTEBOOK_URL = "https://colab.research.google.com/github/StupidLlama/football/blob/main/analysis/potato_v3.ipynb";
