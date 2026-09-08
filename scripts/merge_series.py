#!/usr/bin/env python3
"""Hợp nhất hai bản series.json — GỘP tập của cả hai, không phải chọn một.

Vì sao không chọn "bản nhiều tập hơn": bản cũ có thể nhiều tập hơn nhưng THIẾU tập 1 (bị video tổng
hợp "EP01-26 FULL" chiếm chỗ), còn bản mới sạch hơn nhưng lần chạy đó YouTube chặn nên hụt vài chục
tập. Gộp lại thì được cả hai, với ba luật dọn:
  · tập phim thật dài 4–45 phút;
  · trùng (mùa, số tập) thì giữ bản NGẮN hơn — bản dài gần như luôn là video gộp nhiều tập;
  · bỏ video mang tên bộ khác.

  py scripts/merge_series.py <bản-khác.json>
"""
from __future__ import annotations

import json
import os
import sys

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUR = os.path.join(ROOT, "frontend", "src", "data", "series.json")
MIN_SEC, MAX_SEC = 240, 2700


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        return
    other = json.load(open(sys.argv[1], encoding="utf-8"))
    cur = json.load(open(CUR, encoding="utf-8"))
    info_by_id = {s["id"]: s for s in other.get("series", [])}
    info_by_id.update({s["id"]: s for s in cur.get("series", [])})  # bản hiện tại ưu tiên phần mô tả
    all_names = {s["id"]: s.get("cn", "") for s in info_by_id.values()}

    series_out: list[dict] = []
    eps_out: dict[str, list[dict]] = {}
    for key, info in info_by_id.items():
        others = [cn for k, cn in all_names.items() if k != key and cn and cn not in info.get("cn", "")]

        def usable(e: dict) -> bool:
            return MIN_SEC <= e["duration"] <= MAX_SEC and not any(o in e["title"] for o in others)

        # Giữ NGUYÊN cách đánh mùa/tập của bản hiện tại rồi mới bù tập còn thiếu từ bản kia.
        # BẪY: hai bản đánh số mùa khác nhau nên gộp kiểu "trộn rồi khử trùng" làm mất tập
        # (Thương Nguyên Đồ 86+95 ra 69) — cùng một video chiếm hai ô, ô kia mất chủ.
        eps = [e for e in cur.get("episodes", {}).get(key, []) if usable(e)]
        have_id = {e["id"] for e in eps}
        have_slot = {(e.get("season", 1), e["ep"]) for e in eps}
        added = 0
        for e in other.get("episodes", {}).get(key, []):
            if not usable(e) or e["id"] in have_id:
                continue
            slot = (e.get("season", 1), e["ep"])
            if slot in have_slot:
                continue
            eps.append(e)
            have_id.add(e["id"])
            have_slot.add(slot)
            added += 1
        eps.sort(key=lambda e: (e.get("season", 1), e["ep"]))
        if not eps:
            print(f"  {info['vi']:<22} BỎ (không còn tập nào)")
            continue
        seasons_src = {s["season"]: s for s in info.get("seasons", [])}
        for s in next((x.get("seasons", []) for x in other.get("series", []) if x["id"] == key), []):
            seasons_src.setdefault(s["season"], s)
        seasons = [
            {**seasons_src[n], "count": c}
            for n in sorted({e["season"] for e in eps})
            if (c := sum(1 for e in eps if e["season"] == n)) and n in seasons_src
        ]
        print(f"  {info['vi']:<22} {len(eps):>4} tập (bản này {len(cur.get('episodes', {}).get(key, []))}, thêm {added} từ bản kia)")
        series_out.append(
            {**info, "seasons": seasons, "count": len(eps), "poster": eps[0]["id"],
             "firstEp": eps[0]["ep"], "lastEp": eps[-1]["ep"]}
        )
        eps_out[key] = eps

    cur["series"] = series_out
    cur["episodes"] = eps_out
    json.dump(cur, open(CUR, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\nGộp xong: {len(series_out)} bộ · {sum(s['count'] for s in series_out)} tập")


if __name__ == "__main__":
    main()
