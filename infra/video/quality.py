"""用 OpenCV 量影片品質（v3.0）。只量數字，合不合格由 domain/video.py 判斷。

每 sample_every 秒取一格（和緊接的下一格算晃動），整場 90 分鐘約 540 個取樣點，不需要 GPU。
"""
from typing import Callable

import cv2
import numpy as np

from domain.video import FrameSample, VideoInfo

WIDTH = 960   # 量之前一律縮成這個寬度，門檻才不會跟著解析度變


def probe(path: str) -> VideoInfo:
    cap = cv2.VideoCapture(path)
    try:
        if not cap.isOpened():
            raise ValueError("unreadable")
        fps = cap.get(cv2.CAP_PROP_FPS) or 0
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        return VideoInfo(int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                         round(fps, 2), round(frames / fps, 1) if fps else 0)
    finally:
        cap.release()


def _small(frame: np.ndarray) -> np.ndarray:
    h, w = frame.shape[:2]
    return cv2.resize(frame, (WIDTH, max(1, round(h * WIDTH / w))), interpolation=cv2.INTER_AREA)


def has_lines(frame: np.ndarray) -> bool:
    """場地白線：顏色淡又亮的地方 → 邊緣 → 找夠長的直線，至少兩條。"""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, (0, 0, 170), (180, 60, 255))
    lines = cv2.HoughLinesP(cv2.Canny(white, 50, 150), 1, np.pi / 180, threshold=60,
                            minLineLength=frame.shape[1] // 8, maxLineGap=10)
    return lines is not None and len(lines) >= 2


def measure(frame: np.ndarray, next_frame: np.ndarray | None) -> FrameSample:
    frame = _small(frame)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    shake = 0.0
    if next_frame is not None:
        shake = float(cv2.absdiff(gray, cv2.cvtColor(_small(next_frame), cv2.COLOR_BGR2GRAY)).mean())
    return FrameSample(sharpness=float(cv2.Laplacian(gray, cv2.CV_64F).var()),
                       brightness=float(gray.mean()), shake=shake, has_lines=has_lines(frame))


def scan(path: str, every: float, on_progress: Callable[[float], None] | None = None
         ) -> tuple[VideoInfo, list[FrameSample]]:
    """量整支影片。on_progress(已經看到第幾秒) 讓呼叫的人回報進度。"""
    info = probe(path)
    cap = cv2.VideoCapture(path)
    samples = []
    try:
        t = 0.0
        while t < info.seconds:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, frame = cap.read()
            if not ok:
                break
            ok2, nxt = cap.read()
            samples.append(measure(frame, nxt if ok2 else None))
            if on_progress:
                on_progress(t)
            t += every
    finally:
        cap.release()
    return info, samples
