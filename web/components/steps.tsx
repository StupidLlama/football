// 加入球隊的三個步驟（加入 → 找到自己 → 完成）。
export function JoinSteps({ step }: { step: 1 | 2 | 3 }) {
  const names = ["加入球隊", "找到自己", "完成"];
  return (
    <ol className="steps" aria-label="加入步驟">
      {names.map((n, i) => (
        <li key={n} className={i + 1 < step ? "done" : i + 1 === step ? "now" : ""} aria-current={i + 1 === step ? "step" : undefined}>
          {i + 1} {n}
        </li>
      ))}
    </ol>
  );
}
