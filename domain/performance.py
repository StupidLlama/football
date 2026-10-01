"""比賽表現評分（影片分析之後用）：評分維度，以及每個位置依主要任務給的權重。

現在只是規則本身，還沒有分數來源；v4 影片分析完成後由統計層套用。
"""
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class Dimension:
    key: str      # 例如 "accuracy"
    label: str    # 例如 "準確度"


@dataclass(frozen=True)
class PerformanceRules:
    dimensions: tuple[Dimension, ...]
    tasks: Mapping[str, str]                          # 位置 → 主要任務（說明文字）
    weights: Mapping[str, Mapping[str, float]]        # 位置 → {維度 key: 權重}

    def total(self, role: str, scores: Mapping[str, float]) -> float:
        """依位置權重算總分（0–100）。沒有分數的維度當 0 分。"""
        return round(sum(float(scores.get(k, 0)) * w for k, w in self.weights[role].items()), 1)

    def validate(self, positions: list[str]) -> list[str]:
        problems = []
        keys = {d.key for d in self.dimensions}
        missing = sorted(set(positions) - set(self.weights))
        if missing:
            problems.append(f"這些位置沒有表現評分權重：{missing}")
        for role, ws in self.weights.items():
            if abs(sum(ws.values()) - 1) > 1e-6:
                problems.append(f"{role} 的表現權重加總不是 1（是 {sum(ws.values()):.2f}）")
            unknown = sorted(set(ws) - keys)
            if unknown:
                problems.append(f"{role} 用到不存在的評分維度：{unknown}")
        return problems
