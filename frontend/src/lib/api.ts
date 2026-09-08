import { styleVietnamese, transStyle } from './novel-style'
import { libraryItem } from './library'
import type { DefineResult, TranscriptData, TranslateResult } from './types'
import { hasHan, isNovelContext, lockTerms, termsToProbe } from './xianxia'

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { success?: boolean; error?: string }
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Lỗi ${res.status}`)
  }
  return data
}

export const ZH_LANGS = ['zh-Hans', 'zh-CN', 'zh', 'zh-Hant', 'zh-TW', 'zh-HK']

/** Mã video trong mọi kiểu liên kết YouTube; không nhận ra thì trả chính chuỗi đó. */
export function videoIdOf(url: string): string {
  const m = /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/.exec(url)
  if (m) return m[1]
  return /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : ''
}

/**
 * BẪY đã trả giá: video tiếng Trung mà không xin đúng tiếng thì máy chủ trả PHỤ ĐỀ TIẾNG ANH
 * (phim hoạt hình Trung Quốc gần như luôn có cả hai track). Dán liên kết cũng phải tra thư viện
 * để biết đây là video tiếng Trung, y như khi mở từ Thư viện.
 */
/** Tỉ lệ chữ Hán trong phụ đề — dùng để biết track "zh" có thật sự là tiếng Trung không. */
function hanRatio(data: TranscriptData): number {
  const text = data.segments
    .slice(0, 40)
    .map((s) => s.text)
    .join('')
  if (!text) return 0
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length
  return han / text.length
}

/**
 * BẪY đã trả giá: nhiều phim Trung có track ĐÁNH DẤU là "zh" nhưng nội dung lại là tiếng Anh
 * (Soul Land EP01, mấy kênh đăng lại). Người học mở ra thấy toàn tiếng Anh, không xem tiếng Trung
 * được. Nên sau khi lấy, đếm chữ Hán; ít quá thì thử các track tiếng Trung còn lại.
 */
async function ensureChinese(url: string, data: TranscriptData): Promise<TranscriptData> {
  if (hanRatio(data) >= 0.15) return data
  const others = (data.available ?? [])
    .filter((a) => a.code.toLowerCase().startsWith('zh') && a.code !== data.language_code)
    .map((a) => a.code)
  for (const code of others) {
    try {
      const alt = await fetchOnce(url, [code])
      if (hanRatio(alt) >= 0.15) return alt
    } catch {
      /* thử mã kế */
    }
  }
  return data
}

async function fetchOnce(url: string, languages?: string[]): Promise<TranscriptData> {
  const res = await fetch('/api/transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(languages ? { url, languages } : { url }),
  })
  return readJson<TranscriptData>(res)
}

/** Người học đặt ở bảng CC; `lib/api` đọc qua đây để khỏi vòng import với store. */
let preferSub: 'auto' | 'zh' | 'en' = 'auto'
export function setPreferSubLang(v: 'auto' | 'zh' | 'en'): void {
  preferSub = v
}

const HAN_RE = /\p{Script=Han}/u

export async function fetchTranscript(url: string, languages?: string[]): Promise<TranscriptData> {
  if (!languages) {
    if (preferSub === 'zh') languages = ZH_LANGS
    else {
      const item = libraryItem(videoIdOf(url))
      if (item && (item.lang ?? 'en') === 'zh') languages = ZH_LANGS
    }
  }
  const data = await fetchOnce(url, languages)
  const wantsZh = !!languages && languages.some((l) => l.toLowerCase().startsWith('zh'))
  if (wantsZh) return ensureChinese(url, data)

  /*
    BẪY đã trả giá: tập phim Trung mở từ đề xuất / dán liên kết ra PHỤ ĐỀ TIẾNG ANH dù video có
    track tiếng Trung ("ENG SUB《斗罗大陆2绝世唐门》EP01" có đủ zh, en, id, ms, th, vi) — máy chủ
    mặc định xin tiếng Anh. Nếu tên video là chữ Hán mà bản lấy về không phải tiếng Trung thì đổi.
  */
  const zhTrack = (data.available ?? []).find((a) => a.code.toLowerCase().startsWith('zh'))
  const looksChinese = HAN_RE.test(data.title ?? '') || HAN_RE.test(data.author ?? '')
  if (preferSub !== 'en' && zhTrack && looksChinese && !(data.language_code ?? '').toLowerCase().startsWith('zh')) {
    try {
      const alt = await fetchOnce(url, [zhTrack.code, ...ZH_LANGS])
      return ensureChinese(url, alt)
    } catch {
      return data
    }
  }
  return data
}

const defineCache = new Map<string, Promise<DefineResult>>()

export function defineWord(word: string): Promise<DefineResult> {
  const key = word.toLowerCase()
  let p = defineCache.get(key)
  if (!p) {
    p = fetch(`/api/define?word=${encodeURIComponent(key)}`).then((r) => readJson<DefineResult>(r))
    p.catch(() => defineCache.delete(key))
    defineCache.set(key, p)
  }
  return p
}

const fullCache = new Map<string, Promise<DefineResult>>()

/** Đường chậm: IPA chuẩn, audio người đọc, ví dụ. Lần đầu có thể tới 25 s; máy chủ có cache đĩa. */
export function defineWordFull(word: string): Promise<DefineResult> {
  const key = word.toLowerCase()
  let p = fullCache.get(key)
  if (!p) {
    p = fetch(`/api/define-full?word=${encodeURIComponent(key)}`).then((r) => readJson<DefineResult>(r))
    p.catch(() => fullCache.delete(key))
    fullCache.set(key, p)
  }
  return p
}

/** Tải trước khi rê chuột lên từ: lúc bấm, popover có sẵn nghĩa. */
export function prefetchWord(word: string): void {
  const key = word.toLowerCase()
  if (!/^[a-z][a-z'-]*$/.test(key)) return
  void defineWord(key).catch(() => undefined)
  void translateText(key, 'vi', 'en').catch(() => undefined)
}

const translateCache = new Map<string, Promise<TranslateResult>>()

export function translateText(q: string, tl = 'vi', sl = 'auto'): Promise<TranslateResult> {
  const key = `${sl}|${tl}|${q}`
  let p = translateCache.get(key)
  if (!p) {
    const params = new URLSearchParams({ q, tl, sl })
    p = fetch(`/api/translate?${params}`).then((r) => readJson<TranslateResult>(r))
    p.catch(() => translateCache.delete(key))
    translateCache.set(key, p)
  }
  return p
}

/**
 * Dịch một CÂU trong phụ đề. Câu tiếng Trung được thay thuật ngữ tiên hiệp / tên riêng sang âm
 * Hán-Việt trước khi gửi máy dịch — xem `lib/xianxia.ts` để biết vì sao (dịch thô ra "ngựa đạo hữu").
 */
/** Bản dịch máy của RIÊNG một thuật ngữ, hỏi một lần rồi nhớ cả phiên. */
const termRendering = new Map<string, string>()

async function probeTerms(zh: string): Promise<Map<string, string>> {
  const need = termsToProbe(zh).filter((t) => !termRendering.has(t))
  await Promise.all(
    Array.from(new Set(need)).map((t) =>
      translateText(t, 'vi', 'zh')
        .then((r) => termRendering.set(t, r.text))
        .catch(() => termRendering.set(t, '')),
    ),
  )
  return termRendering
}

/**
 * Dịch một CÂU phụ đề qua 4 tầng (xem `lib/xianxia.ts` và `lib/novel-style.ts`):
 *   1. máy dịch NGUYÊN câu — nó lo cú pháp, trật tự, đại từ;
 *   2. hỏi riêng từng thuật ngữ/tên xem máy dịch thành chữ gì;
 *   3. thay bằng cách viết chuẩn (thần thức, Vương mỗ, Thanh Vân Tông) — nhất quán cả video;
 *   4. tầng văn phong: ta/ngươi/hắn/nàng theo mức người dùng chọn, rồi dọn dấu câu.
 */
export async function translateSentence(text: string): Promise<TranslateResult> {
  if (!hasHan(text)) return translateText(text, 'vi', 'auto')
  const [res, renderings] = await Promise.all([translateText(text, 'vi', 'zh'), probeTerms(text)])
  const locked = lockTerms(res.text, text, renderings)
  // "truyện" là mặc định nhưng chỉ có nghĩa với phim truyện; phim thiếu nhi giữ giọng tự nhiên
  const style = transStyle() === 'truyen' && !isNovelContext() ? 'tunhien' : transStyle()
  return { ...res, text: styleVietnamese(locked, style) }
}

export interface RelatedVideo {
  id: string
  title: string
  channel: string
  duration: string
  thumbnail: string
}

const relatedCache = new Map<string, Promise<RelatedVideo[]>>()

/** Video YouTube đề xuất cạnh video đang xem. */
export function fetchRelated(videoId: string): Promise<RelatedVideo[]> {
  let p = relatedCache.get(videoId)
  if (!p) {
    p = fetch(`/api/related?v=${encodeURIComponent(videoId)}`)
      .then((r) => readJson<{ items: RelatedVideo[] }>(r))
      .then((d) => d.items)
    p.catch(() => relatedCache.delete(videoId))
    relatedCache.set(videoId, p)
  }
  return p
}

export interface SearchVideo {
  id: string
  title: string
  channel: string
  duration: string
  thumbnail: string
  url: string
}

/** Tìm video trên YouTube theo từ khoá. `ccOnly` chỉ lấy video YouTube đánh dấu là có phụ đề. */
export async function searchVideos(q: string, ccOnly = true, signal?: AbortSignal): Promise<SearchVideo[]> {
  const params = new URLSearchParams({ q })
  if (ccOnly) params.set('cc', '1')
  const res = await fetch(`/api/search?${params}`, { signal })
  const data = await readJson<{ items: SearchVideo[] }>(res)
  return data.items
}
