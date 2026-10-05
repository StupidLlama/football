"""v2.1 帳號系統的 API：加入球隊、兌換管理員碼、認領名單上的自己、球隊管理員管理、網站管理員。

規則都寫在資料庫函式裡（supabase/migrations/0003_accounts.sql），這裡只負責：
1. 用「那個使用者的身分」呼叫函式（db.as_user，RLS 和函式裡的 auth.uid() 才會生效）
2. 把函式回傳的 status 翻成 HTTP 狀態碼和中文訊息

注意：一定要先離開 as_user 的 with 區塊再丟 HTTPException。
在區塊裡丟例外會讓交易 ROLLBACK，「輸錯幾次」的紀錄就會消失，鎖定和封鎖就失效了。
"""
import uuid

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from . import db

# 資料庫函式回傳的 status → (HTTP 狀態碼, 給使用者看的訊息)
STATUS = {
    "ok": (200, "完成"),
    "joined": (200, "已加入球隊"),
    "already_member": (200, "你已經在這一隊了"),
    "already_coach": (200, "你在這一隊已經是球隊管理員"),
    "unauthenticated": (401, "請先登入"),
    "wrong_code": (400, "管理員碼不對、已過期或已作廢"),
    "invalid": (400, "輸入的資料不正確"),
    "forbidden": (403, "你沒有權限做這件事"),
    "banned": (403, "管理員碼輸錯太多次，已被封鎖；請找這一隊的球隊管理員解除"),
    "not_found": (404, "找不到"),
    "not_member": (404, "找不到這個隊伍"),
    "taken": (409, "這位球員已經被其他帳號認領，或這個名字已經在名單上"),
    "already_linked": (409, "你已經連到名單上的球員了"),
    "not_linked": (409, "你還沒連到名單上的球員；請先認領自己，球隊管理員確認後才能填能力表"),
    "last_coach": (409, "你是這一隊最後一位球隊管理員，不能離隊；請先找網站管理員"),
    "locked": (429, "Team ID 輸錯太多次，請 15 分鐘後再試"),
    "too_fast": (429, "剛剛已經送出了，請過幾秒再試"),
    "rate_limited": (429, "送出太多次了，請一小時後再試"),
    "linked": (409, "這位球員已經連到帳號，不能刪除；要先請他刪除帳號或移出球隊"),
}
NOT_FOUND_TEAM = "找不到這個 Team ID"


def result(r: dict, not_found: str | None = None) -> dict:
    """把資料庫函式的回傳變成 API 回應；不是成功的狀態就丟 HTTPException。"""
    status = r.get("status", "")
    code, message = STATUS.get(status, (500, "伺服器發生錯誤"))
    if status == "not_found" and not_found:
        message = not_found
    if r.get("detail"):
        message = r["detail"]
    if code >= 400:
        raise HTTPException(status_code=code, detail={**r, "message": message})
    return {**r, "message": message}


def rpc(conn, user: str, sql: str, params: tuple) -> dict:
    """用使用者身分呼叫一個回傳 jsonb 的資料庫函式。交易在這裡就結束（commit）。"""
    with db.as_user(conn, user):
        row = conn.execute(f"select {sql} as r", params).fetchone()
    return row["r"]


# ---------- 請求格式 ----------
class JoinBody(BaseModel):
    code: str = Field(min_length=1, max_length=40)


class CodeBody(BaseModel):
    code: str = Field(min_length=1, max_length=40)


class ClaimBody(BaseModel):
    player_id: uuid.UUID | None = None
    new_name: str | None = Field(default=None, max_length=40)


class DecideBody(BaseModel):
    approve: bool


class ProfileBody(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)


class CoachCodeBody(BaseModel):
    valid_days: int = Field(default=7, ge=1, le=30)


class TeamBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    season: str | None = Field(default=None, max_length=20)
    league_name: str | None = Field(default=None, max_length=20)


