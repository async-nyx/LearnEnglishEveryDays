#!/usr/bin/env python3
"""Subloop — backend Flask.

Phục vụ bản build React ở frontend/dist và cung cấp 3 API:
  POST /api/transcript   lấy phụ đề YouTube
  GET  /api/translate    dịch từ/câu (Google Translate gtx, không cần khoá)
  GET  /api/define       tra từ điển Anh-Anh (dictionaryapi.dev) + IPA + audio
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
import sqlite3
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlparse

import requests
from flask import Flask, jsonify, request, send_from_directory
import yt_transcript
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, "frontend", "dist")
ASSETS_DIR = os.path.join(BASE_DIR, "frontend", "public", "media")  # ảnh dùng chung với bản Cloudflare Pages
CACHE_DIR = os.path.join(BASE_DIR, "cache")
os.makedirs(os.path.join(CACHE_DIR, "tts"), exist_ok=True)
IMAGE_DIR = os.path.join(ASSETS_DIR, "vocabulary", "en")

app = Flask(__name__, static_folder=None)
mimetypes.add_type("image/webp", ".webp")  # Windows không biết webp -> octet-stream

HTTP = requests.Session()
HTTP.headers.update({"User-Agent": "Mozilla/5.0 (Subloop learning app)"})


# ---------------------------------------------------------------- cache bền (SQLite)
# Mọi kết quả tra/dịch ghi xuống đĩa: lần sau (kể cả sau khi khởi động lại) trả về tức thì.
_DB_LOCK = threading.Lock()
_DB = sqlite3.connect(os.path.join(CACHE_DIR, "cache.sqlite"), check_same_thread=False)
_DB.execute("CREATE TABLE IF NOT EXISTS kv (ns TEXT, k TEXT, v TEXT, ts REAL, PRIMARY KEY (ns, k))")
_DB.commit()


def cache_get(ns: str, key: str, max_age: float | None = None):
    with _DB_LOCK:
        row = _DB.execute("SELECT v, ts FROM kv WHERE ns=? AND k=?", (ns, key)).fetchone()
    if not row:
        return None
    if max_age is not None and time.time() - row[1] > max_age:
        return None
    try:
        return json.loads(row[0])
    except Exception:
        return None


def cache_set(ns: str, key: str, value) -> None:
    with _DB_LOCK:
        _DB.execute(
            "INSERT OR REPLACE INTO kv (ns, k, v, ts) VALUES (?, ?, ?, ?)",
            (ns, key, json.dumps(value, ensure_ascii=False), time.time()),
        )
        _DB.commit()


POOL = ThreadPoolExecutor(max_workers=16)


# ---------------------------------------------------------------- helpers
def extract_video_id(url_or_id: str) -> str | None:
    s = url_or_id.strip()
    if re.fullmatch(r"[a-zA-Z0-9_-]{11}", s):
        return s
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/v/|youtube\.com/shorts/|youtube\.com/live/)([a-zA-Z0-9_-]{11})",
        r"youtube\.com/watch\?.*v=([a-zA-Z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, s)
        if m:
            return m.group(1)
    try:
        parsed = urlparse(s)
        if "youtu.be" in parsed.netloc:
            return parsed.path.lstrip("/").split("?")[0][:11]
        qs = parse_qs(parsed.query)
        if "v" in qs:
            return qs["v"][0][:11]
    except Exception:
        pass
    return None


def format_time(seconds: float) -> str:
    s = int(seconds)
    h, m, sec = s // 3600, (s % 3600) // 60, s % 60
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def fetch_oembed(video_id: str) -> dict:
    try:
        r = HTTP.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
            timeout=6,
        )
        if r.ok:
            d = r.json()
            return {
                "title": d.get("title"),
                "author": d.get("author_name"),
                "thumbnail": d.get("thumbnail_url"),
            }
    except Exception:
        pass
    return {
        "title": None,
        "author": None,
        "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
    }


# ---------------------------------------------------------------- transcript
@app.route("/api/transcript", methods=["POST"])
def get_transcript():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    preferred = data.get("languages") or ["en", "en-US", "en-GB"]

    if not url:
        return jsonify({"success": False, "error": "Vui lòng nhập liên kết YouTube."}), 400

    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({"success": False, "error": "Không nhận diện được mã video từ liên kết."}), 400

    try:
        api = yt_transcript.api()
        fetched = None
        available = []

        try:
            transcript_list = api.list(video_id)
            for t in transcript_list:
                available.append(
                    {"code": t.language_code, "name": t.language, "generated": t.is_generated}
                )
        except Exception:
            transcript_list = None

        try:
            fetched = api.fetch(video_id, languages=preferred)
        except NoTranscriptFound:
            if transcript_list is not None:
                # Ưu tiên đúng tiếng đã xin, rồi tiếng Anh, rồi bất kỳ.
                roots = []
                for code in preferred:
                    root = code.split("-")[0]
                    if root not in roots:
                        roots.append(root)
                for prefix in (*roots, "en", ""):
                    for t in transcript_list:
                        if t.language_code.startswith(prefix):
                            try:
                                fetched = t.fetch()
                                break
                            except Exception:
                                continue
                    if fetched is not None:
                        break

        if fetched is None:
            alt = _innertube_payload(video_id, preferred, available)
            if alt is not None:
                return alt
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Video này chưa có phụ đề nào để lấy.",
                        "available": available,
                    }
                ),
                400,
            )

        segments = []
        for snip in fetched:
            text = re.sub(r"\s+", " ", snip.text.replace("\n", " ")).strip()
            text = re.sub(r"\[[^\]]*\]", "", text).strip()  # bỏ [Music], [Applause]
            if not text:
                continue
            segments.append(
                {
                    "start": round(float(snip.start), 3),
                    "duration": round(float(snip.duration), 3),
                    "text": text,
                    "timestamp": format_time(snip.start),
                }
            )

        meta = fetch_oembed(video_id)

        return jsonify(
            {
                "success": True,
                "video_id": video_id,
                "title": meta["title"],
                "author": meta["author"],
                "thumbnail": meta["thumbnail"],
                "language": getattr(fetched, "language", None),
                "language_code": getattr(fetched, "language_code", None),
                "is_generated": getattr(fetched, "is_generated", None),
                "available": available,
                "segments": segments,
                "segment_count": len(segments),
            }
        )

    except TranscriptsDisabled:
        return jsonify({"success": False, "error": "Video này đã tắt phụ đề."}), 400
    except VideoUnavailable:
        return jsonify({"success": False, "error": "Video không tồn tại hoặc không công khai."}), 400
    except Exception as e:  # noqa: BLE001
        # BẪY: YouTube chặn IP thì thư viện ném lỗi dài loằng ngoằng. Thử đường innertube (client
        # điện thoại) trước, vẫn hỏng thì nói rõ nguyên nhân và cách cắm proxy.
        alt = _innertube_payload(video_id, preferred, [])
        if alt is not None:
            return alt
        if yt_transcript.is_blocked(e):
            return jsonify({"success": False, "error": yt_transcript.BLOCKED_HINT, "blocked": True}), 429
        return jsonify({"success": False, "error": f"Lỗi máy chủ: {e}"}), 500


def _innertube_payload(video_id: str, preferred: list[str], available: list[dict]):
    """Đường dự phòng khi `youtube_transcript_api` bị chặn. None = cũng không lấy được."""
    try:
        segments, track, found = yt_transcript.fetch_via_innertube(video_id, preferred)
    except Exception:  # noqa: BLE001
        return None
    if not segments:
        return None
    meta = fetch_oembed(video_id)
    return jsonify(
        {
            "success": True,
            "video_id": video_id,
            "title": meta["title"],
            "author": meta["author"],
            "thumbnail": meta["thumbnail"],
            "language": (track.get("name", {}) or {}).get("simpleText") or track.get("languageCode"),
            "language_code": track.get("languageCode"),
            "is_generated": track.get("kind") == "asr",
            "available": found or available,
            "segments": [
                {
                    "start": round(float(x["start"]), 3),
                    "duration": round(float(x["duration"]), 3),
                    "text": x["text"],
                    "timestamp": format_time(x["start"]),
                }
                for x in segments
            ],
            "segment_count": len(segments),
            "source": "innertube",
        }
    )


# ---------------------------------------------------------------- translate
CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)


def _via_clients5(q: str, sl: str, tl: str) -> tuple[str, str]:
    r = HTTP.get(
        "https://clients5.google.com/translate_a/t",
        params={"client": "dict-chrome-ex", "sl": sl, "tl": tl, "q": q},
        headers={"User-Agent": CHROME_UA},
        timeout=8,
    )
    r.raise_for_status()
    raw = r.json()
    if not isinstance(raw, list) or not raw:
        raise ValueError("clients5 trả về rỗng")
    first = raw[0]
    if isinstance(first, list):
        return (str(first[0]) if first else ""), (first[1] if len(first) > 1 and isinstance(first[1], str) else sl)
    return str(first), sl


def _via_gtx(q: str, sl: str, tl: str) -> tuple[str, str]:
    r = HTTP.get(
        "https://translate.googleapis.com/translate_a/single",
        params={"client": "gtx", "sl": sl, "tl": tl, "dt": "t", "q": q},
        headers={"User-Agent": CHROME_UA},
        timeout=8,
    )
    r.raise_for_status()
    if not r.headers.get("content-type", "").startswith("application/json"):
        raise ValueError("gtx bị chặn")
    raw = r.json()
    text = "".join(part[0] for part in raw[0] if part and part[0])
    detected = raw[2] if len(raw) > 2 and isinstance(raw[2], str) else sl
    return text, detected


def _via_mymemory(q: str, sl: str, tl: str) -> tuple[str, str]:
    src = "en" if sl == "auto" else sl
    r = HTTP.get(
        "https://api.mymemory.translated.net/get",
        params={"q": q[:500], "langpair": f"{src}|{tl}"},
        timeout=8,
    )
    r.raise_for_status()
    data = r.json()
    text = (data.get("responseData") or {}).get("translatedText") or ""
    if not text or data.get("responseStatus") not in (200, "200"):
        raise ValueError("MyMemory không có bản dịch")
    return text, src


def _translate_cached(q: str, sl: str, tl: str) -> dict:
    """Dịch với chuỗi dự phòng: clients5 (ổn định, ~0,3 s) -> gtx -> MyMemory. Kết quả ghi đĩa."""
    key = f"{sl}|{tl}|{q}"
    hit = cache_get("translate", key)
    if hit:
        return hit
    errors: list[str] = []
    for fn in (_via_clients5, _via_gtx, _via_mymemory):
        try:
            text, detected = fn(q, sl, tl)
            if text:
                out = {"text": text, "alternatives": [], "detected": detected}
                cache_set("translate", key, out)
                return out
        except Exception as e:  # noqa: BLE001
            errors.append(f"{fn.__name__}: {e}")
    raise RuntimeError(" | ".join(errors))


@app.route("/api/translate")
def translate():
    q = (request.args.get("q") or "").strip()
    sl = request.args.get("sl", "auto")
    tl = request.args.get("tl", "vi")
    if not q:
        return jsonify({"success": False, "error": "Thiếu tham số q."}), 400
    if len(q) > 2000:
        return jsonify({"success": False, "error": "Đoạn cần dịch quá dài."}), 400
    try:
        return jsonify({"success": True, **_translate_cached(q, sl, tl)})
    except Exception as e:  # noqa: BLE001
        return jsonify({"success": False, "error": f"Không dịch được: {e}"}), 502


# ---------------------------------------------------------------- dictionary
_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    return re.sub(r"\s+", " ", _TAG_RE.sub("", text or "")).strip()


# ARPAbet (Datamuse `md=r`) -> IPA. Trọng âm 1 -> ˈ đặt trước nguyên âm đó (xấp xỉ, đủ để đọc).
_ARPA = {
    "AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "EH": "ɛ", "ER": "ɝ",
    "EY": "eɪ", "IH": "ɪ", "IY": "i", "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ", "UW": "u",
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "dʒ", "K": "k",
    "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "r", "S": "s", "SH": "ʃ", "T": "t",
    "TH": "θ", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ",
}


_VOWELS = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}


def arpabet_to_ipa(pron: str) -> str:
    """ARPAbet -> IPA. Dấu trọng âm đặt ở ĐẦU âm tiết (trước cụm phụ âm dẫn vào nguyên âm có trọng
    âm), từ một âm tiết thì không đánh trọng âm — đúng lệ viết phiên âm của từ điển."""
    toks = []
    for tok in pron.split():
        m = re.match(r"([A-Z]+)([012])?$", tok)
        if m:
            toks.append((m.group(1), m.group(2)))
    n_vowels = sum(1 for b, _ in toks if b in _VOWELS)
    out: list[str] = []
    syllable_start = 0  # vị trí trong `out` nơi âm tiết hiện tại bắt đầu
    for base, stress in toks:
        ipa = _ARPA.get(base, base.lower())
        if base == "AH" and stress == "0":
            ipa = "ə"
        if base in _VOWELS:
            if n_vowels > 1 and stress in ("1", "2"):
                out.insert(syllable_start, "ˈ" if stress == "1" else "ˌ")
            out.append(ipa)
            syllable_start = len(out)  # phụ âm sau nguyên âm tính vào âm tiết kế
        else:
            out.append(ipa)
    return f"/{''.join(out)}/" if out else ""


_POS = {"n": "noun", "v": "verb", "adj": "adjective", "adv": "adverb", "u": ""}


def _from_datamuse(word: str) -> dict | None:
    """Nguồn NHANH (~0,2 s): định nghĩa WordNet + phiên âm ARPAbet. Không có ví dụ."""
    hit = cache_get("datamuse2", word)
    if hit is not None:
        return hit or None
    r = HTTP.get(
        "https://api.datamuse.com/words",
        params={"sp": word, "md": "dpr", "max": 1, "qe": "sp"},
        timeout=5,
    )
    r.raise_for_status()
    rows = r.json()
    row = rows[0] if isinstance(rows, list) and rows else None
    if not row or row.get("word", "").lower() != word or not row.get("defs"):
        cache_set("datamuse2", word, {})
        return None
    grouped: dict[str, list[dict]] = {}
    for d in row.get("defs", []):
        pos, _, text = d.partition("\t")
        grouped.setdefault(_POS.get(pos, pos), []).append({"definition": text.strip(), "example": None})
    pron = next((t[5:] for t in row.get("tags", []) if t.startswith("pron:")), "")
    result = {
        "word": word,
        "phonetic": arpabet_to_ipa(pron),
        "audio": f"/api/tts?q={word}",
        "meanings": [{"pos": pos, "definitions": defs[:3], "synonyms": []} for pos, defs in grouped.items()][:5],
        "source": "datamuse",
    }
    cache_set("datamuse2", word, result)
    return result


def _from_dictionaryapi(word: str) -> dict | None:
    """dictionaryapi.dev: IPA + audio người đọc + ví dụ, nhưng ~20 s/lượt -> chỉ dùng ở đường chậm."""
    r = HTTP.get(f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}", timeout=25)
    if not r.ok:
        return None
    entries = r.json()
    if not isinstance(entries, list) or not entries:
        return None
    return _compact_entry(word, entries)


def _from_wiktionary(word: str) -> dict | None:
    """Wiktionary REST (~5 s): nghĩa theo từ loại + ví dụ, không có IPA/audio."""
    r = HTTP.get(
        f"https://en.wiktionary.org/api/rest_v1/page/definition/{word}",
        headers={"User-Agent": CHROME_UA, "Accept": "application/json"},
        timeout=10,
    )
    if not r.ok:
        return None
    data = r.json()
    en = data.get("en") if isinstance(data, dict) else None
    if not en:
        return None
    meanings = []
    for m in en:
        defs = []
        for d in m.get("definitions", [])[:3]:
            text = _strip_html(d.get("definition", ""))
            if not text:
                continue
            ex = d.get("parsedExamples") or []
            example = _strip_html(ex[0].get("example", "")) if ex else None
            defs.append({"definition": text, "example": example or None})
        if defs:
            meanings.append({"pos": (m.get("partOfSpeech") or "").lower(), "definitions": defs, "synonyms": []})
    if not meanings:
        return None
    return {"word": word, "phonetic": "", "audio": "", "meanings": meanings[:5], "source": "wiktionary"}


def _compact_entry(word: str, entries: list) -> dict:
    phonetic = ""
    audio = ""
    meanings = []
    for e in entries:
        if not phonetic:
            phonetic = e.get("phonetic") or ""
        for p in e.get("phonetics", []):
            if not phonetic and p.get("text"):
                phonetic = p["text"]
            if not audio and p.get("audio"):
                audio = p["audio"]
        for m in e.get("meanings", []):
            defs = []
            for d in m.get("definitions", [])[:3]:
                defs.append({"definition": d.get("definition", ""), "example": d.get("example")})
            meanings.append(
                {
                    "pos": m.get("partOfSpeech", ""),
                    "definitions": defs,
                    "synonyms": (m.get("synonyms") or [])[:6],
                }
            )
    return {
        "word": entries[0].get("word", word),
        "phonetic": phonetic,
        "audio": audio,
        "meanings": meanings[:5],
        "source": "dictionaryapi",
    }


def _lemma_candidates(word: str) -> list[str]:
    """Thử vài dạng gốc đơn giản khi từ điển không có dạng biến thể."""
    cands = [word]
    rules = [
        (r"ies$", "y"),
        (r"ied$", "y"),
        (r"ing$", ""),
        (r"ing$", "e"),
        (r"ed$", ""),
        (r"ed$", "e"),
        (r"es$", ""),
        (r"s$", ""),
        (r"er$", ""),
        (r"est$", ""),
        (r"ly$", ""),
    ]
    for pat, rep_ in rules:
        c = re.sub(pat, rep_, word)
        if c != word and len(c) >= 2 and c not in cands:
            cands.append(c)
    # nhân đôi phụ âm: running -> run, stopped -> stop
    m = re.match(r"^(.*?)([bcdfghjklmnpqrstvwxz])\2(ing|ed)$", word)
    if m:
        c = m.group(1) + m.group(2)
        if c not in cands:
            cands.append(c)
    return cands


def _first_found(fn, cands: list[str]) -> tuple[str, dict | None]:
    """Tra mọi ứng viên SONG SONG, lấy kết quả đầu tiên theo thứ tự ưu tiên."""
    futures = [POOL.submit(_safe, fn, c) for c in cands]
    for cand, fut in zip(cands, futures):
        res = fut.result()
        if res:
            return cand, res
    return cands[0], None


def _safe(fn, *args):
    try:
        return fn(*args)
    except Exception:
        return None


def _clean_word() -> str:
    word = (request.args.get("word") or "").strip().lower()
    return re.sub(r"[^a-z'\-]", "", word)


@app.route("/api/define")
def define():
    """Đường NHANH: Datamuse (định nghĩa + IPA) và âm thanh TTS. Trả về trong ~0,3 s.
    Bản dịch tiếng Việt lấy riêng qua /api/translate; ví dụ/IPA chuẩn lấy sau qua /api/define-full."""
    word = _clean_word()
    if not word:
        return jsonify({"success": False, "error": "Thiếu từ cần tra."}), 400
    lemma, entry = _first_found(_from_datamuse, _lemma_candidates(word))
    if entry is None:
        return jsonify(
            {"success": True, "word": word, "lemma": word, "found": False, "phonetic": "", "audio": f"/api/tts?q={word}", "meanings": []}
        )
    return jsonify({"success": True, "word": word, "lemma": lemma, "found": True, **entry})


@app.route("/api/define-full")
def define_full():
    """Đường CHẬM (tới 25 s lần đầu, sau đó có cache): dictionaryapi.dev rồi Wiktionary."""
    word = _clean_word()
    if not word:
        return jsonify({"success": False, "error": "Thiếu từ cần tra."}), 400
    hit = cache_get("define_full", word)
    if hit is not None:
        return jsonify(hit)
    cands = _lemma_candidates(word)
    lemma, entry = _first_found(_from_dictionaryapi, cands)
    if entry is None:
        lemma, entry = _first_found(_from_wiktionary, cands)
    if entry is None:
        out = {"success": True, "word": word, "lemma": word, "found": False, "phonetic": "", "audio": "", "meanings": []}
    else:
        out = {"success": True, "word": word, "lemma": lemma, "found": True, **entry}
    cache_set("define_full", word, out)
    return jsonify(out)


@app.route("/api/tts")
def tts():
    """Âm thanh đọc từ/câu (Google TTS, ~0,3 s), ghi đĩa để lần sau đọc tại chỗ."""
    q = (request.args.get("q") or "").strip()[:200]
    if not q:
        return jsonify({"success": False, "error": "Thiếu q."}), 400
    slug = re.sub(r"[^a-z0-9]+", "-", q.lower()).strip("-")[:80] or "x"
    path = os.path.join(CACHE_DIR, "tts", f"{slug}.mp3")
    if not os.path.exists(path):
        r = HTTP.get(
            "https://translate.google.com/translate_tts",
            params={"ie": "UTF-8", "q": q, "tl": "en", "client": "tw-ob"},
            headers={"User-Agent": CHROME_UA, "Referer": "https://translate.google.com/"},
            timeout=8,
        )
        if not r.ok or not r.content:
            return jsonify({"success": False, "error": "Không lấy được âm thanh."}), 502
        with open(path, "wb") as f:
            f.write(r.content)
    resp = send_from_directory(os.path.join(CACHE_DIR, "tts"), f"{slug}.mp3", mimetype="audio/mpeg")
    resp.headers["Cache-Control"] = "public, max-age=2592000"
    return resp


# ---------------------------------------------------------------- video YouTube đề xuất
def _lockup(lv: dict) -> dict | None:
    """Giao diện YouTube mới: video đề xuất là lockupViewModel."""
    if lv.get("contentType") != "LOCKUP_CONTENT_TYPE_VIDEO" or not lv.get("contentId"):
        return None
    md = (lv.get("metadata") or {}).get("lockupMetadataViewModel") or {}
    title = ((md.get("title") or {}).get("content") or "").strip()
    rows = ((md.get("metadata") or {}).get("contentMetadataViewModel") or {}).get("metadataRows") or []
    channel = ""
    if rows and rows[0].get("metadataParts"):
        channel = ((rows[0]["metadataParts"][0].get("text") or {}).get("content") or "").strip()
    duration = ""
    for ov in ((lv.get("contentImage") or {}).get("thumbnailViewModel") or {}).get("overlays") or []:
        for b in (ov.get("thumbnailBottomOverlayViewModel") or {}).get("badges") or []:
            t = (b.get("thumbnailBadgeViewModel") or {}).get("text") or ""
            if re.match(r"^\d+:\d\d", t):
                duration = t
    vid = lv["contentId"]
    return {"id": vid, "title": title, "channel": channel, "duration": duration, "thumbnail": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"}


def _walk_compact(o, out: list[dict]) -> None:
    if isinstance(o, dict):
        if "lockupViewModel" in o:
            item = _lockup(o["lockupViewModel"])
            if item:
                out.append(item)
                return
        r = o.get("compactVideoRenderer") or o.get("videoRenderer")
        if r and r.get("videoId"):
            title = r.get("title", {})
            title_text = title.get("simpleText") or "".join(x.get("text", "") for x in title.get("runs", []))
            by = r.get("shortBylineText") or r.get("longBylineText") or r.get("ownerText") or {}
            channel = "".join(x.get("text", "") for x in by.get("runs", [])) or by.get("simpleText", "")
            dur = (r.get("lengthText") or {}).get("simpleText", "")
            out.append({"id": r["videoId"], "title": title_text.strip(), "channel": channel.strip(), "duration": dur,
                        "thumbnail": f"https://i.ytimg.com/vi/{r['videoId']}/mqdefault.jpg"})
            return
        for v in o.values():
            _walk_compact(v, out)
    elif isinstance(o, list):
        for v in o:
            _walk_compact(v, out)


@app.route("/api/related")
def related():
    """Danh sách video YouTube đề xuất cạnh video đang xem (innertube `next`, client WEB)."""
    vid = re.sub(r"[^A-Za-z0-9_-]", "", request.args.get("v") or "")[:11]
    if len(vid) != 11:
        return jsonify({"success": False, "error": "Thiếu mã video."}), 400
    hit = cache_get("related2", vid, max_age=24 * 3600)
    if hit is not None:
        return jsonify({"success": True, "items": hit})
    try:
        r = HTTP.post(
            "https://www.youtube.com/youtubei/v1/next?prettyPrint=false",
            json={"context": {"client": {"clientName": "WEB", "clientVersion": "2.20250312.04.00", "hl": "en", "gl": "US"}}, "videoId": vid},
            headers={"User-Agent": CHROME_UA, "Content-Type": "application/json", "X-Youtube-Client-Name": "1",
                     "X-Youtube-Client-Version": "2.20250312.04.00", "Cookie": "CONSENT=YES+1; SOCS=CAI"},
            timeout=12,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:  # noqa: BLE001
        return jsonify({"success": False, "error": f"Không lấy được đề xuất: {e}"}), 502
    found: list[dict] = []
    sec = (((data.get("contents") or {}).get("twoColumnWatchNextResults") or {}).get("secondaryResults") or {}).get("secondaryResults") or {}
    _walk_compact(sec.get("results") or data, found)
    seen: set[str] = set()
    items = []
    for it in found:
        if it["id"] in seen or it["id"] == vid or not it["title"]:
            continue
        seen.add(it["id"])
        items.append(it)
        if len(items) >= 20:
            break
    if items:
        cache_set("related2", vid, items)
    return jsonify({"success": True, "items": items})


# ---------------------------------------------------------------- tìm video trên YouTube
@app.route("/api/search")
def search_videos():
    """Tìm video theo từ khoá (innertube `search`, client WEB). Trả mã video + liên kết."""
    q = (request.args.get("q") or "").strip()[:120]
    if not q:
        return jsonify({"success": False, "error": "Thiếu từ khoá."}), 400
    only_cc = request.args.get("cc") == "1"
    params = "EgQQARgD" if only_cc else "EgIQAQ=="  # chỉ video / video có phụ đề
    key = f"{params}|{q}"
    hit = cache_get("search1", key, max_age=6 * 3600)
    if hit is not None:
        return jsonify({"success": True, "items": hit})
    try:
        r = HTTP.post(
            "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
            json={
                "context": {"client": {"clientName": "WEB", "clientVersion": "2.20250312.04.00", "hl": "en", "gl": "US"}},
                "query": q,
                "params": params,
            },
            headers={
                "User-Agent": CHROME_UA,
                "Content-Type": "application/json",
                "X-Youtube-Client-Name": "1",
                "X-Youtube-Client-Version": "2.20250312.04.00",
                "Cookie": "CONSENT=YES+1; SOCS=CAI",
            },
            timeout=12,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:  # noqa: BLE001
        return jsonify({"success": False, "error": f"Không tìm được: {e}"}), 502

    found: list[dict] = []
    _walk_compact(data, found)
    seen: set[str] = set()
    items = []
    for it in found:
        if it["id"] in seen or not it["title"]:
            continue
        seen.add(it["id"])
        it["url"] = f"https://www.youtube.com/watch?v={it['id']}"
        items.append(it)
        if len(items) >= 24:
            break
    if items:
        cache_set("search1", key, items)
    return jsonify({"success": True, "items": items})


# ---------------------------------------------------------------- ảnh từ vựng
def _image_slugs() -> list[str]:
    """Tên tệp (không đuôi) trong assets/vocabulary/en — ảnh sao từ betterVocab, slug = chữ
    thường, mọi thứ không phải a-z0-9 thành một gạch nối."""
    try:
        return sorted(
            os.path.splitext(f)[0]
            for f in os.listdir(IMAGE_DIR)
            if f.lower().endswith((".webp", ".png", ".jpg", ".jpeg"))
        )
    except FileNotFoundError:
        return []


_IMAGE_CACHE: tuple[float, list[str]] = (0.0, [])


@app.route("/api/images")
def images():
    global _IMAGE_CACHE
    now = time.time()
    if now - _IMAGE_CACHE[0] > 60:
        _IMAGE_CACHE = (now, _image_slugs())
    return jsonify({"success": True, "base": "/media/vocabulary/en/", "slugs": _IMAGE_CACHE[1]})


@app.route("/media/<path:path>")
def media(path: str):
    """Ảnh từ vựng. KHÔNG dùng /assets vì Vite đặt bundle ở /assets/index-*.js."""
    resp = send_from_directory(ASSETS_DIR, path)
    resp.headers["Cache-Control"] = "public, max-age=604800"
    return resp


# ---------------------------------------------------------------- static SPA
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def spa(path: str):
    if path and os.path.exists(os.path.join(DIST_DIR, path)):
        return send_from_directory(DIST_DIR, path)
    index = os.path.join(DIST_DIR, "index.html")
    if os.path.exists(index):
        resp = send_from_directory(DIST_DIR, "index.html")
        resp.headers["Cache-Control"] = "no-store"  # luôn lấy bản build mới nhất
        return resp
    return (
        "<h1>Chưa build giao diện.</h1>"
        "<p>Chạy <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code> rồi tải lại trang.</p>",
        200,
    )


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    port = int(os.environ.get("PORT", "5000"))
    print(f"Subloop chạy tại: http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
