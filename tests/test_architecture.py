"""檢查四層架構的依賴規則：內層不能 import 外層。

    domain   (Core)          → 只能用標準函式庫、domain
    stats    (Inner shell)   → 再加上 stats
    adapters (Translate)     → 再加上 adapters、pandas
    infra    (Tools shell)   → 什麼都可以
"""
import ast
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
STDLIB = set(sys.stdlib_module_names)
ALLOWED = {
    "domain": {"domain"},
    "stats": {"domain", "stats"},
    "adapters": {"domain", "stats", "adapters", "pandas"},
}


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    mods = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            mods.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            mods.add(node.module.split(".")[0])
    return mods


@pytest.mark.parametrize("layer", list(ALLOWED))
def test_layer_only_imports_inner_layers(layer):
    bad = {}
    for f in (ROOT / layer).rglob("*.py"):
        extra = imported_modules(f) - STDLIB - ALLOWED[layer]
        if extra:
            bad[str(f.relative_to(ROOT))] = sorted(extra)
    assert not bad, f"{layer} 層 import 了外層的東西：{bad}"
