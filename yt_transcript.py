"""Lấy phụ đề YouTube khi IP bị chặn.

BẪY đã trả giá: gọi `youtube_transcript_api` dày tay (dựng thư viện, kiểm phụ đề hàng loạt) khiến
YouTube CHẶN IP — sau đó chính app cũng không lấy được phụ đề nữa ("YouTube is blocking requests
from your IP"). Module này có hai lớp gỡ:

  1. PROXY (nếu có) — đặt biến môi trường rồi chạy lại app, không phải sửa code:
       set WEBSHARE_PROXY_USERNAME=...   &  set WEBSHARE_PROXY_PASSWORD=...    (gói Residential)
       hoặc  set YT_PROXY_URL=http://user:pass@host:port                        (proxy bất kỳ)
  2. INNERTUBE — khi thư viện bị chặn, thử lần lượt các client ANDROID / ANDROID_VR / IOS /
     TVHTML5 / WEB rồi tải thẳng tệp phụ đề json3. Client di động thường vẫn qua được lúc đường
     web bị chặn, nên nhiều khi không cần proxy.
"""
from __future__ import annotations

import html
import json
import os
import re

import requests
from youtube_transcript_api import YouTubeTranscriptApi

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)
WEB_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"

CLIENTS = [
    {
        "name": "ANDROID", "id": "3", "version": "20.10.38",
        "ua": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
        "extra": {"androidSdkVersion": 30},
    },
    {
        "name": "ANDROID_VR", "id": "28", "version": "1.60.19",
        "ua": "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
        "extra": {"androidSdkVersion": 32, "deviceMake": "Oculus", "deviceModel": "Quest 3", "osName": "Android", "osVersion": "12L"},
    },
    {
        "name": "IOS", "id": "5", "version": "19.45.4",
        "ua": "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)",
        "extra": {"deviceMake": "Apple", "deviceModel": "iPhone16,2", "osName": "iPhone", "osVersion": "18.1.0.22B83"},
    },
    {
        "name": "TVHTML5_SIMPLY_EMBEDDED_PLAYER", "id": "85", "version": "2.0",
        "ua": "Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15",
        "extra": {}, "thirdParty": True,
    },
    {"name": "WEB", "id": "1", "version": "2.20250312.04.00", "ua": CHROME_UA, "extra": {}},
]


def proxy_dict() -> dict[str, str] | None:
    """Proxy cho `requests`, đọc từ biến môi trường. Không đặt gì thì trả None."""
    url = os.environ.get("YT_PROXY_URL", "").strip()
    if not url:
        user = os.environ.get("WEBSHARE_PROXY_USERNAME", "").strip()
        pwd = os.environ.get("WEBSHARE_PROXY_PASSWORD", "").strip()
        if user and pwd:
            url = f"http://{user}-rotate:{pwd}@p.webshare.io:80/"
    return {"http": url, "https": url} if url else None


def api() -> YouTubeTranscriptApi:
    """`YouTubeTranscriptApi` đã cắm proxy nếu môi trường có khai báo."""
    user = os.environ.get("WEBSHARE_PROXY_USERNAME", "").strip()
    pwd = os.environ.get("WEBSHARE_PROXY_PASSWORD", "").strip()
    generic = os.environ.get("YT_PROXY_URL", "").strip()
    try:
        from youtube_transcript_api.proxies import GenericProxyConfig, WebshareProxyConfig

        if user and pwd:
            return YouTubeTranscriptApi(proxy_config=WebshareProxyConfig(proxy_username=user, proxy_password=pwd))
        if generic:
            return YouTubeTranscriptApi(proxy_config=GenericProxyConfig(http_url=generic, https_url=generic))
    except Exception:  # noqa: BLE001 — bản thư viện cũ không có module proxies
        pass
    return YouTubeTranscriptApi()


def is_blocked(err: Exception) -> bool:
    text = str(err).lower()
    return "blocking requests" in text or "ipblocked" in text or "too many requests" in text or "not a bot" in text


BLOCKED_HINT = (
    "YouTube đang chặn IP của máy chạy app (do gọi quá nhiều hoặc IP thuộc nhà cung cấp đám mây). "
    "Chờ 15–30 phút thường là hết. Muốn chắc chắn thì cắm proxy dân cư: đặt biến môi trường "
    "WEBSHARE_PROXY_USERNAME và WEBSHARE_PROXY_PASSWORD (gói Residential của webshare.io), "
    "hoặc YT_PROXY_URL=http://user:pass@host:port, rồi chạy lại app."
)


# ---------------------------------------------------------------- innertube
def _session() -> requests.Session:
    s = requests.Session()
    proxies = proxy_dict()
    if proxies:
        s.proxies.update(proxies)
    return s


