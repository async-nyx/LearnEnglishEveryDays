import { CHROME_UA, cached, fail, fetchJson, json } from './_shared'

interface RelatedItem {
  id: string
  title: string
  channel: string
  duration: string
  thumbnail: string
}

type Runs = { runs?: { text: string }[]; simpleText?: string }
const text = (t?: Runs) => t?.simpleText ?? t?.runs?.map((r) => r.text).join('') ?? ''

/** Duyệt cây innertube, gom compactVideoRenderer / videoRenderer. */
function walk(o: unknown, out: RelatedItem[]) {
  if (Array.isArray(o)) {
    for (const v of o) walk(v, out)
    return
  }
  if (!o || typeof o !== 'object') return
  const rec = o as Record<string, unknown>
  // giao diện YouTube mới: lockupViewModel
  const lv = rec.lockupViewModel as Record<string, unknown> | undefined
  if (lv && lv.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && typeof lv.contentId === 'string') {
    const md = ((lv.metadata as Record<string, unknown> | undefined)?.lockupMetadataViewModel ?? {}) as Record<string, unknown>
    const title = (((md.title as Record<string, unknown> | undefined)?.content as string) ?? '').trim()
    const rows = (((md.metadata as Record<string, unknown> | undefined)?.contentMetadataViewModel as Record<string, unknown> | undefined)?.metadataRows ?? []) as { metadataParts?: { text?: { content?: string } }[] }[]
    const channel = (rows[0]?.metadataParts?.[0]?.text?.content ?? '').trim()
    let duration = ''
    const overlays = (((lv.contentImage as Record<string, unknown> | undefined)?.thumbnailViewModel as Record<string, unknown> | undefined)?.overlays ?? []) as { thumbnailBottomOverlayViewModel?: { badges?: { thumbnailBadgeViewModel?: { text?: string } }[] } }[]
    for (const ov of overlays) for (const b of ov.thumbnailBottomOverlayViewModel?.badges ?? []) {
      const t = b.thumbnailBadgeViewModel?.text ?? ''
      if (/^\d+:\d\d/.test(t)) duration = t
    }
    out.push({ id: lv.contentId, title, channel, duration, thumbnail: `https://i.ytimg.com/vi/${lv.contentId}/mqdefault.jpg` })
    return
  }
  const r = (rec.compactVideoRenderer ?? rec.videoRenderer) as Record<string, unknown> | undefined
  if (r && typeof r.videoId === 'string') {
    const by = (r.shortBylineText ?? r.longBylineText ?? r.ownerText) as Runs | undefined
    out.push({
      id: r.videoId,
      title: text(r.title as Runs).trim(),
      channel: text(by).trim(),
      duration: text(r.lengthText as Runs),
      thumbnail: `https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`,
    })
    return
  }
  for (const v of Object.values(rec)) walk(v, out)
}

/** Video YouTube đề xuất cạnh video đang xem (innertube `next`, client WEB). */
export const onRequestGet = async ({ request }: { request: Request }) => {
  const vid = (new URL(request.url).searchParams.get('v') ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 11)
  if (vid.length !== 11) return fail('Thiếu mã video.')
  return cached(request, `/__cache/related?v=${vid}`, 60 * 60 * 24, async () => {
    let data: Record<string, unknown>
    try {
      data = await fetchJson<Record<string, unknown>>('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': CHROME_UA,
          'x-youtube-client-name': '1',
          'x-youtube-client-version': '2.20250312.04.00',
          cookie: 'CONSENT=YES+1; SOCS=CAI',
        },
        body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20250312.04.00', hl: 'en', gl: 'US' } }, videoId: vid }),
      }, 12000)
    } catch (e) {
      return fail(`Không lấy được đề xuất: ${(e as Error).message}`, 502)
    }
    const found: RelatedItem[] = []
    const sec = ((((data.contents as Record<string, unknown> | undefined)?.twoColumnWatchNextResults as Record<string, unknown> | undefined)?.secondaryResults as Record<string, unknown> | undefined)?.secondaryResults as Record<string, unknown> | undefined)
    walk(sec?.results ?? data, found)
    const seen = new Set<string>()
    const items: RelatedItem[] = []
    for (const it of found) {
      if (seen.has(it.id) || it.id === vid || !it.title) continue
      seen.add(it.id)
      items.push(it)
      if (items.length >= 20) break
    }
    if (!items.length) return fail('YouTube không trả về đề xuất cho video này.', 502)
    return json({ success: true, items })
  })
}
