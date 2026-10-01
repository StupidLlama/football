"""把 supabase/migrations/ 裡還沒執行過的 SQL 依序跑進資料庫。

用法：  py -m backend.scripts.migrate            # 列出會執行哪些（不會動資料庫）
        py -m backend.scripts.migrate --apply    # 真的執行

執行過的檔名記在 public.schema_migrations；已經執行過的檔案不要再改，要改結構就新增下一號。
"""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"

TRACKING = """
create table if not exists public.schema_migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;
"""


def migration_files(folder: Path = MIGRATIONS) -> list[Path]:
    return sorted(folder.glob("[0-9][0-9][0-9][0-9]_*.sql"))


def pending(applied: set[str], files: list[Path]) -> list[Path]:
    return [f for f in files if f.name not in applied]


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="真的執行（沒加只會列出來）")
    args = ap.parse_args(argv)
    from backend import db
    with db.admin() as conn:
        with conn.transaction():
            conn.execute(TRACKING)
        applied = {r["name"] for r in conn.execute("select name from public.schema_migrations").fetchall()}
        todo = pending(applied, migration_files())
        if not todo:
            print("資料庫已經是最新的，沒有要執行的檔案。")
            return
        for f in todo:
            print(("執行 " if args.apply else "會執行 ") + f.name)
            if args.apply:
                with conn.transaction():      # 一個檔案一個交易：失敗就整個檔案都不算
                    conn.execute(f.read_text(encoding="utf-8"))
                    conn.execute("insert into public.schema_migrations (name) values (%s)", (f.name,))
        print("完成。" if args.apply else "這是預覽；確認沒問題再加 --apply。")


if __name__ == "__main__":
    main()
