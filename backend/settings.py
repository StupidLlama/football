"""讀 .env（Supabase 的網址和金鑰）。.env 不會上傳到 GitHub，範本在 .env.example。"""
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
KEYS = ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "DATABASE_URL")


def parse_env(text: str) -> dict[str, str]:
    """KEY=VALUE 一行一個；# 開頭是註解；值可以加引號。"""
    out = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        out[key.strip()] = value
    return out


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    publishable_key: str
    secret_key: str
    database_url: str

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    def missing(self) -> list[str]:
        values = dict(zip(KEYS, (self.supabase_url, self.publishable_key, self.secret_key, self.database_url)))
        return [k for k, v in values.items() if not v]


def load_settings(env_file: Path = ENV_FILE, environ: dict | None = None) -> Settings:
    """環境變數優先（部署時用），其次是 .env 檔（本機用）。"""
    values = parse_env(env_file.read_text(encoding="utf-8")) if env_file.exists() else {}
    values.update({k: v for k, v in (environ if environ is not None else os.environ).items() if k in KEYS and v})
    return Settings(*(values.get(k, "") for k in KEYS))
