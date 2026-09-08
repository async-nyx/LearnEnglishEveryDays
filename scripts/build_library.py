#!/usr/bin/env python3
"""Dựng thư viện video học tiếng Anh (A1–C1) và tiếng Trung (HSK 1–9) cho Subloop.

Mã video KHÔNG được bịa: script kéo kết quả tìm kiếm thật của YouTube theo từng kênh, lọc theo kênh
cho phép và độ dài phù hợp bậc, rồi KIỂM TRA từng video có phụ đề đúng tiếng bằng
youtube_transcript_api. Kết quả ghi vào frontend/src/data/library.json kèm nguồn.

Chạy lại được: video đã có trong tệp cũ được giữ, chỉ tìm thêm cho bậc còn thiếu.
  py scripts/build_library.py            (mất vài phút vì kiểm tra phụ đề từng video)
  py scripts/build_library.py zh         (chỉ dựng phần tiếng Trung)
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

MAX_PER_CHANNEL = 8

# BẪY đã trả giá: tìm tên phim hoạt hình ra rất nhiều nhạc phim (片尾曲/插曲) và video lời bài hát.
# Chúng có phụ đề nên lọt qua mọi bộ lọc, nhưng nghe hát thì không học được. Loại theo tên video.
JUNK_TITLE = re.compile(
    r"片尾曲|片頭曲|片头曲|主题曲|主題曲|插曲|歌词|歌詞|歌曲|完整版歌|演唱|Lyrics|Theme Song|"
    r"Ending Song|Opening Song|純音樂|纯音乐|钢琴|鋼琴|\bOST\b|\bMV\b|\bcover\b",
    re.I,
)

# (tiếng, bậc, số video, phút tối thiểu, phút tối đa, [ (truy vấn, chủ đề, [kênh cho phép]) ])
PLAN = [
    # ───────────────────────── TIẾNG ANH A1–C1 ─────────────────────────
    ("en", "A1", 40, 1.0, 9.0, [
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
        ("Simple English Videos", "Hội thoại tình huống", ["Simple English Videos"]),
        ("Learn English with TV Series beginner", "Học qua phim", ["Learn English With TV Series"]),
        ("Shaw English Online beginner lesson", "Bài học vỡ lòng", ["Shaw English Online"]),
        ("Interactive English beginner", "Giao tiếp cơ bản", ["Interactive English"]),
        ("Learn English with Papa Teach Me basic", "Ngữ pháp vui", ["Papa Teach Me"]),
        ("BBC Learning English Learn English with the news", "Tin tức chậm", ["BBC Learning English"]),
        ("Rachel's English pronunciation basics", "Phát âm", ["Rachel's English"]),
        ("Easy English what is your favourite", "Phỏng vấn đường phố", ["Easy English"]),
    ]),
    ("en", "A2", 40, 2.0, 11.0, [
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
        ("Rachel's English American accent", "Phát âm Mỹ", ["Rachel's English"]),
        ("Papa Teach Me grammar", "Ngữ pháp vui", ["Papa Teach Me"]),
        ("Learn English with TV Series Friends", "Học qua phim", ["Learn English With TV Series"]),
        ("Simple English Videos idioms", "Thành ngữ", ["Simple English Videos"]),
        ("Interactive English travel", "Du lịch", ["Interactive English"]),
        ("Shaw English Online conversation", "Hội thoại", ["Shaw English Online"]),
        ("BBC Learning English English at Work", "Tiếng Anh công sở", ["BBC Learning English"]),
    ]),
    ("en", "B1", 40, 3.0, 13.0, [
        ("TED-Ed", "Khoa học & đời sống", ["TED-Ed"]),
        ("English with Lucy", "Từ vựng & văn hoá", ["English with Lucy"]),
        ("BBC Learning English News Review", "Tin tức", ["BBC Learning English"]),
        ("Simple History", "Lịch sử", ["Simple History"]),
        ("SciShow", "Khoa học phổ thông", ["SciShow"]),
        ("TED-Ed animation history", "Lịch sử hoạt hình", ["TED-Ed"]),
        ("TED-Ed riddle", "Câu đố", ["TED-Ed"]),
        ("MinuteEarth", "Trái Đất", ["MinuteEarth"]),
        ("Life Noggin", "Khoa học vui", ["Life Noggin"]),
        ("Oversimplified history", "Lịch sử hoạt hình", ["OverSimplified"]),
        ("The Infographics Show", "Giải thích trực quan", ["The Infographics Show"]),
        ("Learn English with TV Series analysis", "Học qua phim", ["Learn English With TV Series"]),
    ]),
    ("en", "B2", 40, 4.0, 16.0, [
        ("TED talk", "Diễn thuyết TED", ["TED"]),
        ("Kurzgesagt", "Khoa học", ["Kurzgesagt"]),
        ("Vox explained", "Giải thích thời sự", ["Vox"]),
        ("Veritasium", "Vật lý & kỹ thuật", ["Veritasium"]),
        ("CrashCourse", "Kiến thức nền", ["CrashCourse"]),
        ("TED talk psychology", "Tâm lý", ["TED"]),
        ("Vox borders", "Thế giới", ["Vox"]),
        ("Kurzgesagt space", "Vũ trụ", ["Kurzgesagt"]),
        ("CrashCourse literature", "Văn học", ["CrashCourse"]),
        ("TEDx Talks education", "Diễn thuyết TEDx", ["TEDx Talks"]),
    ]),
    ("en", "C1", 40, 6.0, 26.0, [
        ("TED talk economics", "Kinh tế & xã hội", ["TED"]),
        ("Big Think", "Tư duy & triết học", ["Big Think"]),
        ("The School of Life", "Tâm lý", ["The School of Life"]),
        ("Stanford Graduate School of Business talk", "Kinh doanh", ["Stanford Graduate School of Business", "Stanford"]),
        ("The Economist explains", "Kinh tế thế giới", ["The Economist"]),
        ("TED talk science research", "Nghiên cứu", ["TED"]),
        ("Google talks author", "Trò chuyện tác giả", ["Talks at Google"]),
        ("Harvard University lecture", "Bài giảng", ["Harvard University"]),
        ("Yale Courses lecture", "Bài giảng", ["YaleCourses"]),
        ("Wall Street Journal explains", "Kinh tế", ["The Wall Street Journal", "WSJ"]),
    ]),
    # ───────────────────────── TIẾNG TRUNG HSK 1–9 ─────────────────────────
    # BẪY đã trả giá: hầu hết video tiếng Trung KHÔNG có track phụ đề (nhiều kênh in chữ thẳng vào
    # hình), nên khoá theo danh sách kênh là ra rỗng. Ở đây để `[]` = nhận mọi kênh, và chính phép
    # kiểm tra phụ đề mới là bộ lọc. HSK 1–2 lấy nhiều nhất, ưu tiên hoạt hình và video nói chậm.
    ("zh", "HSK1", 28, 0.5, 20.0, [
        ("中文 动画 有字幕 儿童", "Hoạt hình thiếu nhi", []),
        ("Chinese cartoon for beginners subtitles", "Hoạt hình cho người mới", []),
        ("小猪佩奇 中文 字幕", "Hoạt hình Peppa Pig", []),
        ("HSK 1 听力 中文字幕", "Luyện nghe HSK 1", []),
        ("HSK1 Chinese listening subtitles", "Luyện nghe HSK 1", []),
        ("super slow Chinese for absolute beginners", "Nói rất chậm", []),
        ("中文 故事 慢速 字幕", "Kể chuyện chậm", []),
        ("Chinese comprehensible input beginner", "Nghe hiểu vỡ lòng", []),
        ("学中文 零基础 听力", "Vỡ lòng", []),
        ("Chinese Daily Podcast HSK 1", "Podcast HSK 1", []),
    ]),
    ("zh", "HSK2", 25, 1.0, 22.0, [
        ("HSK 2 听力 字幕", "Luyện nghe HSK 2", []),
        ("HSK2 Chinese listening practice subtitles", "Luyện nghe HSK 2", []),
        ("中文 动画 短片 字幕", "Hoạt hình ngắn", []),
        ("slow Chinese conversation subtitles beginner", "Hội thoại chậm", []),
        ("中文 日常 对话 慢速 字幕", "Hội thoại hằng ngày", []),
        ("Chinese podcast for beginners HSK 2", "Podcast", []),
        ("学中文 生活 vlog 慢速", "Nhật ký đời sống", []),
        ("Chinese story with pinyin subtitles", "Kể chuyện", []),
    ]),
    ("zh", "HSK3", 24, 2.0, 25.0, [
        ("A Will Eternal 一念永恒 EP ENG SUB", "Hoạt hình tu tiên 3D", []),
        ("斗罗大陆 Soul Land EP ENG SUB 腾讯视频", "Hoạt hình tiên hiệp 3D", []),
        ("MULTISUB 玄幻 动画 EP", "Hoạt hình huyền huyễn 3D", []),
        ("斗罗大陆 动画 全集 字幕", "Hoạt hình tiên hiệp 3D", []),
        ("HSK 3 听力 字幕", "Luyện nghe HSK 3", []),
        ("intermediate Chinese listening subtitles", "Nghe trung cấp", []),
        ("中文 播客 中级 字幕", "Podcast trung cấp", []),
        ("Chinese vlog subtitles intermediate", "Nhật ký đời sống", []),
    ]),
    ("zh", "HSK4", 26, 3.0, 28.0, [
        ("凡人修仙传 动画 字幕", "Hoạt hình tu tiên 3D", []),
        ("吞噬星空 动画 字幕", "Hoạt hình tu tiên 3D", []),
        ("斗破苍穹 动画 字幕", "Hoạt hình huyền huyễn 3D", []),
        ("完美世界 动画 字幕", "Hoạt hình tiên hiệp 3D", []),
        ("星辰变 动画 字幕", "Hoạt hình tu tiên 3D", []),
        ("Chinese donghua 3D cultivation english subtitles", "Hoạt hình tu tiên 3D", []),
        ("HSK 4 听力 字幕", "Luyện nghe HSK 4", []),
        ("Chinese podcast intermediate subtitles", "Podcast", []),
        ("中文 访谈 字幕", "Phỏng vấn", []),
        ("Chinese documentary subtitles short", "Phóng sự", []),
    ]),
    ("zh", "HSK5", 22, 4.0, 30.0, [
        ("遮天 动画 字幕", "Hoạt hình tiên hiệp 3D", []),
        ("仙逆 动画 字幕", "Hoạt hình tu tiên 3D", []),
        ("沧元图 动画 字幕", "Hoạt hình tu tiên 3D", []),
        ("神印王座 动画 字幕", "Hoạt hình huyền huyễn 3D", []),
        ("牧神记 动画 字幕", "Hoạt hình tiên hiệp 3D", []),
        ("百炼成神 动画 字幕", "Hoạt hình tu tiên 3D", []),
        ("HSK 5 听力 字幕", "Luyện nghe HSK 5", []),
        ("中文 演讲 字幕", "Diễn thuyết", []),
        ("advanced Chinese podcast subtitles", "Podcast nâng cao", []),
    ]),
    ("zh", "HSK6", 22, 5.0, 32.0, [
        ("剑来 动画 字幕", "Hoạt hình tiên hiệp 3D", []),
        ("莽荒纪 动画 字幕", "Hoạt hình tu tiên 3D", []),
        ("武动乾坤 动画 字幕", "Hoạt hình huyền huyễn 3D", []),
        ("长生界 动画 字幕", "Hoạt hình tiên hiệp 3D", []),
        ("修真 动画 国语 字幕", "Hoạt hình tu tiên 3D", []),
        ("HSK 6 听力 字幕", "Luyện nghe HSK 6", []),
        ("中文 深度 访谈 字幕", "Phỏng vấn chuyên sâu", []),
        ("TEDx 中文 演讲 字幕", "Diễn thuyết TEDx", []),
    ]),
    # HSK7-9 để dành cho diễn thuyết học thuật: hoạt hình tiên hiệp nằm ở HSK3–HSK6 mới đúng sức.
    ("zh", "HSK7-9", 8, 6.0, 35.0, [
        ("中文 学术 演讲 字幕", "Diễn thuyết học thuật", []),
        ("HSK 7-9 听力", "Luyện nghe HSK 7-9", []),
        ("一席 演讲 字幕", "Diễn thuyết", []),
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


def captions_for(video_id: str, lang: str) -> tuple[bool, str, bool]:
    """Có phụ đề đúng tiếng không? Trả (được/không, mã ngôn ngữ, do máy sinh).

    Tiếng Anh: chỉ nhận phụ đề do người làm (chất lượng ổn định hơn).
    Tiếng Trung: ưu tiên người làm, chấp nhận tự động vì phụ đề tay hiếm.
    """
    try:
        tl = YouTubeTranscriptApi().list(video_id)
        tracks = list(tl)
    except Exception:
        return False, "", False
    want = ("en",) if lang == "en" else ("zh", "cmn", "yue")
    manual = [t for t in tracks if not t.is_generated and t.language_code.startswith(want)]
    if manual:
        return True, manual[0].language_code, False
    if lang == "zh":
        auto = [t for t in tracks if t.is_generated and t.language_code.startswith(want)]
        if auto:
            return True, auto[0].language_code, True
    return False, "", False


def clean_channel(name: str) -> str:
    """Video cộng tác hiện 'Big Think and 2 more' -> lấy kênh đầu."""
    return re.split(r"\s+and\s+", name, 1)[0].strip()


def main() -> None:
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    existing: list[dict] = []
    if os.path.exists(OUT):
        try:
            existing = json.load(open(OUT, encoding="utf-8")).get("items", [])
        except Exception:
            existing = []
    for v in existing:
        v["channel"] = clean_channel(v["channel"])
        v.setdefault("lang", "en")
        v.setdefault("generated", False)
        v["source"] = f"{v['channel']} trên YouTube"

    seen = {v["id"] for v in existing}
    library: list[dict] = []

    for lang, level, per_level, min_m, max_m, queries in PLAN:
        picked = [v for v in existing if v.get("lang", "en") == lang and v["level"] == level][:per_level]
        per_channel: dict[str, int] = {}
        for v in picked:
            per_channel[v["channel"]] = per_channel.get(v["channel"], 0) + 1
        if only and lang != only:
            library.extend(picked)
            continue
        if len(picked) >= per_level:
            print(f"[{lang} {level}] đã đủ {len(picked)}")
            library.extend(picked)
            continue

        for query, topic, allowed in queries:
            if len(picked) >= per_level:
                break
            print(f"[{lang} {level}] tìm: {query}")
            try:
                cands = search(query)
            except Exception as e:  # noqa: BLE001
                print(f"    lỗi tìm: {e}")
                continue
            time.sleep(0.8)
            for c in cands:
                if len(picked) >= per_level:
                    break
                if not c["id"] or c["id"] in seen:
                    continue
                if allowed and not any(a.lower() in c["channel"].lower() for a in allowed):
                    continue
                d = c["duration"]
                if not (min_m * 60 <= d <= max_m * 60):
                    continue
                if per_channel.get(c["channel"], 0) >= MAX_PER_CHANNEL:
                    continue
                if JUNK_TITLE.search(c["title"]):
                    continue
                ok, code, generated = captions_for(c["id"], lang)
                time.sleep(0.35)
                if not ok:
                    continue
                seen.add(c["id"])
                per_channel[c["channel"]] = per_channel.get(c["channel"], 0) + 1
                picked.append(
                    {
                        **c,
                        "lang": lang,
                        "level": level,
                        "topic": topic,
                        "captions": code,
                        "generated": generated,
                        "source": f"{c['channel']} trên YouTube",
                    }
                )
                print(f"    + {c['title'][:55]} · {c['channel']} · {d // 60}:{d % 60:02d}{' (phụ đề tự động)' if generated else ''}")
        print(f"[{lang} {level}] có {len(picked)}")
        library.extend(picked)

    # giữ lại video cũ không thuộc bậc nào trong PLAN (phòng khi đổi PLAN)
    known = {v["id"] for v in library}
    library.extend(v for v in existing if v["id"] not in known)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generatedAt": time.strftime("%Y-%m-%d"),
                "note": "Video thuộc bản quyền của từng kênh; Subloop chỉ nhúng qua trình phát YouTube chính thức và không lưu video. Danh sách được lọc tự động: có phụ đề đúng tiếng, độ dài phù hợp bậc.",
                "items": library,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    en = sum(1 for v in library if v.get("lang") == "en")
    zh = sum(1 for v in library if v.get("lang") == "zh")
    print(f"Ghi {len(library)} video ({en} tiếng Anh, {zh} tiếng Trung) vào {OUT}")


if __name__ == "__main__":
    main()
