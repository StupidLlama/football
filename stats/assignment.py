"""指派問題（匈牙利演算法）：n 個位置、m 位球員，求總分最高、每人最多排一次的排法。

純 Python，不用 numpy / scipy，才能放在 Inner shell。複雜度 O(n² m)，30 人以內一瞬間就算完。
"""


def max_assignment(scores: list[list[float]]) -> list[int]:
    """scores[i][j] = 位置 i 排球員 j 的分數。回傳每個位置分到的球員編號（-1 = 沒人）。

    位置比球員多時，會讓「總分最高的那幾個位置」有人，其他位置是 -1。
    同樣的輸入每次都回傳同樣的結果。
    """
    n = len(scores)
    m = len(scores[0]) if n else 0
    if n == 0 or m == 0:
        return [-1] * n
    if n > m:  # 位置比人多：轉置後算「每個人去哪個位置」
        by_player = max_assignment([[scores[i][j] for i in range(n)] for j in range(m)])
        result = [-1] * n
        for j, i in enumerate(by_player):
            if i >= 0:
                result[i] = j
        return result

    # 標準匈牙利演算法（最小化成本），成本 = 最高分 − 分數
    top = max(max(row) for row in scores)
    cost = [[top - scores[i][j] for j in range(m)] for i in range(n)]
    INF = float("inf")
    u, v = [0.0] * (n + 1), [0.0] * (m + 1)
    p, way = [0] * (m + 1), [0] * (m + 1)   # p[j] = 球員 j 分到的位置（1-based）
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = [INF] * (m + 1)
        used = [False] * (m + 1)
        while True:
            used[j0] = True
            i0, delta, j1 = p[j0], INF, 0
            for j in range(1, m + 1):
                if not used[j]:
                    cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j], way[j] = cur, j0
                    if minv[j] < delta:
                        delta, j1 = minv[j], j
            for j in range(m + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    result = [-1] * n
    for j in range(1, m + 1):
        if p[j]:
            result[p[j] - 1] = j - 1
    return result
