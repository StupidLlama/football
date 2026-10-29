"""v3.0 影片分析（在 Colab 跑）：品質檢查 → 把進度和結果回報給網站。

用法（Colab 筆記本 analysis/potato_v3.ipynb 會幫你呼叫）：
    py analysis/run_job.py <影片路徑> '<網站複製的連線碼 JSON>'

連線碼 = {"url": Supabase 網址, "key": publishable key, "token": 分析權杖}，在比賽頁按「建立影片分析」拿到。
網址和 publishable key 本來就是公開的；權杖只能回報那一次分析，不能讀任何資料。
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from adapters.video import failed, progress, report  # noqa: E402
from domain.video import REJECT, Verdict, VideoInfo, judge  # noqa: E402
from infra.config import load_video  # noqa: E402


def parse_connection(text: str) -> dict:
    c = json.loads(text)
    if not (str(c.get("url", "")).startswith("https://") and c.get("key") and str(c.get("token", "")).startswith("pv_")):
        raise ValueError("連線碼不完整：請從網站比賽頁重新複製")
    return c


def send(conn: dict, payload: dict) -> dict:
    """呼叫 report_video_job；網路斷掉重試 3 次。"""
    body = json.dumps({"p_token": conn["token"], **payload}).encode()
    req = urllib.request.Request(f"{conn['url'].rstrip('/')}/rest/v1/rpc/report_video_job", data=body, method="POST",
                                 headers={"apikey": conn["key"], "Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except OSError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    return {}


def run(video: str, conn: dict) -> Verdict:
    from infra.video.quality import probe, scan   # 只有真的跑影片才需要 OpenCV

    rules, every = load_video()
    try:
        info = probe(video)
        if not (info.width and info.height and info.fps and info.seconds):
            raise ValueError("unreadable")
    except ValueError:
        verdict = Verdict(REJECT, ("unreadable",))
        send(conn, report(VideoInfo(0, 0, 0, 0), verdict) | {"p_width": None, "p_height": None})
        return verdict

    last = [-1]

    def on_progress(t: float) -> None:
        p = progress(t, info)
        if p >= last[0] + 2:   # 每 2% 回報一次，整場最多 50 次
            last[0] = p
            r = send(conn, {"p_status": "processing", "p_progress": p, "p_width": info.width, "p_height": info.height,
                            "p_fps": info.fps, "p_seconds": info.seconds})
            if r.get("status") != "ok":   # 網站上取消了、權杖過期
                raise SystemExit(f"\n網站回應 {r.get('status')}：這次分析已經取消或權杖失效，停止。")
            print(f"\r進度 {p}%", end="", flush=True)

    on_progress(0)
    _, samples = scan(video, every, on_progress)
    verdict = judge(info, samples, rules)
    r = send(conn, report(info, verdict))
    print(f"\n結果：{verdict.grade} {list(verdict.reasons)}（網站回應 {r.get('status')}）")
    return verdict


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    conn = parse_connection(sys.argv[2])
    try:
        run(sys.argv[1], conn)
    except Exception as e:
        send(conn, failed(type(e).__name__))   # 只回報錯誤種類，不送檔案路徑
        raise


if __name__ == "__main__":
    main()
