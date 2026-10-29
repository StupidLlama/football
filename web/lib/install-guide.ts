// v2.11.2：教使用者把網站加到手機主畫面（變成像 App 一樣的圖示，打開沒有網址列）。純資料和計算，不 import React。

export type Platform = "ios" | "android";
/** ios-safari / android：照步驟就能加；ios-other：iOS 的 Chrome 等；inapp：LINE、IG 等內建瀏覽器（要先換瀏覽器）；desktop：電腦。 */
export type InstallKind = "ios-safari" | "ios-other" | "android" | "inapp" | "desktop";

const INAPP = /Line\/|Instagram|FBAN|FBAV|MicroMessenger|; wv\)/i;

export function installKind(ua: string, touchPoints = 0): InstallKind {
  const s = ua || "";
  const ios = /iPhone|iPad|iPod/.test(s) || (/Macintosh/.test(s) && touchPoints > 1);
  const android = /Android/i.test(s);
  if (!ios && !android) return "desktop";
  if (INAPP.test(s)) return "inapp";
  if (android) return "android";
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(s) || !/Safari/.test(s) ? "ios-other" : "ios-safari";
}

/** 視窗一打開先顯示哪一種手機的步驟（電腦預設 iPhone）。 */
export function platformOf(kind: InstallKind, ua = ""): Platform {
  if (kind === "android") return "android";
  if (kind === "inapp") return /Android/i.test(ua) ? "android" : "ios";
  return "ios";
}

export const STEPS: Record<Platform, string[]> = {
  ios: [
    "用 Safari 打開這個網站（登入後的哪一頁都可以）。",
    "點畫面下方的「分享」按鈕（方框加向上的箭頭）。iOS 26 的分享按鈕收在右下角的「⋯」裡面。",
    "往下滑，點「加入主畫面」。",
    "確認「以網頁 App 打開」是打開的，再按右上角的「加入」。",
  ],
  android: [
    "用 Chrome 打開這個網站。",
    "點右上角的「⋮」。",
    "點「加到主畫面」或「安裝應用程式」，再按「安裝」。",
    "回到主畫面，就會看到馬鈴薯足球的圖示。",
  ],
};

/** 加好之後要知道的事。 */
export const AFTER: Record<Platform, string> = {
  ios: "第一次從主畫面打開時要再登入一次（iPhone 的主畫面 App 不會沿用 Safari 的登入）。",
  android: "從主畫面打開會直接是登入的狀態，跟在 Chrome 裡一樣。",
};

/** 依照現在的瀏覽器多提醒一句；沒有要提醒的回傳 null。 */
export function tipFor(kind: InstallKind): string | null {
  switch (kind) {
    case "inapp": return "你現在用的是 LINE、IG 等 App 的內建瀏覽器，不能加到主畫面。請先點右上角的「⋯」，選「用 Safari 開啟」或「用其他瀏覽器開啟」（Chrome）。";
    case "ios-other": return "iPhone 建議用 Safari。iOS 16.4 以後的 Chrome 也可以：點網址列右邊的分享按鈕，再點「加入主畫面」。";
    case "desktop": return "你現在用的是電腦，請用手機打開這個網站再照步驟做。電腦版 Chrome、Edge 也可以按網址列右邊的「安裝」圖示。";
    default: return null;
  }
}

/** 第一次用手機打開（不是已經從主畫面打開、不是內建瀏覽器、沒看過）才自動跳出教學。 */
export function shouldAutoShow(kind: InstallKind, standalone: boolean, seen: boolean): boolean {
  return !standalone && !seen && (kind === "ios-safari" || kind === "ios-other" || kind === "android");
}
