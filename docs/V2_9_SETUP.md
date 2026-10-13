# v2.9 上線步驟（照順序做）

v2.9 = **意見回饋（SPEC F10）＋ 加到日曆 ＋ 全隊上線 ＋ 舊網站退役**：

- 每一頁右下角多了「**回饋**」按鈕（登入後才有）：選類型、寫內容，自動附上頁面、網站版本、裝置。正在打字時按鈕會藏起來，不會擋住聊天室的送出鍵。
- 「聯絡我們」升級成意見回饋（同一張表、同一個 Discord Webhook）。
- 新頁面 **`/feedback`**：所有人看「我的回饋」（狀態、網站管理員的回覆）；網站管理員多一個「**回饋管理**」分頁，可以篩選狀態、改狀態（新的 → 處理中 → 已解決）、回覆。側邊欄「意見回饋」有新回覆時會亮數字。
- 練習卡片、比賽詳情多了「**📅 加到日曆**」，練習頁上方有「**整季加到日曆**」（下載 `.ics`，手機點開就能加到行事曆）。提醒通知等之後接 LINE 機器人再做。
- 舊的 Streamlit 網站只顯示「搬家了」公告和新網站連結（程式碼留在 repo）。
- 隱私權政策補一段「回饋會記錄網站版本和粗略的裝置種類」；**不升 `POLICY_VERSION`**（2026-10-13 那次大家才剛同意過）。

## 0. 順序很重要：先跑資料庫，再開網站

v2.9 的網站會讀 `contact_messages` 的新欄位（`version`、`device`、`reply`…）。**沒執行 `0013` 就打開 v2.9 的網站，「我的回饋」「回饋管理」會讀取失敗。**（舊網站送回饋不受影響：`send_contact_message` 的新參數有預設值。）

## 1. 資料庫

- [ ] Supabase → SQL Editor → 貼上 `supabase/migrations/0013_feedback.sql` → Run
- [ ] 再貼 `supabase/tests/rls_test.sql` → Run，最後要出現 `RLS OK`

`0013` 改了：

| 東西 | 做什麼 |
|---|---|
| `contact_messages` 新欄位 | `version`（網站版本）、`device`（例如「手機 · Safari」）、`reply`、`replied_at`、`reply_read_at` |
| 狀態 | `new / done` → `new / doing / done`（新的 → 處理中 → 已解決） |
| `send_contact_message`（更新） | 多收 `version`、`device`（有預設值，舊的三個參數照樣能用） |
| `set_feedback_status`、`reply_feedback` | 改狀態、回覆（**只有網站管理員**） |
| `mark_feedback_read` | 本人把自己收到的回覆標成看過（側邊欄的數字就消失） |
| 權限 | 收回「直接 update 這張表」的權限，改狀態一律走函式 |
| `export_my_data`（更新） | 下載資料多了回饋的狀態、回覆、頁面、版本、裝置 |

## 2. 本機測試

```powershell
cd "$env:USERPROFILE\Desktop\軟工\football-team-site"
git fetch origin
git switch v2.9
git pull origin v2.9
py -m pytest
cd "$env:USERPROFILE\Desktop\軟工\football-team-site\web"
npm.cmd test
npm.cmd run typecheck
```

助手的沙盒結果：`node --test` 125 項全過；`pytest` 155 passed、3 skipped（6 個 collection error 是沙盒沒有 pandas）；PostgreSQL 跑 0001–0013 + `rls_test.sql` → `RLS OK`。

## 3. 瀏覽器驗收（localhost:3000，只用「測試隊」）

```powershell
cd "$env:USERPROFILE\Desktop\軟工\football-team-site\web"
npm.cmd run dev
```

