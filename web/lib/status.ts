// 資料庫函式回傳的 status → 給使用者看的中文訊息。
// 跟 backend/accounts.py 的 STATUS 同一份對照（tests/test_v22.py 會檢查兩邊一致、每種 status 都有訊息）。

export const STATUS: Record<string, string> = {
  ok: "完成",
  joined: "已加入球隊",
  already_member: "你已經在這一隊了",
  already_coach: "你在這一隊已經是教練",
  unauthenticated: "請先登入",
  wrong_code: "教練碼不對、已過期或已作廢",
  invalid: "輸入的資料不正確",
  forbidden: "你沒有權限做這件事",
  banned: "教練碼輸錯太多次，已被封鎖；請找這一隊的教練解除",
  not_found: "找不到",
  not_member: "找不到這個隊伍",
  taken: "這位球員已經被其他帳號認領，或這個名字已經在名單上",
  already_linked: "你已經連到名單上的球員了",
  not_linked: "你還沒連到名單上的球員；請先認領自己，教練確認後才能填能力表",
  last_coach: "你是這一隊最後一位教練，不能離隊；請先找系統管理者",
  locked: "Team ID 輸錯太多次，請 15 分鐘後再試",
  too_fast: "剛剛已經送出了，請過幾秒再試",
};

/** 成功的 status（其他都算失敗，要顯示訊息）。 */
export const SUCCESS = new Set(["ok", "joined", "already_member", "already_coach"]);

export type RpcResult = { status: string; detail?: string; [k: string]: unknown };

/** 把函式結果翻成一句話。detail（資料庫給的補充說明）優先。 */
export function message(r: RpcResult, notFound?: string): string {
  if (r.detail) return String(r.detail);
  if (r.status === "not_found" && typeof r.attempts_left === "number") {
    return `找不到這個 Team ID（再錯 ${r.attempts_left} 次會鎖 15 分鐘）`;
  }
  if (r.status === "not_found" && notFound) return notFound;
  if (r.status === "wrong_code" && typeof r.attempts_left === "number") {
    return `${STATUS.wrong_code}（再錯 ${r.attempts_left} 次會被封鎖）`;
  }
  return STATUS[r.status] ?? "發生錯誤，請稍後再試";
}
