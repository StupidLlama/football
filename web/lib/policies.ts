// 隱私權政策、服務條款的版本與營運者資訊。
// 政策內容改了（不是改錯字）就把 POLICY_VERSION 換成改版當天的日期：大家下次登入會被要求重新同意。
// 聯絡 Email 用環境變數設定（Vercel → Settings → Environment Variables）；營運者在政策裡只寫「網站管理員」。

export const POLICY_VERSION = "2026-10-05";

export const OPERATOR_NAME = "Football Analysis Potato 網站管理員";
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
export const DATA_REGION = "日本東京（Supabase，Northeast Asia）";

/** 這個人同意的是不是目前的版本。 */
export function needsConsent(version: string | null | undefined): boolean {
  return version !== POLICY_VERSION;
}
