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
        assert "<PanelBack onBack={leave}" in src and ">取消</button>" in src and "onClick={leave}" in src, f"{f} 的返回和取消都要先確認"
        assert "{dialog}" in src, f
        assert "onClick={onCancel}" not in src, f"{f} 還有直接離開的按鈕"


def test_back_button_falls_back_when_no_history():
    src = _web("components/back-button.tsx")
    assert "window.history.length > 1" in src and "router.push(fallback)" in src
    assert "放棄修改" in src and "繼續編輯" in src and "showModal" in src


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


def test_doc_pages_have_back_button():
    """更新紀錄、隱私權政策、服務條款共用 DocPage：上面都有返回鍵。"""
    doc = _web("components/doc.tsx")
    assert "<BackButton" in doc
    for rel in ("app/updates/page.tsx", "app/privacy/page.tsx", "app/terms/page.tsx"):
        assert "DocPage" in _web(rel), rel


def test_every_editable_page_has_leave_guard():
    """所有能輸入東西的頁面：有沒儲存的修改時，離開（點連結、重新整理）要先確認。"""
    for rel in ("app/t/[teamId]/page.tsx", "app/t/[teamId]/coach/page.tsx", "app/t/[teamId]/lineup/page.tsx",
                "app/settings/page.tsx", "app/contact/page.tsx", "components/chat-composer.tsx", "components/chat-message.tsx"):
        assert "useLeaveGuard(" in _web(rel), rel
    src = _web("components/back-button.tsx")
    assert "beforeunload" in src and 'addEventListener("click"' in src and "stopImmediatePropagation" in src
    assert "useGuardedAction" in _web("app/t/[teamId]/lineup/page.tsx")
    # 管理專區的新增／編輯球員、聊天室編輯與發文的取消鍵，也要先確認
    assert "<PanelBack onBack={leave}" in _web("app/t/[teamId]/coach/page.tsx")
    assert "onClick={leave}" in _web("components/chat-message.tsx") and "onClick={leave}" in _web("components/chat-composer.tsx")
