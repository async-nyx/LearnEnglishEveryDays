# Subloop — học tiếng Anh qua video YouTube

Dán liên kết YouTube, app kéo phụ đề về rồi cho bạn:

- **Đọc theo video**: phụ đề cuộn theo tiếng, bấm mốc giờ để nhảy, lặp một câu, dịch câu đang phát, đổi cỡ chữ, gộp theo câu hoặc hiện từng dòng gốc, xuất `.txt`/`.srt`.
- **Bấm vào từ để tra**: nghĩa tiếng Việt hiện ngay (Google Translate), phiên âm IPA + audio + định nghĩa Anh-Anh về sau (dictionaryapi.dev, dự phòng Wiktionary). Bấm **Lưu từ** là vào sổ kèm câu gốc, mốc thời gian, video.
- **Chép chính tả** (theo cách của betterVocab): một thẻ duy nhất, dãy ô số là bản đồ cả bài (trắng chưa động, đỏ đã làm chưa đúng, xanh đúng). Chỉ được nghe, không lộ câu; **Kiểm tra** lộ đúng một từ (từ đầu tiên chưa gõ đúng); hàng từ xanh/tím/chấm dài bằng từ. Viết tắt và viết bung tính là một (`I've` = `ive` = `I have`). Tạm dừng giữ chỗ, nghe chậm 0.75×, đúng thì tự sang câu tiếp. Bài gõ lưu theo video.
- **Nói theo (shadowing)**: lặp câu, **chạy liên tiếp** (phát câu, nghỉ một quãng để bạn đọc theo, tự sang câu kế), giảm tốc 0.65–1×, đọc mẫu bằng giọng máy, ghi âm giọng mình để nghe lại, nhận dạng giọng nói (Chrome/Edge) để chấm khớp với bản gốc.
- **Ảnh từ vựng**: 2.762 tranh minh hoạ sao từ betterVocab ở `assets/vocabulary/en/<slug>.webp` (slug = chữ thường, ký tự lạ thành `-`), hiện ở popover, danh sách và mặt sau thẻ lật. Thêm ảnh: thả tệp vào thư mục đó, không cần build.
- **Sổ từ**: danh sách + tìm + xuất CSV (nhập Anki được), **thẻ lật** theo lịch giãn cách (6 hộp: 0, 1, 3, 7, 14, 30 ngày), **chép từ** (nghe + nghĩa → gõ đúng chính tả), **trắc nghiệm** 4 đáp án hai chiều từ ↔ nghĩa.
- **Thư viện**: 100 video A1–C1 (TED, TED-Ed, BBC Learning English, Kurzgesagt, Vox, Easy English…), mỗi video đã kiểm tra có phụ đề tiếng Anh do người làm, ghi rõ kênh nguồn. Hết video, app tự đề xuất video cùng bậc từ thư viện (không dùng màn đề xuất của YouTube).
- Sáng / tối / theo hệ thống. Toàn bộ dữ liệu nằm trong `localStorage` của trình duyệt, không cần đăng nhập.

## Bản trực tuyến

Deploy trên Cloudflare Pages: **https://learnenglisheverydays.pages.dev**. Trên Pages không có Flask, nên toàn bộ API
(`/api/transcript`, `/api/translate`, `/api/define`, `/api/define-full`, `/api/tts`, `/api/images`) được viết lại bằng
Pages Functions ở `frontend/functions/api/` (TypeScript, chạy trên Cloudflare Workers, cache bằng Cache API). Cùng giao diện
JSON với `app.py`, frontend không phân biệt.

```powershell
cd frontend
npm run deploy      # build + wrangler pages deploy dist --project-name learnenglisheverydays
```

## Chạy cục bộ

```powershell
./run.ps1
```

Hoặc từng bước:

```powershell
cd frontend; npm install; npm run build; cd ..
py -m pip install -r requirements.txt
py app.py          # http://127.0.0.1:5000
```

Phát triển giao diện với hot-reload: `./dev.ps1` (mở Flask ở cửa sổ riêng rồi chạy Vite ở cổng 5173). Vite chỉ phục vụ giao diện và chuyển tiếp `/api`, `/media` sang Flask ở cổng 5000, nên **Flask phải chạy** — không thì Vite báo `ECONNREFUSED 127.0.0.1:5000`.

## Cấu trúc

```
app.py               Flask: /api/transcript, /api/translate, /api/define, /api/images, /media/* + phục vụ frontend/dist
assets/vocabulary/en Ảnh từ vựng (webp), phục vụ ở /media/vocabulary/en/
frontend/            React 19 + Vite + TypeScript + Tailwind v4 + framer-motion + zustand
  src/lib/           text.ts (tách từ, LCS so khớp, gộp câu), srs.ts, speech.ts, api.ts
  src/store/         useStore (persist localStorage), usePlayer (YouTube IFrame API), useLookup
  src/components/    TopBar, VideoPane, TranscriptView, DictationView, ShadowingView, WordPopover
  src/components/vocab/  VocabList, Flashcards, SpellingDrill, Quiz
```

## Dựng lại thư viện video

```powershell
py scripts/build_library.py   # kéo kết quả tìm kiếm YouTube theo kênh, lọc độ dài theo bậc, kiểm tra phụ đề EN người làm -> frontend/src/data/library.json
cd frontend; npm run build
```

Mã video không được viết tay; muốn thêm kênh/bậc thì sửa bảng `PLAN` trong script.

## Ghi chú kỹ thuật

- **Tốc độ tra từ**: đường nhanh `/api/define` dùng Datamuse (định nghĩa WordNet + phiên âm ARPAbet đổi sang IPA, ~0,3 s) và âm thanh Google TTS qua `/api/tts` (~0,3 s, ghi đĩa). Đường chậm `/api/define-full` (dictionaryapi.dev ~20 s, dự phòng Wiktionary ~5 s) chỉ để bổ sung IPA chuẩn, giọng người đọc và ví dụ; popover không chờ nó.
- **Dịch** qua `clients5.google.com/translate_a/t` (~0,3 s), dự phòng `gtx` rồi MyMemory. Điểm cuối `gtx` hay bị 429 nên không còn dùng để lấy nghĩa theo từ loại.
- **Cache bền** trong `cache/cache.sqlite` (dịch, định nghĩa) và `cache/tts/*.mp3`: lần thứ hai trả về tức thì, kể cả sau khi khởi động lại. Xoá thư mục `cache/` là làm mới.
- **Tải trước**: rê chuột lên một từ 120 ms là app đã tra nghĩa và dịch sẵn; bật "Dịch" thì hai câu kế tiếp được dịch trước.
- Ảnh từ vựng nằm ở `assets/vocabulary/en/<slug>.webp` (sao từ betterVocab), phục vụ qua `/media/...`; `/api/images` trả danh sách slug có thật.
- Nhận dạng giọng nói dùng Web Speech API; Firefox không hỗ trợ thì vẫn ghi âm được để tự nghe lại.
