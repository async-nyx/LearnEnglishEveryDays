#!/usr/bin/env python3
"""Dựng thư viện video học tiếng Anh A1–C1 cho Subloop.

Mã video KHÔNG được bịa: script kéo kết quả tìm kiếm thật của YouTube theo từng kênh, lọc theo kênh
cho phép, độ dài phù hợp bậc, rồi KIỂM TRA từng video có phụ đề tiếng Anh do người làm (không phải
tự động) bằng youtube_transcript_api. Kết quả ghi vào frontend/src/data/library.json kèm nguồn.

Chạy:  py scripts/build_library.py            (mất vài phút vì kiểm tra phụ đề từng video)
"""
from __future__ import annotations

import json
import os
import re
import sys
import time

import requests
from youtube_transcript_api import YouTubeTranscriptApi

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "frontend", "src", "data", "library.json")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
HTTP.cookies.update({"CONSENT": "YES+1", "SOCS": "CAI"})

PER_LEVEL = 20
MAX_PER_CHANNEL = 7

# (bậc, phút tối thiểu, phút tối đa, [ (truy vấn, chủ đề, [kênh cho phép]) ])
PLAN = [
    ("A1", 1.0, 8.0, [
        ("Learn English with Bob the Canadian", "Giao tiếp cơ bản", ["Bob the Canadian"]),
        ("BBC Learning English English In A Minute", "Ngữ pháp 1 phút", ["BBC Learning English"]),
        ("Easy English super easy", "Phỏng vấn đường phố dễ", ["Easy English"]),
        ("Speak English With Vanessa beginner", "Hội thoại hằng ngày", ["Speak English With Vanessa"]),
        ("English with Emma engVid beginner", "Từ vựng cơ bản", ["Learn English with Emma", "engVid"]),
        ("Bob the Canadian English vocabulary", "Từ vựng đời sống", ["Bob the Canadian"]),
        ("BBC Learning English The English We Speak", "Thành ngữ ngắn", ["BBC Learning English"]),
        ("Easy English lesson basics", "Bài học cơ bản", ["Easy English"]),
        ("Speak English With Vanessa", "Hội thoại hằng ngày", ["Speak English With Vanessa"]),
        ("English Coach Chad beginner", "Giao tiếp cơ bản", ["English Coach Chad"]),
    ]),
    ("A2", 2.0, 10.0, [
        ("Easy English street interview", "Phỏng vấn đường phố", ["Easy English"]),
        ("BBC Learning English 6 Minute English", "6 Minute English", ["BBC Learning English"]),
        ("Oxford Online English", "Kỹ năng nói", ["Oxford Online English"]),
        ("mmmEnglish pronunciation", "Phát âm", ["mmmEnglish"]),
        ("Speak English With Vanessa conversation", "Hội thoại", ["Speak English With Vanessa"]),
        ("Easy English learn English street", "Phỏng vấn đường phố", ["Easy English"]),
        ("BBC Learning English Tim's Pronunciation Workshop", "Phát âm", ["BBC Learning English"]),
        ("Oxford Online English listening", "Nghe hiểu", ["Oxford Online English"]),
        ("mmmEnglish conversation", "Hội thoại", ["mmmEnglish"]),
        ("English with Lucy easy", "Từ vựng", ["English with Lucy"]),
        ("English Coach Chad", "Giao tiếp", ["English Coach Chad"]),
    ]),
    ("B1", 3.0, 12.0, [
        ("TED-Ed", "Khoa học & đời sống", ["TED-Ed"]),
        ("English with Lucy", "Từ vựng & văn hoá", ["English with Lucy"]),
        ("BBC Learning English News Review", "Tin tức", ["BBC Learning English"]),
        ("Simple History", "Lịch sử", ["Simple History"]),
        ("SciShow", "Khoa học phổ thông", ["SciShow"]),
    ]),
    ("B2", 4.0, 15.0, [
        ("TED talk", "Diễn thuyết TED", ["TED"]),
        ("Kurzgesagt", "Khoa học", ["Kurzgesagt"]),
        ("Vox explained", "Giải thích thời sự", ["Vox"]),
        ("Veritasium", "Vật lý & kỹ thuật", ["Veritasium"]),
        ("CrashCourse", "Kiến thức nền", ["CrashCourse"]),
    ]),
    ("C1", 6.0, 25.0, [
        ("TED talk economics", "Kinh tế & xã hội", ["TED"]),
        ("Big Think", "Tư duy & triết học", ["Big Think"]),
        ("The School of Life", "Tâm lý", ["The School of Life"]),
        ("Stanford Graduate School of Business talk", "Kinh doanh", ["Stanford Graduate School of Business", "Stanford"]),
        ("The Economist explains", "Kinh tế thế giới", ["The Economist"]),
    ]),
]


