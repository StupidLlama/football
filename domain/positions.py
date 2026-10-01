"""位置相關的基本規則。"""


def split_positions(text) -> list[str]:
    """「CB，CDM, ST」→ ["CB", "CDM", "ST"]（全形逗號也可以）。"""
    if text is None:
        return []
    return [x.strip() for x in str(text).replace("，", ",").split(",") if x.strip()]
