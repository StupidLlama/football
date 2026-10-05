"""v2 API（FastAPI）。

本機啟動：  py -m uvicorn backend.main:app --reload
API 文件：  http://127.0.0.1:8000/docs（自動產生）

v2.2 起正式網站（web/，Next.js）直接連 Supabase，不經過這個 API；
這裡留給匯入工具、之後的影片分析，以及用 /docs 手動測試資料庫函式。

每個需要登入的 API 都用「那個使用者的身分」查資料庫（db.as_user），
所以權限由資料庫的 RLS 規則把關：就算這裡寫錯，也讀不到別隊的資料。
"""
import uuid
from datetime import date
from functools import lru_cache
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, Header, HTTPException

from domain.rating import average, recommended
from infra import config

from . import accounts, db
from .auth import AuthError, bearer_token, verify
from .queries import FIXTURE_COLUMNS, fixture_json, row_to_fixture
from .settings import Settings, load_settings

app = FastAPI(title="Football Analysis Potato API", version="2.2.0")
TAIPEI = ZoneInfo("Asia/Taipei")


@lru_cache(maxsize=1)
def settings() -> Settings:
    return load_settings()


def today() -> date:
    from datetime import datetime
    return datetime.now(TAIPEI).date()


def current_user(authorization: str | None = Header(default=None)) -> str:
    s = settings()
    try:
        claims = verify(bearer_token(authorization), s.jwks_url, issuer=f"{s.supabase_url.rstrip('/')}/auth/v1")
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    return claims["sub"]


def connection():
    with db.admin(settings().database_url) as conn:
        yield conn


def _team_or_404(conn, team_id: str) -> dict:
    try:
        uuid.UUID(team_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="找不到這個隊伍") from None
    team = conn.execute("select id, code, name, season, league_name from public.teams where id = %s",
                        (team_id,)).fetchone()
    if team is None:   # 不存在，或你不是這一隊的人（RLS 擋掉）→ 一律 404，不透露隊伍存不存在
        raise HTTPException(status_code=404, detail="找不到這個隊伍")
    return team


@app.get("/health")
def health():
    """不用登入：確認 API 活著、連得上資料庫。"""
    try:
        with db.admin(settings().database_url) as conn:
            conn.execute("select 1").fetchone()
        return {"ok": True, "database": True}
    except Exception as e:
        return {"ok": False, "database": False, "error": type(e).__name__}


# v2.1 帳號系統的 API（加入、教練碼、認領、教練管理、系統管理者）
accounts.register(app, current_user, connection)

@app.get("/me/teams")
def my_teams(user: str = Depends(current_user), conn=Depends(connection)):
    with db.as_user(conn, user):
        rows = conn.execute(
            """select t.id, t.code, t.name, t.season, m.role
               from public.teams t join public.memberships m on m.team_id = t.id
               where m.user_id = auth.uid() order by t.created_at""").fetchall()
    return [{**r, "id": str(r["id"])} for r in rows]


@app.get("/teams/{team_id}/players")
def team_players(team_id: str, user: str = Depends(current_user), conn=Depends(connection)):
    rules = config.rules()
    with db.as_user(conn, user):
        _team_or_404(conn, team_id)
        rows = conn.execute(
            """select p.id, p.name, p.nickname, p.jersey_number, p.badge, p.good_positions, p.bad_positions,
                      p.weak_side, r.scores, r.submitted_at
               from public.players p
               left join lateral (select scores, submitted_at from public.ability_ratings a
                                  where a.player_id = p.id order by submitted_at desc limit 1) r on true
               where p.team_id = %s order by p.name""", (team_id,)).fetchall()
    out = []
    for r in rows:
        scores = {k: int((r["scores"] or {}).get(k, rules.min_score)) for k in rules.ability_keys}
        rated = r["scores"] is not None
        out.append({
            "id": str(r["id"]), "name": r["name"], "nickname": r["nickname"], "jersey_number": r["jersey_number"],
            "badge": r["badge"], "good_positions": r["good_positions"], "bad_positions": r["bad_positions"],
            "weak_side": r["weak_side"], "scores": scores if rated else None,
            "average": round(average(scores, rules), 2) if rated else None,
            "recommended": recommended(scores, rules) if rated else [],
        })
    return out


@app.get("/teams/{team_id}/fixtures")
def team_fixtures(team_id: str, user: str = Depends(current_user), conn=Depends(connection)):
    from stats.schedule import form, record
    with db.as_user(conn, user):
        team = _team_or_404(conn, team_id)
        rows = conn.execute(f"select {FIXTURE_COLUMNS} from public.fixtures where team_id = %s "
                            "order by day, start_time", (team_id,)).fetchall()
    name, now = team["league_name"] or "", today()
    fixtures = [row_to_fixture(r) for r in rows]
    rec = record(fixtures, name)
    return {
        "team": name,
        "record": {"wins": rec.wins, "draws": rec.draws, "losses": rec.losses, "goals_for": rec.goals_for,
                   "goals_against": rec.goals_against, "points": rec.points},
        "form": form(fixtures, name),
        "fixtures": [fixture_json(r, name, now) for r in rows],
    }


@app.get("/teams/{team_id}/duties")
def team_duties(team_id: str, user: str = Depends(current_user), conn=Depends(connection)):
    with db.as_user(conn, user):
        _team_or_404(conn, team_id)
        rows = conn.execute(
            """select d.id, d.role, d.slot, f.day, f.start_time, f.end_time, f.home, f.away, p.name as player
               from public.duties d join public.fixtures f on f.id = d.fixture_id
               left join public.players p on p.id = d.player_id
               where d.team_id = %s order by f.day, f.start_time""", (team_id,)).fetchall()
    return [{"id": str(r["id"]), "role": r["role"], "slot": r["slot"], "day": r["day"].isoformat(),
             "start": str(r["start_time"])[:5] if r["start_time"] else "", "home": r["home"], "away": r["away"],
             "player": r["player"]} for r in rows]
