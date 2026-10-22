// v2.9：不是 iPhone／iPad 的 Safari 時，提醒「加到日曆」等功能可能不順。純計算，不 import React。
// 只看手機和平板；電腦下載 .ics 沒問題，不打擾。

export type BrowserKind = "ios-inapp" | "ios-other" | "android-inapp" | "android";

export type BrowserNotice = { kind: BrowserKind; title: string; items: string[] };

const INAPP = /Line\/|Instagram|FBAN|FBAV|MicroMessenger|; wv\)/i;

/** 回傳 null = 不用提醒（iOS Safari、電腦）。 */
export function browserNotice(ua: string, touchPoints = 0): BrowserNotice | null {
  const s = ua || "";
  const ios = /iPhone|iPad|iPod/.test(s) || (/Macintosh/.test(s) && touchPoints > 1);
  const android = /Android/i.test(s);
  if (!ios && !android) return null;
  const inapp = INAPP.test(s);

  if (ios) {
    if (inapp) {
      return {
        kind: "ios-inapp",
        title: "請改用 Safari 開啟",
        items: [
          "你現在用的是 App 內建瀏覽器（LINE、IG、FB 等），常常擋下載，「加到日曆」可能沒反應。",
          "Google 登入在內建瀏覽器裡也可能被拒絕。",
          "點右上角或右下角的「⋯」→「用 Safari 開啟」，登入和日曆都會正常。",
        ],
      };
    }
    if (/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(s) || !/Safari/.test(s)) {
      return {
        kind: "ios-other",
        title: "建議改用 Safari",
        items: [
          "iPhone／iPad 上，只有 Safari 點下載的 .ics 檔會直接問你「要不要加到行事曆」。",
          "Chrome、Firefox 等瀏覽器會把檔案存起來，要自己到「檔案」App 再點開。",
          "其他功能（能力表、出席、組隊、聊天室）不受影響。",
        ],
      };
    }
    return null;
  }

  if (inapp) {
    return {
      kind: "android-inapp",
      title: "請改用 Chrome 開啟",
      items: [
        "你現在用的是 App 內建瀏覽器（LINE、IG、FB 等），常常擋下載，「加到日曆」可能沒反應。",
        "Google 登入在內建瀏覽器裡也可能被拒絕。",
        "點右上角的「⋯」→「用其他瀏覽器開啟」，選 Chrome。",
      ],
    };
  }
  return {
    kind: "android",
    title: "Android 的「加到日曆」要多一步",
    items: [
      "單一場練習或比賽：按「加到 Google 日曆」就能直接加入。",
      "整季的「加到日曆」會下載 .ics 檔；到通知列或「檔案」App 點開它，選 Google 日曆（或三星日曆）就能加入。",
      "有些手機的 Google 日曆 App 不能直接開 .ics，這時請改用「檔案」App 裡的「用其他 App 開啟」。",
      "其他功能（能力表、出席、組隊、聊天室）不受影響。",
    ],
  };
}
