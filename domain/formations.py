"""陣型：賽制（11 / 8 人）、每個位置的名稱、用哪個位置的適合度排人、球場座標。"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Slot:
    code: str     # 畫面上的位置名稱，例如 "LCB"
    role: str     # 用哪個位置的適合度排人，例如 "CB"（對應 RatingRules.position_weights）
    x: float      # 球場座標：長 105、寬 68，進攻方向朝右
    y: float


@dataclass(frozen=True)
class Formation:
    name: str                 # 例如 "4-3-3"
    size: int                 # 11 或 8
    slots: tuple[Slot, ...]

    @property
    def label(self) -> str:
        return f"{self.size} 人制 {self.name}"

    def slot(self, code: str) -> Slot:
        return next(s for s in self.slots if s.code == code)

    def validate(self, positions: list[str]) -> list[str]:
        """回傳陣型設定的問題（空 list = 沒問題）。positions = 規則裡有的位置。"""
        problems = []
        if len(self.slots) != self.size:
            problems.append(f"{self.label} 應該有 {self.size} 個位置，設定了 {len(self.slots)} 個")
        codes = [s.code for s in self.slots]
        if len(set(codes)) != len(codes):
            problems.append(f"{self.label} 有重複的位置名稱")
        if sum(1 for s in self.slots if s.role == "GK") != 1:
            problems.append(f"{self.label} 要剛好一個門將")
        unknown = sorted({s.role for s in self.slots} - set(positions))
        if unknown:
            problems.append(f"{self.label} 用到不存在的位置：{unknown}")
        bad_xy = [s.code for s in self.slots if not (0 <= s.x <= 105 and 0 <= s.y <= 68)]
        if bad_xy:
            problems.append(f"{self.label} 座標超出球場：{bad_xy}")
        return problems
