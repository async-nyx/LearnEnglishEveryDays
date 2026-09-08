#!/usr/bin/env python3
"""Dựng **bộ sưu tập phim hoạt hình Trung Quốc** (tiên hiệp / tu tiên) cho Subloop: mỗi bộ lấy TRỌN
danh sách tập từ tập 1 đến tập mới nhất, ghi ra frontend/src/data/series.json.

Cách làm (không bịa mã video):
  1. Tìm DANH SÁCH PHÁT thật của YouTube theo tên phim (bộ lọc `sp=EgIQAw%3D%3D`).
  2. Chấm điểm từng danh sách bằng trang đầu: tỉ lệ video có số tập + tổng số video.
  3. Duyệt hết danh sách bằng innertube `browse` + continuation (mỗi vòng 100 video).
  4. KIỂM TRA phụ đề tiếng Trung của từng tập bằng youtube_transcript_api (chạy nhiều luồng).

  py scripts/build_series.py                 (tất cả các bộ)
  py scripts/build_series.py 凡人修仙传 剑来    (chỉ vài bộ, khớp theo tên Trung/Việt)
  py scripts/build_series.py --no-check       (bỏ bước kiểm phụ đề, chỉ để xem nhanh)
  py scripts/build_series.py --sample=8       (kiểm 8 tập mẫu mỗi mùa thay vì 5)

BẪY đã trả giá: giao diện danh sách phát mới KHÔNG còn `playlistVideoRenderer`; video nằm ở
`lockupViewModel` (như trang đề xuất). Xem `_videos_of_page`.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import requests
from youtube_transcript_api import YouTubeTranscriptApi

sys.path.insert(0, ROOT_DIR := os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import yt_transcript  # noqa: E402 — module của app, dùng chung đường innertube

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "frontend", "src", "data", "series.json")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
CV = "2.20250312.04.00"
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"})
HTTP.cookies.update({"CONSENT": "YES+1", "SOCS": "CAI"})
CTX = {"client": {"clientName": "WEB", "clientVersion": CV, "hl": "zh-CN", "gl": "US"}}

# (khoá, tên Trung, tên Việt, tên Anh, bậc gợi ý, mô tả ngắn)
SERIES = [
    ("dou-luo-dai-luc", "斗罗大陆", "Đấu La Đại Lục", "Soul Land", "HSK3", "Đường Tam luyện hồn sư ở Đấu La đại lục."),
    ("tuyet-the-duong-mon", "斗罗大陆Ⅱ绝世唐门", "Tuyệt Thế Đường Môn", "Soul Land 2", "HSK4", "Phần hai Đấu La: Hoắc Vũ Hạo và Đường Môn."),
    ("pham-nhan-tu-tien", "凡人修仙传", "Phàm Nhân Tu Tiên", "A Mortal's Journey", "HSK4", "Hàn Lập, phàm nhân bước lên con đường tu tiên."),
    ("thon-phe-tinh-khong", "吞噬星空", "Thôn Phệ Tinh Không", "Swallowed Star", "HSK4", "La Phong luyện võ giữa thời tận thế."),
    ("than-an-vuong-toa", "神印王座", "Thần Ấn Vương Tọa", "Throne of Seal", "HSK5", "Long Hạo Thần và kỵ sĩ Thánh điện."),
    ("kiem-lai", "剑来", "Kiếm Lai", "The Swords", "HSK6", "Trần Bình An, thiếu niên nghèo mang kiếm."),
    ("muc-than-ky", "牧神记", "Mục Thần Ký", "Tale of Herding God", "HSK5", "Tần Mục lớn lên ở Tàn Lão thôn."),
    ("thuong-nguyen-do", "沧元图", "Thương Nguyên Đồ", "The Demon Hunter", "HSK5", "Mạnh Xuyên diệt yêu bảo vệ thành."),
    ("tien-nghich", "仙逆", "Tiên Nghịch", "Renegade Immortal", "HSK5", "Vương Lâm nghịch thiên cầu đạo."),
    ("dau-pha-thuong-khung", "斗破苍穹", "Đấu Phá Thương Khung", "Battle Through the Heavens", "HSK4", "Tiêu Viêm luyện dược, luyện khí."),
    ("hoan-my-the-gioi", "完美世界", "Hoàn Mỹ Thế Giới", "Perfect World", "HSK5", "Thạch Hạo từ Thạch thôn đi ra."),
    ("gia-thien", "遮天", "Già Thiên", "Shrouding the Heavens", "HSK5", "Diệp Phàm và cỗ quan đồng xanh."),
    ("tinh-than-bien", "星辰变", "Tinh Thần Biến", "Stellar Transformations", "HSK5", "Tần Vũ tu luyện Tinh Thần Biến."),
    ("vu-dong-can-khon", "武动乾坤", "Vũ Động Càn Khôn", "Martial Universe", "HSK6", "Lâm Động và Tổ Phù."),
    ("nhat-niem-vinh-hang", "一念永恒", "Nhất Niệm Vĩnh Hằng", "A Will Eternal", "HSK3", "Bạch Tiểu Thuần sợ chết nên tu tiên."),
    ("truong-sinh-gioi", "长生界", "Trường Sinh Giới", "World of Immortals", "HSK6", "Tô Mộ Bạch đi tìm trường sinh."),
    ("bach-luyen-thanh-than", "百炼成神", "Bách Luyện Thành Thần", "Apotheosis", "HSK5", "La Chính từ phế vật thành cường giả."),
]

# Tập phim thật, không phải nhạc phim / dự báo / hậu trường.
JUNK = re.compile(
    r"片尾曲|片頭曲|片头曲|主题曲|主題曲|插曲|歌词|歌詞|完整版歌|预告|預告|花絮|幕后|幕後|合集|盘点|盤點|"
    r"解说|解說|reaction|trailer|preview|recap|behind the scenes|\bOST\b|\bMV\b",
    re.I,
)

# BẪY đã trả giá: "斗破苍穹有声小说" (truyện audio đọc chữ) và các kênh "剧情解读" lọt vào vì tên vẫn
# khớp và tập vẫn đánh số — nhưng đó không phải phim, và không có phụ đề.
BAD_PLAYLIST = re.compile(
    r"有声小说|有聲小說|广播剧|廣播劇|解读|解讀|解说|解說|小说|小說|朗读|朗讀|音频|音頻|听书|聽書"
    # BẪY: "武动乾坤第5季 第301集 - 第400集" là CHƯƠNG truyện audio chứ không phải tập phim —
    # phim hoạt hình hiếm khi đánh số quá 300 và không bao giờ đặt tên danh sách theo khoảng chương.
    r"|第\s*[3-9]\d{2}\s*集|第\s*\d{4,}\s*集",
    re.I,
)
EP_PATTERNS = [
    re.compile(r"\bEP\s*[.:]?\s*(\d{1,4})", re.I),
    re.compile(r"第\s*(\d{1,4})\s*集"),
    re.compile(r"Episode\s*(\d{1,4})", re.I),
    re.compile(r"#\s*(\d{1,4})(?!\d)"),
    re.compile(r"(?<![\d第])(\d{1,4})\s*集"),
]


def episode_no(title: str) -> int | None:
    for pat in EP_PATTERNS:
        m = pat.search(title)
        if m:
            n = int(m.group(1))
            if 1 <= n <= 2000:
                return n
    return None


def walk(node, fn) -> None:
    if isinstance(node, dict):
        fn(node)
        for v in node.values():
            walk(v, fn)
    elif isinstance(node, list):
        for v in node:
            walk(v, fn)


def parse_duration(s: str) -> int:
    parts = [p for p in s.split(":") if p.strip().isdigit()]
    total = 0
    for p in parts:
        total = total * 60 + int(p)
    return total


def _videos_of_page(data: dict) -> tuple[list[dict], str | None]:
    """Video + token trang sau của một trang danh sách phát (giao diện lockupViewModel mới)."""
    out: list[dict] = []
    token: list[str | None] = [None]

    def fn(o: dict) -> None:
        if "lockupViewModel" in o:
            lv = o["lockupViewModel"]
            vid = lv.get("contentId") or ""
            if len(vid) != 11:
                return
            meta = (lv.get("metadata") or {}).get("lockupMetadataViewModel") or {}
            title = ((meta.get("title") or {}).get("content") or "").strip()
            dur = ""
            thumb = (lv.get("contentImage") or {}).get("thumbnailViewModel") or {}
            for ov in thumb.get("overlays") or []:
                for b in (ov.get("thumbnailBottomOverlayViewModel") or {}).get("badges") or []:
                    text = (b.get("thumbnailBadgeViewModel") or {}).get("text") or ""
                    if ":" in text:
                        dur = text
            out.append({"id": vid, "title": title, "duration": parse_duration(dur)})
        if "continuationItemRenderer" in o:
            t = (
                (o["continuationItemRenderer"].get("continuationEndpoint") or {})
                .get("continuationCommand", {})
                .get("token")
            )
            # BẪY: mỗi trang có HAI token (một của danh sách video, một của thanh bên). Token ĐẦU
            # mới trả tập mới; giữ token cuối thì trang sau lặp lại đúng 100 video cũ.
            if t and token[0] is None:
                token[0] = t

    walk(data, fn)
    return out, token[0]


def playlist_videos(playlist_id: str, max_pages: int = 30) -> list[dict]:
    """Trọn bộ video của một danh sách phát (mỗi vòng 100)."""
    items: list[dict] = []
    seen: set[str] = set()
    token: str | None = None
    for _ in range(max_pages):
        body: dict = {"context": CTX}
        if token:
            body["continuation"] = token
        else:
            body["browseId"] = "VL" + playlist_id
        try:
            r = HTTP.post(
                "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false",
                json=body,
                headers={"Content-Type": "application/json", "X-Youtube-Client-Name": "1", "X-Youtube-Client-Version": CV},
                timeout=25,
            )
            r.raise_for_status()
            page, token = _videos_of_page(r.json())
        except Exception as e:  # noqa: BLE001
            print(f"    lỗi duyệt danh sách: {e}")
            break
        for v in page:
            if v["id"] not in seen:
                seen.add(v["id"])
                items.append(v)
        if not token:
            break
        time.sleep(0.9)
    return items


def _has_playlist(data: dict) -> bool:
    found = [False]

    def fn(o: dict) -> None:
        if "lockupViewModel" in o and "PLAYLIST" in str(o["lockupViewModel"].get("contentType", "")):
            found[0] = True

    walk(data, fn)
    return found[0]


def find_playlists(query: str) -> list[dict]:
    """Danh sách phát thật trong kết quả tìm kiếm (bộ lọc chỉ danh sách phát)."""
    try:
        r = HTTP.get(
            "https://www.youtube.com/results",
            params={"search_query": query, "sp": "EgIQAw%3D%3D"},
            timeout=20,
        )
        m = re.search(r"var ytInitialData = (\{.*?\});</script>", r.text, re.S)
        if not m:
            return []
        data = json.loads(m.group(1))
    except Exception as e:  # noqa: BLE001
        print(f"    lỗi tìm danh sách phát: {e}")
        return []
    if not _has_playlist(data):
        # BẪY đã trả giá: chạy liền 17 bộ thì YouTube trả trang tìm kiếm RỖNG (không báo lỗi) và
        # cả mẻ bị coi là "không có danh sách phát". Nghỉ rồi thử lại một lần.
        print("    tìm kiếm trả rỗng — nghỉ 45 s rồi thử lại")
        time.sleep(45)
        try:
            r = HTTP.get(
                "https://www.youtube.com/results",
                params={"search_query": query, "sp": "EgIQAw%3D%3D"},
                timeout=20,
            )
            m = re.search(r"var ytInitialData = (\{.*?\});</script>", r.text, re.S)
            data = json.loads(m.group(1)) if m else {}
        except Exception:  # noqa: BLE001
            return []
    out: list[dict] = []

    def fn(o: dict) -> None:
        if "lockupViewModel" not in o:
            return
        lv = o["lockupViewModel"]
        if "PLAYLIST" not in str(lv.get("contentType", "")):
            return
        pid = lv.get("contentId") or ""
        if not pid.startswith("PL"):
            return
        meta = (lv.get("metadata") or {}).get("lockupMetadataViewModel") or {}
        title = ((meta.get("title") or {}).get("content") or "").strip()
        owner = ""
        for row in ((meta.get("metadata") or {}).get("contentMetadataViewModel") or {}).get("metadataRows") or []:
            for part in row.get("metadataParts") or []:
                text = ((part.get("text") or {}).get("content") or "").strip()
                if text and not owner:
                    owner = text
        out.append({"playlistId": pid, "title": title, "owner": owner})

    walk(data, fn)
    uniq: dict[str, dict] = {}
    for p in out:
        uniq.setdefault(p["playlistId"], p)
    return list(uniq.values())


def captions_of(video_id: str) -> tuple[str, bool] | str | None:
    """Phụ đề tiếng Trung của video.

    Trả (mã, do máy sinh) nếu có, `None` nếu video có phụ đề nhưng KHÔNG có tiếng Trung, và chuỗi
    "blocked" khi không hỏi được (YouTube chặn / video riêng tư).

    BẪY đã trả giá: gộp hai trường hợp "không có tiếng Trung" và "bị chặn" làm một khiến cả bộ 200
    tập bị vứt chỉ vì mạng chập lúc kiểm (Tuyệt Thế Đường Môn, Tiên Nghịch, Già Thiên mất sạch dù
    kênh có phụ đề tay).
    """
    want = ("zh", "cmn", "yue")
    try:
        http = yt_transcript._session()
        pr = yt_transcript._player_response(video_id, http)
        tracks = (((pr.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}).get("captionTracks")) or []
        zh = [t for t in tracks if str(t.get("languageCode", "")).startswith(want)]
        manual = [t for t in zh if t.get("kind") != "asr"]
        if manual:
            return manual[0]["languageCode"], False
        if zh:
            return zh[0]["languageCode"], True
        if tracks:
            return None
        # BẪY: trả lời được mà KHÔNG có track nào = video thật sự không có phụ đề, đừng nhầm với
        # "bị chặn" (Tiên Nghịch từng giữ 113 tập của một kênh không gắn phụ đề vì nhầm chỗ này).
        if pr.get("playabilityStatus") or pr.get("videoDetails"):
            return None
    except Exception:  # noqa: BLE001
        pass
    try:
        tracks2 = list(YouTubeTranscriptApi().list(video_id))
    except Exception:  # noqa: BLE001
        return "blocked"
    manual2 = [t for t in tracks2 if not t.is_generated and t.language_code.startswith(want)]
    if manual2:
        return manual2[0].language_code, False
    auto = [t for t in tracks2 if t.is_generated and t.language_code.startswith(want)]
    if auto:
        return auto[0].language_code, True
    return None


def season_no(title: str, cn: str = "", en: str = "") -> int:
    """Mùa mấy, đọc từ tên danh sách phát.

    BẪY đã trả giá: chỉ bắt "第N季"/"Season N" thì "沧元图2" và "The Demon Hunter2" đều thành mùa 1,
    nên hai mùa sau của Thương Nguyên Đồ bị bỏ (36 tập thay vì 93). Số đứng NGAY SAU tên phim cũng
    là số mùa.
    """
    m = re.search(r"第\s*([一二三四五六七八九十\d]{1,3})\s*季", title)
    if m:
        raw = m.group(1)
        if raw.isdigit():
            return int(raw)
        return {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}.get(raw, 1)
    m = re.search(r"\b(?:S|Season)\s*(\d{1,2})\b", title, re.I)
    if m:
        return int(m.group(1))
    # số dính ngay sau tên phim: 沧元图2 · The Demon Hunter2 · Soul Land 2
    for name in (cn, en):
        if not name:
            continue
        m = re.search(re.escape(name) + r"\s*([2-9])(?!\d)", title, re.I)
        if m:
            return int(m.group(1))
    return 1


def episodes_of(vids: list[dict], season: int, cn: str, en: str) -> list[dict]:
    """Lọc lấy TẬP PHIM THẬT trong một danh sách phát.

    BẪY đã trả giá: danh sách tên "仙逆" nhưng bên trong trộn phim khác (仙武传, 凡人修仙传) và cả
    chương truyện audio dài 5 tiếng — ra "7 tập" rác. Hai chốt:
      · độ dài 4–45 phút (dài hơn là truyện audio / tổng hợp nhiều tập);
      · tên video phải có tên bộ phim. Nếu chưa tới nửa số video khớp tên thì bỏ chốt này, vì có
        danh sách dùng chữ phồn thể (滄元圖) hoặc chỉ đặt tên tiếng Anh.
    """
    named = 0
    numbered: list[tuple[int, dict]] = []
    for v in vids:
        if JUNK.search(v["title"]):
            continue
        n = episode_no(v["title"])
        if n is None or not (240 <= v["duration"] <= 2700):
            continue
        has_name = (cn and cn in v["title"]) or (en and en.lower() in v["title"].lower())
        if has_name:
            named += 1
        numbered.append((n, v))
    use_name = named >= len(numbered) / 2 and named > 0
    rows: dict[int, dict] = {}
    for n, v in numbered:
        if use_name:
            has_name = (cn and cn in v["title"]) or (en and en.lower() in v["title"].lower())
            if not has_name:
                continue
        rows.setdefault(n, {**v, "ep": n, "season": season})
    return [rows[n] for n in sorted(rows)]


def _other_names() -> dict[str, tuple[str, ...]]:
    """Với mỗi bộ: tên chữ Hán của những bộ KHÁC mà tên bộ này là một phần (dễ lẫn danh sách)."""
    out: dict[str, tuple[str, ...]] = {}
    names = [row[1] for row in SERIES]
    for cn in names:
        out[cn] = tuple(n for n in names if n != cn and cn in n)
    return out


OTHER_NAMES = _other_names()


def pick_playlists(cn: str, en: str) -> list[dict]:
    """MỌI danh sách phát đáng thử của bộ phim, xếp mùa rồi tới điểm cao.

    KHÔNG chốt ngay một danh sách cho mỗi mùa: danh sách nhiều tập nhất có thể là kênh đăng lại
    KHÔNG CÓ phụ đề (Tuyệt Thế Đường Môn từng bị vậy — 200 tập không track nào). `main` sẽ thử lần
    lượt tới khi gặp danh sách thật sự có phụ đề tiếng Trung.
    """
    cands: dict[str, dict] = {}
    for q in (
        f"{cn} 腾讯视频 动漫",  # kênh chính chủ hay gắn phụ đề tiếng Trung nhất
        f"{cn} 动画 全集",
        f"{cn} EP ENG SUB",
        f"{en} full episodes" if en else "",
        f"{cn} 第二季",
        f"{cn} 优酷 动漫",
    ):
        if not q.strip():
            continue
        for p in find_playlists(q):
            cands.setdefault(p["playlistId"], p)
        time.sleep(2.0)
    good: list[dict] = []
    for p in list(cands.values())[:18]:
        name_ok = cn[:3] in p["title"] or (en and en.lower() in p["title"].lower())
        if not name_ok:
            continue
        # BẪY: tên bộ này là tiền tố của bộ khác (斗罗大陆 vs 斗罗大陆Ⅱ绝世唐门) nên danh sách của
        # phần sau lọt vào phần trước, cùng một tập nằm ở hai bộ.
        if any(other and other in p["title"] for other in OTHER_NAMES.get(cn, ())):
            print(f"    bỏ qua {p['title'][:46]} (thuộc bộ khác)")
            continue
        if BAD_PLAYLIST.search(p["title"]):
            print(f"    bỏ qua {p['title'][:46]} (truyện audio / bình luận, không phải phim)")
            continue
        vids = playlist_videos(p["playlistId"], max_pages=1)
        numbered = [v for v in vids if episode_no(v["title"]) and not JUNK.search(v["title"])]
        score = len(numbered)
        print(f"    ứng viên {p['playlistId']} · {p['title'][:46]} · {len(vids)} video, {score} có số tập")
        if score >= 8:
            good.append({**p, "score": score, "season": season_no(p["title"], cn, en), "cnName": cn[:3] in p["title"]})
    # cùng một mùa: danh sách có TÊN CHỮ HÁN (kênh chính chủ) đứng trước, rồi mới tới nhiều tập
    good.sort(key=lambda x: (x["season"], not x["cnName"], -x["score"]))
    return good


def probe_season(eps: list[dict], sample: int) -> tuple[list[tuple[str, bool]], int]:
    """Kiểm mẫu vài tập. Trả (những tập có phụ đề tiếng Trung, số tập không hỏi được)."""
    step = max(1, len(eps) // sample)
    probe = eps[::step][:sample]
    hits: list[tuple[str, bool]] = []
    blocked = 0
    for e in probe:
        res = captions_of(e["id"])
        time.sleep(0.8)
        if res == "blocked":
            blocked += 1
            continue
        if res:
            hits.append(res)  # type: ignore[arg-type]
            e["captions"], e["generated"], e["checked"] = res[0], res[1], True
    return hits, blocked


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--no-check" not in sys.argv
    sample = 5
    for a in sys.argv[1:]:
        if a.startswith("--sample="):
            sample = max(1, int(a.split("=", 1)[1]))
    old: dict = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            old = {}
    old_series = {s["id"]: s for s in old.get("series", [])}
    old_eps: dict[str, list[dict]] = old.get("episodes", {})

    series_out: list[dict] = []
    eps_out: dict[str, list[dict]] = {}

    for key, cn, vi, en, level, blurb in SERIES:
        if args and not any(a.lower() in f"{key} {cn} {vi} {en}".lower() for a in args):
            if key in old_series:
                series_out.append(old_series[key])
                eps_out[key] = old_eps.get(key, [])
            continue
        print(f"\n=== {vi} ({cn})")
        # Đã dựng lần trước thì dùng lại đúng danh sách phát đó: vừa nhanh vừa khỏi bị YouTube
        # chặn vì tìm kiếm quá nhiều. `--rediscover` để bắt tìm lại từ đầu.
        known_lists = (old_series.get(key) or {}).get("seasons") or []
        if known_lists and "--rediscover" not in sys.argv:
            # BẪY: dữ liệu cũ có thể chứa NHIỀU danh sách cùng một mùa (Vũ Động Càn Khôn từng gom 12
            # danh sách truyện audio thành 4.424 "tập"). Mỗi mùa chỉ giữ một.
            seen_season: set[int] = set()
            lists = []
            for x in known_lists:
                if x["season"] in seen_season:
                    continue
                seen_season.add(x["season"])
                lists.append({"playlistId": x["playlistId"], "title": x.get("title", ""), "season": x["season"], "owner": ""})
            print(f"    dùng lại {len(lists)} danh sách phát đã biết")
        else:
            lists = pick_playlists(cn, en)
        if not lists:
            print("    KHÔNG tìm được danh sách phát phù hợp")
            if key in old_series:
                series_out.append(old_series[key])
                eps_out[key] = old_eps.get(key, [])
            continue

        # Thử TỪNG danh sách của mỗi mùa cho tới khi gặp cái thật sự có phụ đề tiếng Trung.
        # BẪY đã trả giá: chọn sẵn danh sách nhiều tập nhất thì Tuyệt Thế Đường Môn lấy phải kênh
        # đăng lại KHÔNG có track phụ đề nào — 200 tập vô dụng.
        by_season: dict[int, list[dict]] = {}
        for pl in lists:
            by_season.setdefault(pl["season"], []).append(pl)
        known = {e["id"]: e for e in old_eps.get(key, [])}

        seasons: list[dict] = []
        eps: list[dict] = []
        for season in sorted(by_season):
            picked: tuple[dict, list[dict]] | None = None
            fallback: tuple[dict, list[dict]] | None = None
            for pl in by_season[season]:
                print(f"    mùa {season}: thử {pl['playlistId']} · {pl['title'][:50]}")
                vids = playlist_videos(pl["playlistId"])
                mine = episodes_of(vids, season, cn, en)
                print(f"        {len(vids)} video → {len(mine)} tập")
                if not mine:
                    continue
                for e in mine:
                    hit = known.get(e["id"])
                    if hit and hit.get("checked"):
                        e["captions"], e["generated"], e["checked"] = hit.get("captions", ""), hit.get("generated", False), True
                if not check:
                    for e in mine:
                        e.setdefault("captions", "zh")
                        e.setdefault("generated", False)
                        e.setdefault("checked", False)
                    picked = (pl, mine)
                    break

                fresh = [e for e in mine if not e.get("checked")]
                hits, blocked = probe_season(fresh or mine, sample)
                note = f" ({blocked} tập không hỏi được)" if blocked else ""
                print(f"        mẫu {len(hits)}/{min(sample, len(fresh or mine))} có phụ đề tiếng Trung{note}")
                if hits:
                    code, gen = hits[0]
                    for e in mine:
                        e.setdefault("captions", code)
                        e.setdefault("generated", gen)
                        e.setdefault("checked", False)
                    picked = (pl, mine)
                    break
                if blocked and not fallback:
                    fallback = (pl, mine)  # bị chặn thì tạm giữ, còn hơn mất cả mùa
                print("        -> danh sách này không có phụ đề tiếng Trung, thử danh sách khác")

            use = picked or fallback
            if not use:
                print(f"    mùa {season}: bỏ (không danh sách nào có phụ đề tiếng Trung)")
                continue
            if not picked:
                print(f"    mùa {season}: chỉ bị chặn lúc kiểm, tạm giữ và đánh dấu chưa kiểm")
                for e in use[1]:
                    e.setdefault("captions", "zh")
                    e.setdefault("generated", False)
                    e.setdefault("checked", False)
            pl, mine = use
            seasons.append({"season": season, "playlistId": pl["playlistId"], "title": pl["title"], "count": len(mine)})
            eps.extend(mine)

        eps.sort(key=lambda e: (e["season"], e["ep"]))
        if not eps:
            print("    KHÔNG có tập nào dùng được")
            continue
        print(f"    giữ {len(eps)} tập qua {len(seasons)} mùa")

        for sea in seasons:
            sea["count"] = sum(1 for e in eps if e["season"] == sea["season"])
        seasons = [sea for sea in seasons if sea["count"]]
        series_out.append(
            {
                "id": key,
                "cn": cn,
                "vi": vi,
                "en": en,
                "level": level,
                "blurb": blurb,
                "seasons": seasons,
                "channel": lists[0].get("owner", ""),
                "count": len(eps),
                "firstEp": eps[0]["ep"],
                "lastEp": eps[-1]["ep"],
                "poster": eps[0]["id"],
            }
        )
        eps_out[key] = eps

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generatedAt": time.strftime("%Y-%m-%d"),
                "note": "Phim thuộc bản quyền của từng kênh; Subloop chỉ nhúng qua trình phát YouTube chính thức. Danh sách tập lấy từ danh sách phát công khai, mỗi tập đã kiểm tra là có phụ đề tiếng Trung.",
                "series": series_out,
                "episodes": eps_out,
            },
            f,
            ensure_ascii=False,
            indent=1,
        )
    for key, rows in eps_out.items():
        if len(rows) > 800:
            print(f"CẢNH BÁO: {key} có {len(rows)} tập — gần chắc là danh sách truyện audio, nên chạy lại với --rediscover")
    total = sum(len(v) for v in eps_out.values())
    print(f"\nGhi {len(series_out)} bộ · {total} tập vào {OUT}")


if __name__ == "__main__":
    main()
