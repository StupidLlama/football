"""v3.0 影片品質檢查與分析排隊：Core 規則、翻譯、設定檔、0015 migration 的靜態檢查。

真正的權限測試在 supabase/tests/rls_test.sql 的「v3.0 影片分析」那一段。
OpenCV 的量測測試要裝 opencv-python-headless 才會跑（Colab 上有；沒裝就跳過）。
"""
import re
from pathlib import Path

import pytest

from adapters.video import failed, progress, report
from domain.video import HARD, LOW, OK, REASONS, REJECT, FrameSample, VideoInfo, VideoRules, judge
from infra.config import load_video

ROOT = Path(__file__).resolve().parent.parent
MIG15 = (ROOT / "supabase" / "migrations" / "0015_video.sql").read_text(encoding="utf-8")
RULES = VideoRules()
GOOD_INFO = VideoInfo(1920, 1080, 30, 90 * 60)
GOOD = FrameSample(sharpness=300, brightness=120, shake=5, has_lines=True)


def test_good_video_passes():
    assert judge(GOOD_INFO, [GOOD] * 5, RULES).grade == OK


@pytest.mark.parametrize("info, reason", [
    (VideoInfo(1280, 720, 30, 5400), "resolution"),
    (VideoInfo(1920, 1080, 15, 5400), "fps"),
    (VideoInfo(1920, 1080, 30, 3 * 3600), "too_long"),
    (VideoInfo(1920, 1080, 30, 20), "too_short"),
])
def test_hard_rules_reject(info, reason):
    v = judge(info, [GOOD], RULES)
    assert v.grade == REJECT and reason in v.reasons


def test_portrait_1080p_counts_as_1080p():
    assert judge(VideoInfo(1080, 1920, 30, 5400), [GOOD], RULES).grade == OK


@pytest.mark.parametrize("sample, reason", [
    (FrameSample(20, 120, 5, True), "blurry"),
    (FrameSample(300, 30, 5, True), "dark"),
    (FrameSample(300, 230, 5, True), "bright"),
    (FrameSample(300, 120, 60, True), "shaky"),
    (FrameSample(300, 120, 5, False), "no_lines"),
])
def test_soft_rules_lower_confidence(sample, reason):
    v = judge(GOOD_INFO, [sample] * 3, RULES)
    assert v.grade == LOW and v.reasons == (reason,)


def test_median_ignores_a_few_bad_frames():
    bad = FrameSample(5, 10, 90, False)
    assert judge(GOOD_INFO, [GOOD, GOOD, bad], RULES).grade == OK


def test_no_frames_is_unreadable():
    assert judge(GOOD_INFO, [], RULES).reasons == ("unreadable",)


def test_settings_has_video_thresholds():
    rules, every = load_video()
    assert rules.min_width == 1920 and rules.max_minutes == 120 and every > 0


def test_progress_and_report():
    assert progress(2700, GOOD_INFO) == 50
    assert progress(99999, GOOD_INFO) == 99 and progress(5, VideoInfo(1, 1, 1, 0)) == 0
    r = report(GOOD_INFO, judge(GOOD_INFO, [GOOD], RULES))
    assert r["p_status"] == "done" and r["p_progress"] == 100 and r["p_grade"] == OK
    assert len(failed("x" * 500)["p_error"]) == 200


def test_reason_codes_match_database_and_website():
    """原因代碼三邊一樣：domain/video.py、0015 的 allowed、web/lib/video.ts 的白話翻譯。"""
    allowed = re.search(r"allowed constant text\[\] := array\[(.*?)\];", MIG15, re.S).group(1)
    assert set(re.findall(r"'(\w+)'", allowed)) == set(REASONS)
    assert HARD <= set(REASONS)
    web = (ROOT / "web" / "lib" / "video.ts").read_text(encoding="utf-8")
    for code in REASONS:
        assert re.search(rf"\b{code}:", web), code


