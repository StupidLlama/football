"""在真的資料庫上跑權限測試（supabase/tests/rls_test.sql）。整個測試最後會 ROLLBACK，不會留下資料。

用法：  py -m backend.scripts.rls_check
看到「RLS OK」就是全部通過；失敗會印出哪一條規則有問題。
"""
from pathlib import Path

TEST = Path(__file__).resolve().parents[2] / "supabase" / "tests" / "rls_test.sql"


def body(sql: str) -> str:
    """拿掉檔案自己的 begin / rollback，改由程式控制交易（一定 rollback）。"""
    lines = [l for l in sql.splitlines() if l.strip().lower() not in ("begin;", "rollback;")]
    return "\n".join(lines)


def main() -> None:
    from backend import db
    with db.admin() as conn:
        try:
            with conn.transaction(force_rollback=True):
                conn.execute(body(TEST.read_text(encoding="utf-8")))
        except Exception as e:
            print("RLS 測試失敗：", getattr(getattr(e, "diag", None), "message_primary", None) or e)
            raise SystemExit(1)
    print("RLS OK：A 隊讀不到 B 隊、球員不能改賽程、沒登入看不到任何資料；"
          "同一個帳號在兩隊身分不同、Team ID 鎖定、教練碼封鎖、認領要教練確認、能力表格式檢查、清空資料表被擋；"
          "陣容草稿只有自己看得到、分享連結只能看且預設不顯示名字（測試資料已全部還原）")


if __name__ == "__main__":
    main()
