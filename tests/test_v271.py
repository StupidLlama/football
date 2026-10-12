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
        assert "useLeave(dirty, onCancel)" in src and "useDirty(" in src, f
        assert 'leave("top")' in src and 'leave("bottom")' in src, f"{f} 的返回和取消都要先確認"
        assert "onClick={onCancel}" not in src, f"{f} 還有直接離開的按鈕"


def test_back_button_falls_back_when_no_history():
    src = _web("components/back-button.tsx")
    assert "window.history.length > 1" in src and "router.push(fallback)" in src
    assert "放棄修改" in src and "繼續編輯" in src


def test_lineup_explains_why_size_is_locked():
    """iPad 沒有滑鼠，不能只靠 title 提示：停用時畫面上要有文字。"""
    src = _web("app/t/[teamId]/lineup/page.tsx")
    assert "賽制跟著這場比賽" in src and "不綁定" in src


def test_updates_page_and_notice_wired():
    """更新紀錄：頁面、頁尾和側邊欄入口、大更新視窗只在球隊頁外框出現一次。"""
    assert "UPDATES.map" in _web("app/updates/page.tsx") and "MarkUpdatesSeen" in _web("app/updates/page.tsx")
    assert 'href="/updates"' in _web("components/ui.tsx")
    shell = _web("components/shell.tsx")
    assert 'href="/updates"' in shell and shell.count("<UpdatePopup />") == 1
    notice = _web("components/updates.tsx")
    assert "showModal" in notice and "try {" in notice  # localStorage 讀不到也不能壞掉


def test_latest_update_matches_claude_md_rule():
    """每版上線要在 lib/updates.ts 最上面加一段（CLAUDE.md 有寫）。"""
    root = WEB.parent
    assert "lib/updates.ts" in (root / "CLAUDE.md").read_text(encoding="utf-8")
    assert '"v2.7.1"' in _web("lib/updates.ts").split("export const UPDATES")[1][:200]
