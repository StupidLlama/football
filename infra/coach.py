"""「這個人是不是教練」的檢查（Tools shell）。

v1：secrets 裡的 coach_password，輸入對了就記在這次連線（session）裡。
v2 換成帳號登入時，只要再寫一個有 is_coach() 的類別，頁面不用改。
"""
import hmac
from collections.abc import MutableMapping
from typing import Protocol

SESSION_KEY = "is_coach"


class CoachGate(Protocol):
    enabled: bool               # 這個網站有沒有開教練功能

    def is_coach(self) -> bool: ...

    def login(self, password: str) -> bool: ...

    def logout(self) -> None: ...


class PasswordCoachGate:
    def __init__(self, password: str | None, session: MutableMapping):
        self.password = (password or "").strip()
        self.session = session
        self.enabled = bool(self.password)

    def is_coach(self) -> bool:
        return self.enabled and bool(self.session.get(SESSION_KEY))

    def login(self, password: str) -> bool:
        ok = self.enabled and hmac.compare_digest(password.strip().encode(), self.password.encode())
        self.session[SESSION_KEY] = ok
        return ok

    def logout(self) -> None:
        self.session[SESSION_KEY] = False


def coach_gate(secrets, session: MutableMapping) -> CoachGate:
    try:
        pw = secrets["coach_password"]
    except Exception:
        pw = None
    return PasswordCoachGate(pw, session)
