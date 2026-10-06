"""v1.2：陣型、表現評分規則、指派演算法、自動排人、排行榜。"""
import itertools
import random

import pytest

from infra import config
from stats.assignment import max_assignment
from stats.lineup import (assign, auto_lineup, candidates, manual_lineup, option,
                         picks_of)
from stats.ranking import AVERAGE, category_ranks, leaderboard, metric_label, metric_value, metrics

R = config.rules()
FORMATIONS = config.formations()


def player(name, good="", bad="", **scores):
    p = {k: 3 for k in R.ability_keys}
    p.update(name=name, nickname=name, good_positions=good, bad_positions=bad, message="")
    p.update(scores)
    return p


def squad(n):
    """n 位能力各不相同的假球員（固定亂數，結果可重現）。"""
    rnd = random.Random(7)
    return [player(f"P{i:02d}", **{k: rnd.randint(1, 5) for k in R.ability_keys}) for i in range(n)]


def formation(name, size=11):
    return next(f for f in FORMATIONS if f.name == name and f.size == size)


# ---------- Core ----------
def test_all_formations_are_valid():
    assert {f.size for f in FORMATIONS} == {11, 8}
    assert {f.name for f in FORMATIONS if f.size == 11} >= {"4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "3-4-3", "5-3-2"}
    assert {f.name for f in FORMATIONS if f.size == 8} >= {"3-3-1", "3-2-2", "2-3-2", "2-4-1"}
    for f in FORMATIONS:
        assert f.validate(R.positions) == [], f.label


def test_formation_validate_catches_problems():
    from dataclasses import replace
    f = formation("4-3-3")
    broken = replace(f, slots=(replace(f.slots[0], code="LB", role="XX"),) + f.slots[1:])  # 門將改成重複的 LB
    problems = " ".join(broken.validate(R.positions))
    assert "重複" in problems and "門將" in problems and "XX" in problems


def test_performance_rules():
    perf = config.performance()
    assert perf.validate(R.positions) == []
    full = {d.key: 80 for d in perf.dimensions}
    assert all(perf.total(role, full) == 80 for role in R.positions)   # 權重加總 1
    assert perf.total("GK", {"goalkeeping": 100}) == 70
    assert perf.total("CB", {"defending": 100}) > perf.total("ST", {"defending": 100})  # 依位置主要任務


# ---------- Inner shell：指派演算法 ----------
@pytest.mark.parametrize("seed", range(40))
def test_max_assignment_matches_brute_force(seed):
    rnd = random.Random(seed)
    n, m = rnd.randint(1, 5), rnd.randint(1, 6)
    s = [[rnd.randint(0, 20) for _ in range(m)] for _ in range(n)]
    got = max_assignment(s)
    used = [j for j in got if j >= 0]
    assert len(used) == len(set(used)) == min(n, m)
    if n <= m:
        best = max(sum(s[i][p[i]] for i in range(n)) for p in itertools.permutations(range(m), n))
    else:
        best = max(sum(s[p[j]][j] for j in range(m)) for p in itertools.permutations(range(n), m))
    assert sum(s[i][j] for i, j in enumerate(got) if j >= 0) == best


def test_max_assignment_empty():
    assert max_assignment([]) == [] and max_assignment([[], []]) == [-1, -1]


# ---------- Inner shell：自動排人 ----------
def test_option_bonus_and_penalty():
    gk = formation("4-3-3").slot("GK")
    base = option(player("A"), gk, R)
    assert option(player("A", good="GK"), gk, R).score == base.score + R.good_bonus
    assert option(player("A", bad="GK"), gk, R).score == base.score - R.bad_penalty


def test_auto_lineup_fills_every_slot_once_and_benches_everyone_else():
    team = squad(17)
    lu = auto_lineup(team, formation("4-3-3"), R)
    assert [o.slot for o in lu.starters] == [s.code for s in formation("4-3-3").slots]
    starters = [o.name for o in lu.starters]
    assert len(set(starters)) == 11 and not lu.empty
    assert sorted(starters + [o.name for o in lu.bench]) == sorted(p["name"] for p in team)  # 替補不限人數
    assert [o.score for o in lu.bench] == sorted((o.score for o in lu.bench), reverse=True)


def test_auto_lineup_is_best_total_and_repeatable():
    team = squad(9)
    f = formation("3-3-1", 8)
    lu = auto_lineup(team, f, R)
    assert auto_lineup(list(reversed(team)), f, R).starters == lu.starters      # 同樣的人，結果一樣
    greedy = 0
    used = set()
    for s in f.slots:   # 一個位置一個位置挑最強的，總分不會比較高
        best = next(o for o in candidates(team, s, R) if o.name not in used)
        used.add(best.name)
        greedy += best.score
    assert lu.total >= round(greedy, 1)


def test_auto_lineup_prefers_self_rated_position():
    a = player("A", good="ST")
    b = player("B", good="GK")
    lu = auto_lineup([a, b], formation("3-3-1", 8), R)
    picks = {o.name: o.slot for o in lu.starters}
    assert picks["B"] == "GK" and picks["A"] == "ST"


def test_auto_lineup_locked_and_short_squad():
    team = squad(6)
    f = formation("3-3-1", 8)
    lu = auto_lineup(team, f, R, locked={"ST": "P03"})
    picks = {o.slot: o.name for o in lu.starters}
    assert picks["ST"] == "P03" and "GK" in picks           # 人不夠時門將一定有人
    assert len(lu.starters) == 6 and len(lu.empty) == 2 and lu.bench == []
    with pytest.raises(ValueError):
        auto_lineup(team, f, R, locked={"ST": "沒有這個人"})
    with pytest.raises(ValueError):
        auto_lineup(team, f, R, locked={"ST": "P01", "GK": "P01"})


def test_candidates_list_everyone():
    team = squad(12)
    c = candidates(team, formation("4-4-2").slot("LST"), R)
    assert len(c) == 12 and [o.score for o in c] == sorted((o.score for o in c), reverse=True)


# ---------- Inner shell：排行榜 ----------
def test_metrics_cover_average_categories_and_abilities():
    m = metrics(R)
    assert m[0] == AVERAGE and len(m) == 1 + len(R.categories) + len(R.abilities)
    assert metric_label(AVERAGE, R) == "平均能力"
    assert "（" in metric_label("passing", R)


def test_leaderboard_ties_share_rank():
    team = [player("A", speed=5), player("B", speed=5), player("C", speed=1)]
    board = leaderboard(team, "speed", R)
    assert [(e.name, e.rank) for e in board] == [("A", 1), ("B", 1), ("C", 3)]
    assert metric_value(team[0], "身體", R) > metric_value(team[2], "身體", R)
    with pytest.raises(KeyError):
        metric_value(team[0], "nope", R)


def test_category_ranks():
    team = [player("A", speed=5, stamina=5), player("B")]
    ranks = category_ranks(team[0], team, R)
    assert ranks["身體"] == 1 and set(ranks) == {c.name for c in R.categories}


# ---------- v1.3：手動調整 ----------
def test_assign_swaps_and_empties():
    picks = {"GK": "A", "CB": "B", "ST": None}
    new, swapped = assign(picks, "CB", "A")             # A 原本在 GK → 和 CB 的 B 互換
    assert new == {"GK": "B", "CB": "A", "ST": None} and swapped == "GK"
    assert picks == {"GK": "A", "CB": "B", "ST": None}  # 不改原本的 dict
    new, swapped = assign(new, "ST", "C")               # 從替補放上來
    assert new["ST"] == "C" and swapped is None
    new, _ = assign(new, "GK", None)                    # 清空位置
    assert new["GK"] is None
    new, swapped = assign({"GK": "A", "ST": None}, "ST", "A")   # 換到空位置：原位置變空
    assert new == {"GK": None, "ST": "A"} and swapped == "GK"
    with pytest.raises(KeyError):
        assign(picks, "XX", "A")


def test_manual_lineup_matches_auto_and_tracks_bench():
    team = squad(14)
    f = formation("4-4-2")
    auto = auto_lineup(team, f, R)
    same = manual_lineup(team, f, R, picks_of(auto))
    assert same.starters == auto.starters and same.bench == auto.bench
    picks, _ = assign(picks_of(auto), "LST", auto.bench[0].name)     # 替補第一人換上 LST
    changed = manual_lineup(team, f, R, picks)
    assert {o.name for o in changed.starters} != {o.name for o in auto.starters}
    assert len(changed.bench) == len(auto.bench)
    picks["GK"] = None
    emptied = manual_lineup(team, f, R, picks)
    assert [s.code for s in emptied.empty] == ["GK"] and len(emptied.bench) == len(auto.bench) + 1
    with pytest.raises(ValueError):
        manual_lineup(team, f, R, {**picks, "GK": picks["LB"]})
    with pytest.raises(ValueError):
        manual_lineup(team, f, R, {**picks, "GK": "沒有這個人"})