def _player_response(video_id: str, http: requests.Session) -> dict:
    key = WEB_KEY
    try:
        page = http.get(
            f"https://www.youtube.com/watch?v={video_id}&hl=en",
            headers={"User-Agent": CHROME_UA, "Accept-Language": "en-US,en;q=0.9", "Cookie": "CONSENT=YES+1; SOCS=CAI"},
            timeout=12,
        ).text
        m = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', page)
        if m:
            key = m.group(1)
    except Exception:  # noqa: BLE001
        pass

    last: dict = {}
    for c in CLIENTS:
        body = {
            "context": {
                "client": {"clientName": c["name"], "clientVersion": c["version"], "hl": "en", "gl": "US", **c["extra"]},
                **({"thirdParty": {"embedUrl": "https://www.youtube.com/"}} if c.get("thirdParty") else {}),
            },
            "videoId": video_id,
            "contentCheckOk": True,
            "racyCheckOk": True,
        }
        try:
            r = http.post(
                f"https://www.youtube.com/youtubei/v1/player?key={key}&prettyPrint=false",
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": c["ua"],
                    "X-Youtube-Client-Name": c["id"],
                    "X-Youtube-Client-Version": c["version"],
                },
                timeout=12,
            )
            pr = r.json()
        except Exception:  # noqa: BLE001
            continue
        last = pr
        tracks = (((pr.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}).get("captionTracks")) or []
        if tracks:
            return pr
        if (pr.get("playabilityStatus") or {}).get("status") == "OK":
            return pr
    return last


def _pick(tracks: list[dict], preferred: list[str]) -> dict | None:
    manual = [t for t in tracks if t.get("kind") != "asr"]
    for code in preferred:
        for t in manual:
            if t.get("languageCode") == code:
                return t
    roots = []
    for code in preferred:
        root = code.split("-")[0]
        if root not in roots:
            roots.append(root)
    for root in roots:
        for pool in (manual, tracks):
            for t in pool:
                if str(t.get("languageCode", "")).startswith(root):
                    return t
    return manual[0] if manual else (tracks[0] if tracks else None)


def fetch_via_innertube(video_id: str, preferred: list[str]) -> tuple[list[dict], dict, list[dict]]:
    """Trả (đoạn phụ đề, thông tin track đã chọn, danh sách track có sẵn). Rỗng nếu không lấy được."""
    http = _session()
    pr = _player_response(video_id, http)
    tracks = (((pr.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}).get("captionTracks")) or []
    available = [
        {
            "code": t.get("languageCode", ""),
            "name": (t.get("name", {}) or {}).get("simpleText")
            or "".join(r.get("text", "") for r in (t.get("name", {}) or {}).get("runs", []))
            or t.get("languageCode", ""),
            "generated": t.get("kind") == "asr",
        }
        for t in tracks
    ]
    track = _pick(tracks, preferred)
    if not track or not track.get("baseUrl"):
        return [], {}, available
    # BẪY: baseUrl đã kèm sẵn `fmt=srv3` nên thêm `&fmt=json3` KHÔNG có tác dụng — YouTube vẫn trả
    # XML. Phải bỏ fmt cũ đi; và vẫn chừa đường đọc XML phòng khi họ đổi ý.
    url = re.sub(r"&fmt=[^&]*", "", track["baseUrl"]) + "&fmt=json3"
    try:
        raw = http.get(url, headers={"User-Agent": CHROME_UA}, timeout=15).text
    except Exception:  # noqa: BLE001
        return [], {}, available
    if not raw.strip():
        return [], {}, available

    segments: list[dict] = []
    if raw.lstrip().startswith("<"):
        for m in re.finditer(r'<p t="(\d+)"(?: d="(\d+)")?[^>]*>(.*?)</p>', raw, re.S):
            text = _clean(re.sub(r"<[^>]+>", "", m.group(3)))
            if text:
                segments.append({"start": int(m.group(1)) / 1000, "duration": int(m.group(2) or 0) / 1000, "text": text})
        return segments, track, available
    try:
        data = json.loads(raw)
    except Exception:  # noqa: BLE001
        return [], {}, available
    for ev in data.get("events") or []:
        text = _clean("".join(x.get("utf8", "") for x in (ev.get("segs") or [])))
        if not text:
            continue
        segments.append({"start": (ev.get("tStartMs") or 0) / 1000, "duration": (ev.get("dDurationMs") or 0) / 1000, "text": text})
    return segments, track, available


def _clean(text: str) -> str:
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text.replace("\n", " ")).strip()
    return re.sub(r"\[[^\]]*\]", "", text).strip()
