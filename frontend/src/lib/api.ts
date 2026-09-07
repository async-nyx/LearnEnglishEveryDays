import type { DefineResult, TranscriptData, TranslateResult } from './types'

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { success?: boolean; error?: string }
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Lỗi ${res.status}`)
  }
  return data
}

export async function fetchTranscript(url: string): Promise<TranscriptData> {
  const res = await fetch('/api/transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  return readJson<TranscriptData>(res)
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
