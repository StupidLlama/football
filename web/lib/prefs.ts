// 只存在這台裝置的偏好（文字大小、能力表草稿）。瀏覽器不給存（無痕模式等）也不會壞。

export const TEXT_SIZES = [
  { key: "std", label: "標準", px: 16 },
  { key: "lg", label: "大", px: 18 },
  { key: "xl", label: "特大", px: 20 },
] as const;

export function read(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* 不能存就算了 */ }
}

export function textSize(): string {
  const v = read("fap:text-size");
  return TEXT_SIZES.some((s) => s.key === v) ? (v as string) : "std";
}

export function applyTextSize(key: string): void {
  const s = TEXT_SIZES.find((x) => x.key === key) ?? TEXT_SIZES[0];
  document.documentElement.style.setProperty("--fs", `${s.px}px`);
}

export function loadTextSize(): void { applyTextSize(textSize()); }

export function setTextSize(key: string): void { write("fap:text-size", key); applyTextSize(key); }
