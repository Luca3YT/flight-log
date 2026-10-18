"""日本の海岸線（data.js の JAPAN_PATH）を作り直す。ふだんは使いません。

路線マップと振り返りカードの地図はこの文字列を描いています。
空港を足して、地図に入らない島が出てきたときだけ使ってください。

  1. Natural Earth の 10m 国境データを入手する
     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson
  2. python tools/gen-japan-path.py ダウンロードしたファイル.geojson > japan_path.txt
  3. data.js の JAPAN_PATH の中身を japan_path.txt の1行と入れ替える

投影は x = (経度 - 138) × cos36° × 10、y = -(緯度 - 36) × 10（app.js の pxy と同じ）。
空港の近くにない小さな島は省き、ダグラス・ポーカー法で点を間引きます。
"""
import json
import math
import re
import sys
from pathlib import Path

LAT0, K = 36.0, 10.0
C = math.cos(math.radians(LAT0))


def proj(lon, lat):
    return ((lon - 138.0) * C * K, -(lat - LAT0) * K)


def simplify(pts, eps):
    if len(pts) < 3:
        return pts
    (ax, ay), (bx, by) = pts[0], pts[-1]
    length = math.hypot(bx - ax, by - ay) or 1e-9
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return simplify(pts[: idx + 1], eps)[:-1] + simplify(pts[idx:], eps)
    return [pts[0], pts[-1]]


def area(p):
    return abs(sum(p[i][0] * p[i - 1][1] - p[i - 1][0] * p[i][1] for i in range(len(p)))) / 2


def main(src):
    geo = json.loads(Path(src).read_text(encoding="utf-8"))
    jp = next(f for f in geo["features"] if f["properties"].get("ADM0_A3") == "JPN")
    geom = jp["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]

    data_js = (Path(__file__).resolve().parent.parent / "data.js").read_text(encoding="utf-8")
    airports = [proj(float(lon), float(lat)) for lat, lon in re.findall(
        r'"[A-Z]{3}", "[A-Z]{4}", "[^"]+", "[^"]+", "[^"]+", ([\d.]+), ([\d.]+)', data_js)]

    out = []
    for poly in polys:
        pts = [proj(x, y) for x, y in poly[0]]
        a = area(pts)
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        near = any(min(xs) - 1 <= x <= max(xs) + 1 and min(ys) - 1 <= y <= max(ys) + 1 for x, y in airports)
        if a < 0.6 and not near:
            continue
        eps = 0.12 if a > 50 else 0.06
        # 閉じた輪は始点と終点が同じなので、いちばん遠い点で2つに割ってから間引く
        far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
        s = simplify(pts[: far + 1], eps)[:-1] + simplify(pts[far:], eps)
        if len(s) < 4:
            s = pts[:: max(1, len(pts) // 6)]
        if len(s) < 3:
            continue
        out.append("M" + " ".join("%.1f %.1f" % p for p in s) + "Z")
    sys.stdout.write("".join(out).replace(" -", "-"))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("使い方: python tools/gen-japan-path.py ne_10m_admin_0_countries.geojson > japan_path.txt")
    main(sys.argv[1])
