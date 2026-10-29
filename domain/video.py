"""比賽影片的品質規則（Core，v3.0）：量出來的數字 → 合格／可信度低／拒絕，附原因。純 Python。

比喻：賽前檢錄。硬性規定（解析度、幀率、長度）不合格就不能比；
畫面糊、太暗、晃、看不到場地線還是可以分析，但結果「可信度低」。
量測（OpenCV）在 infra/video/，這裡只管規則；門檻在 config/settings.toml 的 [video]。
"""
from dataclasses import dataclass
from statistics import median

OK, LOW, REJECT = "ok", "low", "reject"

# 原因代碼（網站 web/lib/video.ts 翻成白話）
REASONS = ("resolution", "fps", "too_long", "too_short", "blurry", "dark", "bright", "shaky", "no_lines", "unreadable")
HARD = {"resolution", "fps", "too_long", "too_short", "unreadable"}   # 有這些就拒絕


@dataclass(frozen=True)
class VideoRules:
    min_width: int = 1920
    min_height: int = 1080
    min_fps: float = 25
    max_fps: float = 60
    min_minutes: float = 1
    max_minutes: float = 120
    min_sharpness: float = 100     # Laplacian 變異數的中位數，低於 = 糊
    min_brightness: float = 60     # 灰階平均 0–255
    max_brightness: float = 200
    max_shake: float = 25          # 相鄰兩格的平均灰階差，高於 = 晃
    min_line_ratio: float = 0.5    # 取樣的畫面裡，看得到場地線的比例


@dataclass(frozen=True)
class VideoInfo:
    width: int
    height: int
    fps: float
    seconds: float


@dataclass(frozen=True)
class FrameSample:
    """一個取樣點的量測結果。"""
    sharpness: float
    brightness: float
    shake: float
    has_lines: bool


@dataclass(frozen=True)
class Verdict:
    grade: str                     # ok / low / reject
    reasons: tuple[str, ...]


def check_info(info: VideoInfo, rules: VideoRules) -> tuple[str, ...]:
    """只看檔案資訊（不用讀畫面）就能判斷的原因。"""
    reasons = []
    # 直拍（1080×1920）也算：比的是長邊和短邊
    if max(info.width, info.height) < rules.min_width or min(info.width, info.height) < rules.min_height:
        reasons.append("resolution")
    if not rules.min_fps <= info.fps <= rules.max_fps:
        reasons.append("fps")
    if info.seconds > rules.max_minutes * 60:
        reasons.append("too_long")
    elif info.seconds < rules.min_minutes * 60:
        reasons.append("too_short")
    return tuple(reasons)


def check_frames(samples: list[FrameSample], rules: VideoRules) -> tuple[str, ...]:
    """看取樣畫面的原因。用中位數：偶爾一格糊或切到觀眾不影響。"""
    if not samples:
        return ("unreadable",)
    reasons = []
    if median(s.sharpness for s in samples) < rules.min_sharpness:
        reasons.append("blurry")
    light = median(s.brightness for s in samples)
    if light < rules.min_brightness:
        reasons.append("dark")
    elif light > rules.max_brightness:
        reasons.append("bright")
    if median(s.shake for s in samples) > rules.max_shake:
        reasons.append("shaky")
    if sum(s.has_lines for s in samples) / len(samples) < rules.min_line_ratio:
        reasons.append("no_lines")
    return tuple(reasons)


def judge(info: VideoInfo, samples: list[FrameSample], rules: VideoRules) -> Verdict:
    reasons = check_info(info, rules) + check_frames(samples, rules)
    if HARD & set(reasons):
        return Verdict(REJECT, reasons)
    return Verdict(LOW if reasons else OK, reasons)
