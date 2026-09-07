/**
 * Dùng chung cho Pages Functions (Cloudflare Workers). Đây là bản chạy trên mây của app.py:
 * cùng giao diện JSON để frontend không phân biệt đang gọi Flask hay Cloudflare.
 */
export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  })
}

export function fail(error: string, status = 400): Response {
  return json({ success: false, error }, status)
}

/** Lấy từ Cache API theo khoá URL; không có thì tính rồi ghi lại với TTL (giây). */
export async function cached(request: Request, key: string, ttl: number, compute: () => Promise<Response>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(new URL(key, request.url).toString(), { method: 'GET' })
  const hit = await cache.match(cacheKey)
  if (hit) return hit
  const res = await compute()
  if (res.ok) {
    const copy = new Response(res.clone().body, res)
    copy.headers.set('cache-control', `public, max-age=${ttl}`)
    await cache.put(cacheKey, copy.clone())
    return copy
  }
  return res
}

export async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, headers: { 'user-agent': CHROME_UA, ...(init.headers as Record<string, string> | undefined) } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.text()
  } finally {
    clearTimeout(t)
  }
}

export async function fetchJson<T = unknown>(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<T> {
  return JSON.parse(await fetchText(url, init, timeoutMs)) as T
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

// ---------------------------------------------------------------- dịch
async function viaClients5(q: string, sl: string, tl: string): Promise<[string, string]> {
  const u = new URL('https://clients5.google.com/translate_a/t')
  u.search = new URLSearchParams({ client: 'dict-chrome-ex', sl, tl, q }).toString()
  const raw = await fetchJson<unknown>(u.toString(), {}, 8000)
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('clients5 rỗng')
  const first = raw[0]
  if (Array.isArray(first)) return [String(first[0] ?? ''), typeof first[1] === 'string' ? first[1] : sl]
  return [String(first), sl]
}

async function viaGtx(q: string, sl: string, tl: string): Promise<[string, string]> {
  const u = new URL('https://translate.googleapis.com/translate_a/single')
  u.search = new URLSearchParams({ client: 'gtx', sl, tl, dt: 't', q }).toString()
  const text = await fetchText(u.toString(), {}, 8000)
  if (!text.startsWith('[')) throw new Error('gtx bị chặn')
  const raw = JSON.parse(text)
  const out = (raw[0] as unknown[][]).map((p) => p?.[0] ?? '').join('')
  return [out, typeof raw[2] === 'string' ? raw[2] : sl]
}

async function viaMyMemory(q: string, sl: string, tl: string): Promise<[string, string]> {
  const src = sl === 'auto' ? 'en' : sl
  const u = new URL('https://api.mymemory.translated.net/get')
  u.search = new URLSearchParams({ q: q.slice(0, 500), langpair: `${src}|${tl}` }).toString()
  const data = await fetchJson<{ responseData?: { translatedText?: string }; responseStatus?: number | string }>(u.toString(), {}, 8000)
  const text = data.responseData?.translatedText ?? ''
  if (!text || String(data.responseStatus) !== '200') throw new Error('MyMemory không có bản dịch')
  return [text, src]
}

export async function translate(q: string, sl = 'auto', tl = 'vi'): Promise<{ text: string; alternatives: never[]; detected: string }> {
  const errors: string[] = []
  for (const fn of [viaClients5, viaGtx, viaMyMemory]) {
    try {
      const [text, detected] = await fn(q, sl, tl)
      if (text) return { text, alternatives: [], detected }
    } catch (e) {
      errors.push(`${fn.name}: ${(e as Error).message}`)
    }
  }
  throw new Error(errors.join(' | '))
}

// ---------------------------------------------------------------- ARPAbet -> IPA
const ARPA: Record<string, string> = {
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', EH: 'ɛ', ER: 'ɝ', EY: 'eɪ', IH: 'ɪ', IY: 'i', OW: 'oʊ', OY: 'ɔɪ', UH: 'ʊ', UW: 'u',
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'ɡ', HH: 'h', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', P: 'p', R: 'r', S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
}
const VOWELS = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'])

export function arpabetToIpa(pron: string): string {
  const toks: [string, string | undefined][] = []
  for (const tok of pron.split(/\s+/)) {
    const m = /^([A-Z]+)([012])?$/.exec(tok)
    if (m) toks.push([m[1], m[2]])
  }
  const nVowels = toks.filter(([b]) => VOWELS.has(b)).length
  const out: string[] = []
  let syllableStart = 0
  for (const [base, stress] of toks) {
    let ipa = ARPA[base] ?? base.toLowerCase()
    if (base === 'AH' && stress === '0') ipa = 'ə'
    if (VOWELS.has(base)) {
      if (nVowels > 1 && (stress === '1' || stress === '2')) out.splice(syllableStart, 0, stress === '1' ? 'ˈ' : 'ˌ')
      out.push(ipa)
      syllableStart = out.length
    } else out.push(ipa)
  }
  return out.length ? `/${out.join('')}/` : ''
}

export function lemmaCandidates(word: string): string[] {
  const cands = [word]
  const rules: [RegExp, string][] = [
    [/ies$/, 'y'], [/ied$/, 'y'], [/ing$/, ''], [/ing$/, 'e'], [/ed$/, ''], [/ed$/, 'e'], [/es$/, ''], [/s$/, ''], [/er$/, ''], [/est$/, ''], [/ly$/, ''],
  ]
  for (const [re, rep] of rules) {
    const c = word.replace(re, rep)
    if (c !== word && c.length >= 2 && !cands.includes(c)) cands.push(c)
  }
  const m = /^(.*?)([bcdfghjklmnpqrstvwxz])\2(ing|ed)$/.exec(word)
  if (m) {
    const c = m[1] + m[2]
    if (!cands.includes(c)) cands.push(c)
  }
  return cands
}

export function cleanWord(raw: string | null): string {
  return (raw ?? '').trim().toLowerCase().replace(/[^a-z'-]/g, '')
}
