"""影片品質結果的翻譯（Translate shell，v3.0）：Core 的 Verdict → 回報給資料庫 report_video_job 的參數。"""
from domain.video import Verdict, VideoInfo


def progress(seconds_done: float, info: VideoInfo) -> int:
    """進度 = 看到第幾秒 ÷ 影片總長，0–99（100 留給「完成」）。"""
    if info.seconds <= 0:
        return 0
    return max(0, min(99, int(seconds_done / info.seconds * 100)))


def report(info: VideoInfo, verdict: Verdict) -> dict:
    return {"p_status": "done", "p_progress": 100, "p_grade": verdict.grade, "p_reasons": list(verdict.reasons),
            "p_width": info.width, "p_height": info.height, "p_fps": info.fps, "p_seconds": info.seconds}


def failed(error: str) -> dict:
    """失敗：只回報一句短的原因（不要把整段錯誤訊息、檔案路徑送出去）。"""
    return {"p_status": "failed", "p_error": error[:200]}


