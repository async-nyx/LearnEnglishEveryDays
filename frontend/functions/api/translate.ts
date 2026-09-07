import { cached, fail, json, translate } from './_shared'

export const onRequestGet = async ({ request }: { request: Request }) => {
  const u = new URL(request.url)
  const q = (u.searchParams.get('q') ?? '').trim()
  const sl = u.searchParams.get('sl') ?? 'auto'
  const tl = u.searchParams.get('tl') ?? 'vi'
  if (!q) return fail('Thiếu tham số q.')
  if (q.length > 2000) return fail('Đoạn cần dịch quá dài.')
  return cached(request, `/__cache/translate?${new URLSearchParams({ q, sl, tl })}`, 60 * 60 * 24 * 30, async () => {
    try {
      return json({ success: true, ...(await translate(q, sl, tl)) })
    } catch (e) {
      return fail(`Không dịch được: ${(e as Error).message}`, 502)
    }
  })
}