**意見回饋**
- [ ] 任何一頁右下角有「✎ 回饋」；點下去跳出視窗，看得到「會一起送出：頁面、版本 v2.9、裝置」
- [ ] 送出後 **1 分鐘內 Discord 收到通知**（有類型、Email、頁面、版本、裝置、回饋管理連結）← SPEC 完成標準
- [ ] 聊天室：點輸入框打字時，回饋按鈕會消失；離開輸入框又出現
- [ ] 手機寬（360／390）：按鈕不擋住頁面最下面的東西（內容下方有留空間）
- [ ] `/feedback`「回饋管理」：改狀態、「回覆並標成已解決」
- [ ] 用 `evan` 帳號：側邊欄「意見回饋」出現數字 → 打開「我的回饋」看到回覆（標「新的」）→ 數字消失
- [ ] `evan` 看不到「回饋管理」分頁；網址打 `/feedback?tab=admin` 也只看到自己的
- [ ] 設定頁原本的「聯絡訊息」列表換成「意見回饋」連結

**加到日曆**
- [ ] 練習卡片「📅 加到日曆」→ 下載 `.ics` → 打開，時間、地點對
- [ ] 練習頁「整季加到日曆」→ 只有還沒結束的練習和比賽
- [ ] 比賽詳情「📅 加到日曆」→ 比賽 2 小時、描述有球衣顏色和賽制
- [ ] iPhone／iPad Safari：點下去會問要不要加到行事曆

## 4. 合併到 main、確認正式網站

1. 上面都通過 → 告訴助手「測試全部通過」→ 助手合併到 main（Vercel 和 Streamlit 會自動重新部署）
2. 正式網站 https://football-analysis-potato.vercel.app ：右下角有回饋按鈕、送一則測試回饋到 Discord
3. 舊網站 https://football-analysis-potato.streamlit.app ：只剩「搬家了」公告和「前往新網站」按鈕
4. GitHub 打標籤 `v2.9`（Target 選 `main`，助手會給 Release title 和 Description）

## 5. 舊網站退役（你自己做）

- [ ] **確認 v1 資料都在新網站**：Supabase SQL Editor 執行下面這段，看「資訊系足」每位球員都有至少一份能力表（`ratings` 不是 0）
  ```sql
  select p.name, count(r.*) as ratings,
         count(r.*) filter (where r.source in ('google_form', 'import')) as from_v1
    from public.players p
    join public.teams t on t.id = p.team_id
    left join public.ability_ratings r on r.player_id = p.id
   where t.name = '資訊系足' and t.archived_at is null
   group by p.name order by ratings, p.name;
  ```
  （這段只讀資料，不會改任何東西。）
- [ ] **Google 表單停止收回覆**：打開表單 → 「回覆」分頁 → 關掉「接受回應」→ 「不接受回應時顯示的訊息」貼：
  ```
  能力表已經搬到新網站了：https://football-analysis-potato.vercel.app 用 Google 登入 → 輸入 Team ID → 填能力表
  ```
- [ ] Google 試算表留著（之後課程或匯入可能還要用），不用刪。
- [ ] 想在本機看舊網站（課堂 Demo）：`config/settings.toml` 的 `[site] moved_to` 改成 `""`，**不要 commit**，再跑 `py -m streamlit run app.py`。

## 6. 全隊上線：貼到隊上群組的訊息

先在「管理專區」確認目前的 **Team ID**，替換下面的 `XXXX-XXXX` 再貼：

```
⚽ 球隊網站搬家了！以後能力表、出席、組隊、聊天室都在這裡：
https://football-analysis-potato.vercel.app

第一次用（大概 3 分鐘）：
1. 用 Google 帳號登入
2. 看完隱私權政策、按同意
3. 輸入 Team ID：XXXX-XXXX
4. 在名單上找到自己的名字（球隊管理員確認後就連上了）
5. 填能力表

比賽、練習記得按「出席／請假」，取代群組接龍。
練習頁可以「整季加到日曆」。
網站哪裡怪怪的，按每一頁右下角的「回饋」告訴我 🙏
```

上線後幾天：
- [ ] 管理專區看誰還沒認領、誰還沒填能力表（可以一鍵在聊天室提醒）
- [ ] 「回饋管理」看有沒有新的回饋
- [ ] 關卡（SPEC v2.9）：**隊友日常都用新網站**

## 7. 收尾（助手做）

- `web/lib/updates.ts`（v2.9，`big: true`）、`docs/SPEC.md`、`CLAUDE.md` 已更新
- 上線、打好標籤後寫 `docs/HANDOFF.md`（v2.9 → v2.10）