def search(query: str) -> list[dict]:
    r = HTTP.get(
        "https://www.youtube.com/results",
        params={"search_query": query, "sp": "EgIQAQ%3D%3D"},  # chỉ video
        timeout=20,
    )
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", r.text, re.S)
    if not m:
        return []
    data = json.loads(m.group(1))
    out: list[dict] = []

    def walk(o):
        if isinstance(o, dict):
            if "videoRenderer" in o:
                v = o["videoRenderer"]
                title = "".join(x.get("text", "") for x in v.get("title", {}).get("runs", []))
                owner = v.get("ownerText", {}).get("runs", [{}])[0]
                channel = clean_channel(owner.get("text", ""))
                base = (
                    owner.get("navigationEndpoint", {})
                    .get("browseEndpoint", {})
                    .get("canonicalBaseUrl", "")
                )
                dur = v.get("lengthText", {}).get("simpleText", "")
                out.append(
                    {
                        "id": v.get("videoId"),
                        "title": title.strip(),
                        "channel": channel.strip(),
                        "channelUrl": f"https://www.youtube.com{base}" if base else "",
                        "duration": parse_duration(dur),
                    }
                )
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)

    walk(data)
    return out


def parse_duration(s: str) -> int:
    parts = [p for p in s.split(":") if p.strip().isdigit()]
    if not parts:
        return 0
    total = 0
    for p in parts:
        total = total * 60 + int(p)
    return total


def has_manual_english(video_id: str) -> tuple[bool, str]:
    """Có phụ đề tiếng Anh do người làm? Trả (đúng/sai, mã ngôn ngữ)."""
    try:
        tl = YouTubeTranscriptApi().list(video_id)
        for t in tl:
            if t.language_code.startswith("en") and not t.is_generated:
                return True, t.language_code
    except Exception:
        pass
    return False, ""


def clean_channel(name: str) -> str:
    """Video cộng tác hiện 'Big Think and 2 more' / 'Big Think and Jonny Thomson' -> lấy kênh đầu."""
    return re.split(r"\s+and\s+", name, 1)[0].strip()


def main() -> None:
    seen: set[str] = set()
    library: list[dict] = []
    existing: list[dict] = []
    if os.path.exists(OUT):
        try:
            existing = json.load(open(OUT, encoding="utf-8")).get("items", [])
        except Exception:
            existing = []
    for v in existing:
        v["channel"] = clean_channel(v["channel"])
        v["source"] = f"{v['channel']} trên YouTube"
        seen.add(v["id"])
    for level, min_m, max_m, queries in PLAN:
        picked: list[dict] = [v for v in existing if v["level"] == level][:PER_LEVEL]
        per_channel: dict[str, int] = {}
        for v in picked:
            per_channel[v["channel"]] = per_channel.get(v["channel"], 0) + 1
        if len(picked) >= PER_LEVEL:
            print(f"[{level}] đã đủ {len(picked)} từ lần trước")
            library.extend(picked)
            continue
        for query, topic, allowed in queries:
            if len(picked) >= PER_LEVEL:
                break
            print(f"[{level}] tìm: {query}")
            cands = search(query)
            time.sleep(1.0)
            for c in cands:
                if len(picked) >= PER_LEVEL:
                    break
                if not c["id"] or c["id"] in seen:
                    continue
                if not any(a.lower() in c["channel"].lower() for a in allowed):
                    continue
                d = c["duration"]
                if not (min_m * 60 <= d <= max_m * 60):
                    continue
                if per_channel.get(c["channel"], 0) >= MAX_PER_CHANNEL:
                    continue
                ok, lang = has_manual_english(c["id"])
                time.sleep(0.4)
                if not ok:
                    print(f"    bỏ (không có phụ đề EN người làm): {c['title'][:50]}")
                    continue
                seen.add(c["id"])
                per_channel[c["channel"]] = per_channel.get(c["channel"], 0) + 1
                picked.append(
                    {
                        **c,
                        "level": level,
                        "topic": topic,
                        "captions": lang,
                        "source": f"{c['channel']} trên YouTube",
                    }
                )
                print(f"    + {c['title'][:60]} · {c['channel']} · {d // 60}:{d % 60:02d}")
        print(f"[{level}] chọn được {len(picked)}")
        library.extend(picked)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generatedAt": time.strftime("%Y-%m-%d"),
                "note": "Video thuộc bản quyền của từng kênh; Subloop chỉ nhúng qua trình phát YouTube chính thức và không lưu video. Danh sách được lọc tự động: phụ đề tiếng Anh do người làm, độ dài phù hợp bậc.",
                "items": library,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"Ghi {len(library)} video vào {OUT}")


if __name__ == "__main__":
    main()
