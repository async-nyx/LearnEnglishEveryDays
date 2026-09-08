#!/usr/bin/env python3
"""Dựng **bộ từ vựng có sẵn** cho Subloop: frontend/public/data/decks/*.json

Nguồn (đều là nguồn gốc, không chép lại của bên thứ ba):
  · TOEIC Service List 1.2 — Browne, C. & Culligan, B. (2016), 1.200 từ dựng từ kho ngữ liệu 1,5
    triệu từ của tài liệu luyện TOEIC; cùng NGSL phủ 98,5% từ trong đề TOEIC. CC BY-SA 4.0.
    https://www.newgeneralservicelist.com/toeic-service-list
  · Business Service List 1.2 — cùng nhóm tác giả, 1.700 từ tiếng Anh thương mại. CC BY-SA 4.0.
    https://www.newgeneralservicelist.com/business-service-list
  · HSK 1–4 — lấy từ kho từ của chính mình ở `chinese-vocab/supabase/catalog/*.sql`
    (chữ Hán, pinyin, nghĩa tiếng Việt, loại từ, câu ví dụ kèm pinyin và nghĩa).

Nghĩa tiếng Việt của từ tiếng Anh dịch bằng chính đường dịch của app (clients5), có nhớ lại ở
cache/decks_vi.json để chạy lại không tốn thời gian.

  py scripts/build_decks.py            (tất cả)
  py scripts/build_decks.py toeic      (chỉ TOEIC + BSL)
  py scripts/build_decks.py hsk        (chỉ HSK)
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "frontend", "public", "data", "decks")
INDEX = os.path.join(ROOT, "frontend", "src", "data", "decks.json")
CACHE_VI = os.path.join(ROOT, "cache", "decks_vi.json")
CHINESE_VOCAB = os.path.join(os.path.dirname(ROOT), "chinese-vocab", "supabase", "catalog")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": UA})

SOURCES = {
    "tsl": "https://www.newgeneralservicelist.com/s/TSL_12_stats.csv",
    "bsl": "https://www.newgeneralservicelist.com/s/BSL_120_stats.csv",
    # cùng nhóm tác giả: định nghĩa tiếng Anh dễ hiểu cho từng từ TSL
    "tsl_def": "https://www.newgeneralservicelist.com/s/TSL_12_definitions.xlsx",
}


def load_definitions() -> dict[str, str]:
    """Định nghĩa tiếng Anh của TSL. Thiếu openpyxl thì bỏ qua chứ đừng làm hỏng cả mẻ."""
    path = os.path.join(ROOT, "cache", "tsl_definitions.xlsx")
    if not os.path.exists(path) or os.path.getsize(path) < 10_000:
        try:
            r = HTTP.get(SOURCES["tsl_def"], timeout=60)
            r.raise_for_status()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, "wb").write(r.content)
        except Exception as e:  # noqa: BLE001
            print(f"    không tải được định nghĩa: {e}")
            return {}
    try:
        import openpyxl  # noqa: PLC0415
    except ImportError:
        print("    thiếu openpyxl (pip install openpyxl) — bỏ phần định nghĩa")
        return {}
    out: dict[str, str] = {}
    ws = openpyxl.load_workbook(path, read_only=True).active
    for row in ws.iter_rows(min_row=2, values_only=True):
        word = str(row[0] or "").strip().lower()
        definition = str(row[1] or "").strip()
        if word and definition:
            out[word] = definition
    print(f"    có định nghĩa tiếng Anh cho {len(out)} từ")
    return out


# ---------------------------------------------------------------- nghĩa tiếng Việt
def load_cache() -> dict[str, str]:
    try:
        return json.load(open(CACHE_VI, encoding="utf-8"))
    except Exception:
        return {}


def save_cache(cache: dict[str, str]) -> None:
    os.makedirs(os.path.dirname(CACHE_VI), exist_ok=True)
    json.dump(cache, open(CACHE_VI, "w", encoding="utf-8"), ensure_ascii=False)


def translate_en(word: str) -> str:
    """Nghĩa tiếng Việt của một từ tiếng Anh (clients5 — cùng nguồn app đang dùng)."""
    try:
        r = HTTP.get(
            "https://clients5.google.com/translate_a/t",
            params={"client": "dict-chrome-ex", "sl": "en", "tl": "vi", "q": word},
            timeout=10,
        )
        data = r.json()
        if isinstance(data, list) and data:
            first = data[0]
            return (first[0] if isinstance(first, list) else first) or ""
    except Exception:  # noqa: BLE001
        pass
    return ""


def fill_meanings(words: list[str], cache: dict[str, str]) -> None:
    todo = [w for w in words if not cache.get(w)]
    print(f"    dịch {len(todo)} từ mới (đã có {len(words) - len(todo)})…")
    done = 0
    with ThreadPoolExecutor(max_workers=5) as pool:
        for word, vi in zip(todo, pool.map(translate_en, todo)):
            cache[word] = vi
            done += 1
            if done % 200 == 0:
                print(f"      {done}/{len(todo)}")
                save_cache(cache)
    save_cache(cache)


# ---------------------------------------------------------------- TOEIC / BSL
def read_stats(path: str) -> list[str]:
    """Cột đầu là từ; bỏ dòng chú thích và ô rỗng, giữ nguyên THỨ TỰ TẦN SUẤT."""
    out: list[str] = []
    # BẪY: tệp của họ có ký tự Latin-1 lẫn vào (café…), mở utf-8 là chết ngay dòng 20.
    with open(path, encoding="utf-8-sig", newline="", errors="replace") as f:
        for row in csv.reader(f):
            if not row:
                continue
            word = (row[0] or "").strip().lower()
            if not word or word.startswith("#") or word == "word":
                continue
            if not re.fullmatch(r"[a-z][a-z'\-. ]*", word):
                continue
            out.append(word)
    return out


def download(name: str) -> str:
    path = os.path.join(ROOT, "cache", f"{name}.csv")
    if os.path.exists(path) and os.path.getsize(path) > 10_000:
        return path
    print(f"    tải {SOURCES[name]}")
    r = HTTP.get(SOURCES[name], timeout=60)
    r.raise_for_status()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(r.content)
    return path


def build_en(cache: dict[str, str]) -> list[dict]:
    decks: list[dict] = []
    plans = [
        ("toeic-tsl", "TOEIC Service List", "1.200 từ dựng từ kho ngữ liệu đề TOEIC thật; học hết là đọc hiểu được gần trọn đề.",
         "tsl", 200, "Browne, C. & Culligan, B. (2016) · TOEIC Service List 1.2 · CC BY-SA 4.0"),
        ("business-bsl", "Tiếng Anh thương mại", "1.700 từ hay gặp trong email, hợp đồng, họp hành — phần Reading của TOEIC dùng rất nhiều.",
         "bsl", 200, "Browne, C., Culligan, B. & Phillips, J. (2013) · Business Service List 1.2 · CC BY-SA 4.0"),
    ]
    for deck_id, title, blurb, src, chunk, credit in plans:
        words = read_stats(download(src))
        print(f"  {title}: {len(words)} từ")
        defs = load_definitions() if src == "tsl" else {}
        fill_meanings(words, cache)
        # dịch luôn phần định nghĩa: nghĩa một từ trần dễ lệch ("refund" ra "đến bù"),
        # có cả câu định nghĩa thì người học hiểu đúng nét nghĩa.
        if defs:
            fill_meanings([defs[w] for w in words if w in defs], cache)
        items = [
            {
                "w": w,
                "vi": cache.get(w, ""),
                "def": defs.get(w, ""),
                "defVi": cache.get(defs.get(w, ""), "") if defs.get(w) else "",
                "rank": i + 1,
                "part": i // chunk + 1,
            }
            for i, w in enumerate(words)
            if cache.get(w)
        ]
        parts = (len(items) + chunk - 1) // chunk
        out = {
            "id": deck_id,
            "lang": "en",
            "title": title,
            "blurb": blurb,
            "credit": credit,
            "chunk": chunk,
            "count": len(items),
            "parts": parts,
            "items": items,
        }
        json.dump(out, open(os.path.join(OUT_DIR, f"{deck_id}.json"), "w", encoding="utf-8"), ensure_ascii=False)
        decks.append({k: out[k] for k in ("id", "lang", "title", "blurb", "credit", "count", "parts")})
        print(f"    ghi {len(items)} từ, {parts} chặng")
    return decks


# ---------------------------------------------------------------- HSK
ROW_RE = re.compile(
    r"\('(?P<deck>hsk\d)',\s*'(?P<zh>(?:[^']|'')*)',\s*'(?P<pinyin>(?:[^']|'')*)',\s*'(?:[^']|'')*',\s*"
    r"array\[(?P<meanings>.*?)\]::text\[\],\s*'(?P<pos>(?:[^']|'')*)',\s*"
    r"'(?P<ex>(?:[^']|'')*)',\s*'(?P<ex_pinyin>(?:[^']|'')*)',\s*'(?P<ex_vi>(?:[^']|'')*)'",
    re.S,
)


def unquote(s: str) -> str:
    return s.replace("''", "'")


def build_hsk() -> list[dict]:
    if not os.path.isdir(CHINESE_VOCAB):
        print(f"  KHÔNG thấy {CHINESE_VOCAB} — bỏ qua HSK")
        return []
    rows: dict[str, list[dict]] = {}
    for name in sorted(os.listdir(CHINESE_VOCAB)):
        if not name.endswith(".sql") or name.startswith("000"):
            continue
        text = open(os.path.join(CHINESE_VOCAB, name), encoding="utf-8").read()
        for m in ROW_RE.finditer(text):
            deck = m.group("deck")
            meanings = [unquote(x.strip().strip("'")) for x in re.findall(r"'((?:[^']|'')*)'", m.group("meanings"))]
            rows.setdefault(deck, []).append(
                {
                    "w": unquote(m.group("zh")),
                    "pinyin": unquote(m.group("pinyin")),
                    "vi": ", ".join(meanings),
                    "pos": unquote(m.group("pos")),
                    "ex": unquote(m.group("ex")),
                    "exPinyin": unquote(m.group("ex_pinyin")),
                    "exVi": unquote(m.group("ex_vi")),
                }
            )
    decks: list[dict] = []
    for level in ("hsk1", "hsk2", "hsk3", "hsk4"):
        items = rows.get(level, [])
        if not items:
            print(f"  {level}: không có từ nào")
            continue
        for i, it in enumerate(items):
            it["rank"] = i + 1
            it["part"] = i // 50 + 1
        parts = (len(items) + 49) // 50
        out = {
            "id": level,
            "lang": "zh",
            "title": f"HSK {level[-1]}",
            "blurb": f"{len(items)} từ bậc HSK {level[-1]} — có pinyin, nghĩa tiếng Việt và câu ví dụ.",
            "credit": "Kho từ HSK của chính bạn (dự án chinese-vocab)",
            "chunk": 50,
            "count": len(items),
            "parts": parts,
            "items": items,
        }
        json.dump(out, open(os.path.join(OUT_DIR, f"{level}.json"), "w", encoding="utf-8"), ensure_ascii=False)
        decks.append({k: out[k] for k in ("id", "lang", "title", "blurb", "credit", "count", "parts")})
        print(f"  {level}: {len(items)} từ, {parts} chặng")
    return decks


def write_zh_words() -> None:
    """Danh sách từ tiếng Trung để phiên âm GHÉP theo từ (水果 -> "shuǐguǒ", không phải "shuǐ guǒ").

    Gộp từ trong các bộ HSK vừa dựng + thuật ngữ tiên hiệp; đủ để cắt nhịp câu phụ đề.
    """
    words: set[str] = set()
    for name in os.listdir(OUT_DIR):
        if not name.startswith("hsk") or not name.endswith(".json"):
            continue
        data = json.load(open(os.path.join(OUT_DIR, name), encoding="utf-8"))
        for it in data.get("items", []):
            w = it.get("w", "")
            if len(w) >= 2 and all("一" <= c <= "鿿" for c in w):
                words.add(w)
    xia = os.path.join(ROOT, "frontend", "src", "data", "xianxia.json")
    if os.path.exists(xia):
        g = json.load(open(xia, encoding="utf-8"))
        for w in g.get("terms", {}):
            if len(w) >= 2:
                words.add(w)
        for group in g.get("names", {}).values():
            for w in group:
                if len(w) >= 2:
                    words.add(w)
    out = os.path.join(ROOT, "frontend", "public", "data", "zh-words.json")
    json.dump(sorted(words), open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  {len(words)} từ tiếng Trung cho phiên âm → {out}")


def main() -> None:
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    os.makedirs(OUT_DIR, exist_ok=True)
    cache = load_cache()
    decks: list[dict] = []
    if only in ("", "toeic"):
        decks += build_en(cache)
    if only in ("", "hsk"):
        decks += build_hsk()
    if only:  # giữ lại phần không dựng lần này
        try:
            old = json.load(open(INDEX, encoding="utf-8")).get("decks", [])
            have = {d["id"] for d in decks}
            decks += [d for d in old if d["id"] not in have]
        except Exception:  # noqa: BLE001
            pass
    write_zh_words()
    order = ["toeic-tsl", "business-bsl", "hsk1", "hsk2", "hsk3", "hsk4"]
    decks.sort(key=lambda d: order.index(d["id"]) if d["id"] in order else 99)
    json.dump(
        {"generatedAt": time.strftime("%Y-%m-%d"), "decks": decks},
        open(INDEX, "w", encoding="utf-8"),
        ensure_ascii=False,
        indent=1,
    )
    print(f"\nGhi {len(decks)} bộ từ vào {OUT_DIR} và {INDEX}")


if __name__ == "__main__":
    main()
