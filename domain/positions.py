"""位置相關的基本規則。"""


def split_positions(text) -> list[str]:
    """「CB，CDM, ST」→ ["CB", "CDM", "ST"]（全形逗號也可以）。list 也可以直接傳進來。"""
    if text is None:
        return []
    if isinstance(text, (list, tuple)):
        return [str(x).strip() for x in text if str(x).strip()]
    return [x.strip() for x in str(text).replace("，", ",").split(",") if x.strip()]


def same_position(a: str, b: str) -> bool:
    """「LB」算在「LB/RB」裡，反過來也算（跟網站 web/lib/rating.ts 的 samePosition 一樣）。"""
    if a == b:
        return True
    pa, pb = a.split("/"), b.split("/")
    return any(x in pb for x in pa)


def has_position(positions, role: str) -> bool:
    """自評的位置清單裡有沒有 role（用 same_position 比對）。"""
    return any(same_position(p, role) for p in split_positions(positions))
