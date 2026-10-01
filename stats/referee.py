"""裁判抽人（Inner shell）。

抽人的「規則」做成可以替換的物件：
- FairRandomPicker：當過最少次的人優先，次數一樣才隨機（v1.4）
- 之後要加「排除請假的人」「優先抽沒上場的人」，只要傳一個 eligible 函式，
  或寫一個新的 Picker（有 pick_one / pick_all 就好），頁面不用改。
"""
import random
from collections import Counter
from collections.abc import Callable, Iterable
from typing import Protocol

from domain.fixture import Duty

Assignments = dict[str, str]          # duty.key → 負責人
Eligible = Callable[[Duty, str], bool]


class Picker(Protocol):
    def pick_one(self, duty: Duty, pool: list[str], current: Assignments) -> str | None: ...

    def pick_all(self, duties: Iterable[Duty], pool: list[str], current: Assignments,
                 only_empty: bool = False) -> Assignments: ...


def counts(assignments: Assignments, pool: list[str], skip: str | None = None) -> Counter:
    """每個人目前被排了幾次（skip = 不算這一場，重抽時用）。"""
    c = Counter({name: 0 for name in pool})
    for key, name in assignments.items():
        if key != skip and name in c:
            c[name] += 1
    return c


class FairRandomPicker:
    def __init__(self, rng: random.Random | None = None, eligible: Eligible | None = None):
        self.rng = rng or random.Random()
        self.eligible = eligible or (lambda duty, name: True)

    def pick_one(self, duty: Duty, pool: list[str], current: Assignments) -> str | None:
        candidates = [n for n in pool if self.eligible(duty, n)]
        if not candidates:
            return None
        c = counts(current, candidates, skip=duty.key)
        # 同一天已經被排到的人先避開（有其他人可以選的話）
        same_day = {current[k] for k in current if k != duty.key and k.startswith(duty.fixture.day.isoformat())}
        fresh = [n for n in candidates if n not in same_day] or candidates
        low = min(c[n] for n in fresh)
        return self.rng.choice(sorted(n for n in fresh if c[n] == low))

    def pick_all(self, duties: Iterable[Duty], pool: list[str], current: Assignments,
                 only_empty: bool = False) -> Assignments:
        """全部重抽（only_empty = 只補還沒有人的場次）。"""
        duties = list(duties)
        keys = {d.key for d in duties}
        out = {k: v for k, v in current.items() if only_empty or k not in keys}
        for d in duties:
            if only_empty and out.get(d.key):
                continue
            who = self.pick_one(d, pool, out)
            if who:
                out[d.key] = who
        return out