def register(app, current_user, connection) -> None:
    """main.py 呼叫：把下面的 API 掛上去（current_user、connection 由 main.py 提供）。"""

    # ---------- 自己 ----------
    @app.get("/me", tags=["帳號"])
    def me(user: str = Depends(current_user), conn=Depends(connection)):
        """我的資料和加入的球隊（每隊的身分、認領狀態）。"""
        with db.as_user(conn, user):
            # profile 在帳號建立時由資料庫自動產生（0003 的 on_auth_user_created）
            prof = conn.execute("select display_name, is_admin from public.profiles where user_id = auth.uid()").fetchone()
            prof = prof or {"display_name": "", "is_admin": False}
            teams = conn.execute(
                """select t.id, t.code, t.name, t.season, m.role, m.player_id, p.name as player_name,
                          m.claim_player_id, cp.name as claim_player_name, m.claim_new_name,
                          g.banned_at is not null as coach_code_banned
                   from public.memberships m join public.teams t on t.id = m.team_id
                   left join public.players p on p.id = m.player_id
                   left join public.players cp on cp.id = m.claim_player_id
                   left join public.coach_code_guard g on g.team_id = m.team_id and g.user_id = m.user_id
                   where m.user_id = auth.uid() order by m.joined_at""").fetchall()
        return {"user_id": user, "display_name": prof["display_name"], "is_admin": prof["is_admin"],
                "teams": [_ids(t) for t in teams]}

    @app.patch("/me", tags=["帳號"])
    def update_me(body: ProfileBody, user: str = Depends(current_user), conn=Depends(connection)):
        name = body.display_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail={"status": "invalid", "message": "顯示名稱不能空白"})
        with db.as_user(conn, user):
            conn.execute("update public.profiles set display_name = %s where user_id = auth.uid()", (name,))
        return {"status": "ok", "display_name": name}

    # ---------- 加入、離開、升級成球隊管理員 ----------
    @app.post("/teams/join", tags=["帳號"])
    def join(body: JoinBody, user: str = Depends(current_user), conn=Depends(connection)):
        """輸入 Team ID 加入球隊（身分是球員）。輸錯 5 次鎖 15 分鐘。"""
        return result(rpc(conn, user, "public.join_team(%s)", (body.code,)), NOT_FOUND_TEAM)

    @app.post("/teams/{team_id}/leave", tags=["帳號"])
    def leave(team_id: uuid.UUID, user: str = Depends(current_user), conn=Depends(connection)):
        return result(rpc(conn, user, "public.leave_team(%s)", (team_id,)))

    @app.post("/teams/{team_id}/coach-code/redeem", tags=["帳號"])
    def redeem(team_id: uuid.UUID, body: CodeBody, user: str = Depends(current_user), conn=Depends(connection)):
        """輸入管理員碼，把自己在這一隊的身分升級成球隊管理員。輸錯 5 次封鎖，要球隊管理員解除。"""
        return result(rpc(conn, user, "public.redeem_coach_code(%s, %s)", (team_id, body.code)))

    # ---------- 認領名單上的自己 ----------
    @app.get("/teams/{team_id}/claimable", tags=["認領"])
    def claimable(team_id: uuid.UUID, user: str = Depends(current_user), conn=Depends(connection)):
        """名單上還沒有連到帳號的球員。"""
        with db.as_user(conn, user):
            rows = conn.execute(
                """select p.id, p.name, p.nickname from public.players p
                   where p.team_id = %s
                     and not exists (select 1 from public.memberships m where m.player_id = p.id)
                   order by p.name""", (team_id,)).fetchall()
        return [_ids(r) for r in rows]

    @app.post("/teams/{team_id}/claim", tags=["認領"])
    def claim(team_id: uuid.UUID, body: ClaimBody, user: str = Depends(current_user), conn=Depends(connection)):
        """選名單上的自己（player_id），或申請新增名字（new_name），二選一；球隊管理員確認才生效。"""
        return result(rpc(conn, user, "public.request_claim(%s, %s, %s)", (team_id, body.player_id, body.new_name)))

    # ---------- 球隊管理員 ----------
    @app.get("/teams/{team_id}/members", tags=["球隊管理員"])
    def members(team_id: uuid.UUID, user: str = Depends(current_user), conn=Depends(connection)):
        """成員名單。球隊管理員另外看得到誰被管理員碼封鎖。"""
        with db.as_user(conn, user):
            rows = conn.execute(
                """select m.user_id, pr.display_name, m.role, m.joined_at, m.player_id, p.name as player_name,
                          m.claim_player_id, cp.name as claim_player_name, m.claim_new_name, m.claim_at,
                          g.failures as coach_code_failures, g.banned_at as coach_code_banned_at
                   from public.memberships m
                   left join public.profiles pr on pr.user_id = m.user_id
                   left join public.players p on p.id = m.player_id
                   left join public.players cp on cp.id = m.claim_player_id
                   left join public.coach_code_guard g on g.team_id = m.team_id and g.user_id = m.user_id
                   where m.team_id = %s order by m.role, m.joined_at""", (team_id,)).fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail={"status": "not_found", "message": "找不到這個隊伍"})
        return [_ids(r) for r in rows]

    @app.get("/teams/{team_id}/coach-codes", tags=["球隊管理員"])
    def coach_codes(team_id: uuid.UUID, user: str = Depends(current_user), conn=Depends(connection)):
        """這一隊的管理員碼清單（看不到原文，只有最後 2 碼）。"""
        with db.as_user(conn, user):
            rows = conn.execute(
                """select id, hint, created_at, expires_at, revoked_at, uses, last_used_at,
                          revoked_at is null and expires_at > now() as active
                   from public.coach_codes where team_id = %s order by created_at desc""", (team_id,)).fetchall()
        return [_ids(r) for r in rows]

    @app.post("/teams/{team_id}/coach-codes", tags=["球隊管理員"])
    def new_coach_code(team_id: uuid.UUID, body: CoachCodeBody | None = None, user: str = Depends(current_user),
                       conn=Depends(connection)):
        """產生管理員碼。原文只會在這裡出現一次，請馬上傳給要當球隊管理員的人。"""
        days = (body or CoachCodeBody()).valid_days
        return result(rpc(conn, user, "public.create_coach_code(%s, %s)", (team_id, days)))

    @app.delete("/coach-codes/{code_id}", tags=["球隊管理員"])
    def revoke_coach_code(code_id: uuid.UUID, user: str = Depends(current_user), conn=Depends(connection)):
        return result(rpc(conn, user, "public.revoke_coach_code(%s)", (code_id,)))

    @app.post("/teams/{team_id}/code/reset", tags=["球隊管理員"])
    def reset_code(team_id: uuid.UUID, user: str = Depends(current_user), conn=Depends(connection)):
        """重設 Team ID：舊的立刻不能再加入，已經加入的人不受影響。"""
        return result(rpc(conn, user, "public.reset_team_code(%s)", (team_id,)))

    @app.post("/teams/{team_id}/members/{member_id}/unban", tags=["球隊管理員"])
    def unban(team_id: uuid.UUID, member_id: uuid.UUID, user: str = Depends(current_user), conn=Depends(connection)):
        return result(rpc(conn, user, "public.unban_coach_code(%s, %s)", (team_id, member_id)))

    @app.delete("/teams/{team_id}/members/{member_id}", tags=["球隊管理員"])
    def remove(team_id: uuid.UUID, member_id: uuid.UUID, user: str = Depends(current_user), conn=Depends(connection)):
        """把球員移出球隊（球隊管理員要由網站管理員處理）。"""
        return result(rpc(conn, user, "public.remove_member(%s, %s)", (team_id, member_id)))

    @app.post("/teams/{team_id}/members/{member_id}/claim", tags=["球隊管理員"])
    def decide(team_id: uuid.UUID, member_id: uuid.UUID, body: DecideBody, user: str = Depends(current_user),
               conn=Depends(connection)):
        """確認（approve=true）或拒絕認領申請。"""
        return result(rpc(conn, user, "public.decide_claim(%s, %s, %s)", (team_id, member_id, body.approve)))

    # ---------- 網站管理員 ----------
    @app.post("/admin/teams", tags=["網站管理員"])
    def admin_create_team(body: TeamBody, user: str = Depends(current_user), conn=Depends(connection)):
        """建立隊伍，回傳 Team ID 和第一組管理員碼（7 天有效）。"""
        return result(rpc(conn, user, "public.admin_create_team(%s, %s, %s)",
                          (body.name, body.season, body.league_name)))

    @app.post("/admin/teams/{team_id}/members/{member_id}/demote", tags=["網站管理員"])
    def admin_demote(team_id: uuid.UUID, member_id: uuid.UUID, user: str = Depends(current_user),
                     conn=Depends(connection)):
        """取消某人在這一隊的球隊管理員身分。"""
        return result(rpc(conn, user, "public.demote_coach(%s, %s)", (team_id, member_id)))


def _ids(row: dict) -> dict:
    """uuid 轉成字串，其他照舊（FastAPI 會處理日期）。"""
    return {k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in row.items()}
