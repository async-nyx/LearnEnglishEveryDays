import { CHROME_UA, fail } from './_shared'

/** Âm thanh đọc từ/câu qua Google TTS, cache 30 ngày ở biên. */
export const onRequestGet = async ({ request }: { request: Request }) => {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 200)
  if (!q) return fail('Thiếu q.')
  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request(new URL(`/__cache/tts?q=${encodeURIComponent(q)}`, request.url).toString())
  const hit = await cache.match(key)
  if (hit) return hit
  const u = new URL('https://translate.google.com/translate_tts')
  u.search = new URLSearchParams({ ie: 'UTF-8', q, tl: 'en', client: 'tw-ob' }).toString()
  const r = await fetch(u.toString(), { headers: { 'user-agent': CHROME_UA, referer: 'https://translate.google.com/' } })
  if (!r.ok) return fail('Không lấy được âm thanh.', 502)
  const res = new Response(r.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=2592000' } })
  await cache.put(key, res.clone())
  return res
}
