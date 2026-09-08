#!/usr/bin/env python3
"""Dọn series.json: bỏ những mục KHÔNG phải tập phim (không tải lại gì).

Hai luật, cố ý chọn loại luật không loại oan:
  · độ dài phải 4–45 phút — dài hơn là chương truyện audio hoặc video gộp nhiều tập;
  · tên video không được mang tên BỘ KHÁC (danh sách "仙逆" từng trộn 仙武传 và 凡人修仙传).

KHÔNG lọc theo "tên phải chứa tên bộ": nhiều kênh dùng chữ phồn thể (滄元圖 ≠ 沧元图) nên lọc kiểu
đó bỏ oan 19 tập của Thương Nguyên Đồ.

  py scripts/clean_series.py            (xem trước)
  py scripts/clean_series.py --apply    (ghi đè)
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
    apply = "--apply" in sys.argv
    data = json.load(open(CUR, encoding="utf-8"))
    names = {s["id"]: s.get("cn", "") for s in data["series"]}

    series_out: list[dict] = []
    eps_out: dict[str, list[dict]] = {}
    for info in data["series"]:
        rows = data["episodes"].get(info["id"], [])
        others = [cn for key, cn in names.items() if key != info["id"] and cn and cn not in info.get("cn", "")]
        keep = []
        for e in rows:
            if not (MIN_SEC <= e["duration"] <= MAX_SEC):
                continue
            if any(o in e["title"] for o in others):
                continue
            keep.append(e)
        removed = len(rows) - len(keep)
        if removed:
            print(f"  {info['vi']:<22} bỏ {removed} mục rác, còn {len(keep)}")
        if not keep:
            print(f"  {info['vi']:<22} BỎ CẢ BỘ (không còn tập nào thật)")
            continue
        seasons = [
            {**sea, "count": n}
            for sea in info.get("seasons", [])
            if (n := sum(1 for e in keep if e["season"] == sea["season"]))
        ]
        series_out.append(
            {**info, "seasons": seasons, "count": len(keep), "poster": keep[0]["id"],
             "firstEp": keep[0]["ep"], "lastEp": keep[-1]["ep"]}
        )
        eps_out[info["id"]] = keep

    print(
        f"\n{len(series_out)} bộ · {sum(s['count'] for s in series_out)} tập"
        f" (trước: {len(data['series'])} bộ · {sum(s['count'] for s in data['series'])} tập)"
    )
    if apply:
        data["series"] = series_out
        data["episodes"] = eps_out
        json.dump(data, open(CUR, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("Đã ghi đè series.json")
    else:
        print("Xem trước — thêm --apply để ghi")


if __name__ == "__main__":
    main()