def test_0015_tables_and_permissions():
    assert "alter table public.match_videos enable row level security" in MIG15
    assert "alter table public.video_tokens enable row level security" in MIG15
    assert "create trigger match_videos_season_guard" in MIG15
    assert "alter publication supabase_realtime add table public.match_videos" in MIG15
    assert not re.search(r"grant [^;]*(insert|update|delete)[^;]* on public\.match_videos", MIG15)
    assert not re.search(r"create policy \w+ on public\.video_tokens", MIG15)
    for fn in re.findall(r"create or replace function public\.(\w+)\(", MIG15):
        head = MIG15[MIG15.index(f"function public.{fn}("):]
        assert "set search_path = public" in head[:head.index("$$")], fn
    revoked = re.search(r"revoke all on function(.*?)from public, anon;", MIG15, re.S).group(1)
    for fn in ("video_token_hash", "create_video_job", "cancel_video_job", "report_video_job"):
        assert f"public.{fn}(" in revoked, fn


def test_token_only_stored_as_hash():
    assert "token_hash" in MIG15 and "video_token_hash(raw)" in MIG15
    assert not re.search(r"insert into public\.video_tokens[^;]*\braw\)", MIG15.replace("video_token_hash(raw)", ""))


def _pitch(lines: bool = True):
    cv2 = pytest.importorskip("cv2", reason="沒裝 opencv-python-headless")
    import numpy as np
    img = np.full((1080, 1920, 3), (40, 140, 40), np.uint8)   # 綠色草地（BGR）
    if lines:
        cv2.line(img, (100, 540), (1820, 540), (255, 255, 255), 6)
        cv2.line(img, (960, 100), (960, 1000), (255, 255, 255), 6)
        cv2.rectangle(img, (100, 300), (400, 780), (255, 255, 255), 6)
    rng = np.random.default_rng(0)
    return np.clip(img + rng.integers(-25, 25, img.shape), 0, 255).astype(np.uint8)   # 草地紋理


def test_measure_sharp_pitch():
    pytest.importorskip("cv2", reason="沒裝 opencv-python-headless")
    from infra.video.quality import measure
    s = measure(_pitch(), _pitch())
    v = judge(GOOD_INFO, [s], RULES)
    assert s.has_lines and v.grade == OK, (s, v)


def test_measure_blurry_dark_shaky():
    cv2 = pytest.importorskip("cv2", reason="沒裝 opencv-python-headless")
    import numpy as np
    from infra.video.quality import measure
    blurred = cv2.GaussianBlur(_pitch(), (31, 31), 0)
    assert "blurry" in judge(GOOD_INFO, [measure(blurred, blurred)], RULES).reasons
    dark = (_pitch() * 0.2).astype(np.uint8)
    assert "dark" in judge(GOOD_INFO, [measure(dark, dark)], RULES).reasons
    assert "shaky" in judge(GOOD_INFO, [measure(_pitch(), np.roll(_pitch(), 200, axis=1) // 3)], RULES).reasons
    assert not measure(_pitch(lines=False), None).has_lines


def test_connection_code_checked():
    from analysis.run_job import parse_connection
    ok = parse_connection('{"url": "https://x.supabase.co", "key": "pk", "token": "pv_abc"}')
    assert ok["token"] == "pv_abc"
    for bad in ('{"url": "http://x", "key": "k", "token": "pv_a"}', '{"url": "https://x", "key": "", "token": "pv_a"}',
                '{"url": "https://x", "key": "k", "token": "abc"}'):
        with pytest.raises(ValueError):
            parse_connection(bad)


def test_notebook_has_no_outputs_or_secrets():
    """筆記本會進公開 repo：不能有執行結果（可能有影片畫面、名字），也不能寫死權杖。"""
    import json
    nb = json.loads((ROOT / "analysis" / "potato_v3.ipynb").read_text(encoding="utf-8"))
    for cell in nb["cells"]:
        assert not cell.get("outputs"), "筆記本要先清掉輸出"
        assert "pv_" not in "".join(cell["source"]) and "supabase.co" not in "".join(cell["source"])
