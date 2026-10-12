"""v2.7.1 返回鍵：子頁都有 BackButton、同頁展開的編輯面板都有 PanelBack（有改動要二次確認）。"""
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"


def _web(rel: str) -> str:
    return (WEB / rel).read_text(encoding="utf-8")


def test_sub_pages_have_back_button():
    for rel in ("app/t/[teamId]/matches/[matchId]/page.tsx", "app/t/[teamId]/players/[playerId]/page.tsx"):
        src = _web(rel)
        assert 'import { BackButton } from "@/components/back-button"' in src and "<BackButton" in src, rel
    assert "cameFrom" in _web("app/t/[teamId]/lineup/page.tsx") and "<BackButton" in _web("app/t/[teamId]/lineup/page.tsx")


def test_edit_panels_have_panel_back_with_dirty_check():
    for f in ("match-form", "practice-form", "practice-series", "practice-import-panel"):
        src = _web(f"components/{f}.tsx")
        assert "<PanelBack onBack={onCancel} dirty={dirty}" in src and "useDirty(" in src, f


def test_back_button_falls_back_when_no_history():
    src = _web("components/back-button.tsx")
    assert "window.history.length > 1" in src and "router.push(fallback)" in src
    assert "放棄修改？" in src


def test_lineup_explains_why_size_is_locked():
    """iPad 沒有滑鼠，不能只靠 title 提示：停用時畫面上要有文字。"""
    src = _web("app/t/[teamId]/lineup/page.tsx")
    assert "賽制跟著這場比賽" in src and "不綁定" in src
