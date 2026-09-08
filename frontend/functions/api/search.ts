import { CHROME_UA, cached, fail, fetchJson, json } from './_shared'

interface SearchItem {
  id: string
  title: string
  channel: string
  duration: string
  thumbnail: string
  url: string
}

type Runs = { runs?: { text: string }[]; simpleText?: string }
const text = (t?: Runs) => t?.simpleText ?? t?.runs?.map((r) => r.text).join('') ?? ''

/** Duyệt cây innertube của trang tìm kiếm, gom videoRenderer / lockupViewModel. */
function walk(o: unknown, out: SearchItem[]) {
  if (Array.isArray(o)) {
    for (const v of o) walk(v, out)
    return
  }
  if (!o || typeof o !== 'object') return
  const rec = o as Record<string, unknown>

  const lv = rec.lockupViewModel as Record<string, unknown> | undefined
  if (lv && lv.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && typeof lv.contentId === 'string') {
    const md = ((lv.metadata as Record<string, unknown> | undefined)?.lockupMetadataViewModel ?? {}) as Record<string, unknown>
    const title = (((md.title as Record<string, unknown> | undefined)?.content as string) ?? '').trim()
    const rows = (((md.metadata as Record<string, unknown> | undefined)?.contentMetadataViewModel as Record<string, unknown> | undefined)?.metadataRows ?? []) as {
      metadataParts?: { text?: { content?: string } }[]
    }[]
    const channel = (rows[0]?.metadataParts?.[0]?.text?.content ?? '').trim()
    let duration = ''
    const overlays = (((lv.contentImage as Record<string, unknown> | undefined)?.thumbnailViewModel as Record<string, unknown> | undefined)?.overlays ?? []) as {
      thumbnailBottomOverlayViewModel?: { badges?: { thumbnailBadgeViewModel?: { text?: string } }[] }
    }[]
    for (const ov of overlays)
      for (const b of ov.thumbnailBottomOverlayViewModel?.badges ?? []) {
        const t = b.thumbnailBadgeViewModel?.text ?? ''
        if (/^\d+:\d\d/.test(t)) duration = t
      }
    push(out, lv.contentId, title, channel, duration)
    return
  }

  const r = rec.videoRenderer as Record<string, unknown> | undefined
  if (r && typeof r.videoId === 'string') {
    const by = (r.ownerText ?? r.longBylineText ?? r.shortBylineText) as Runs | undefined
    push(out, r.videoId, text(r.title as Runs).trim(), text(by).trim(), text(r.lengthText as Runs))
    return
  }
  for (const v of Object.values(rec)) walk(v, out)
}

function push(out: SearchItem[], id: string, title: string, channel: string, duration: string) {
  if (!title) return
  out.push({ id, title, channel, duration, thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, url: `https://www.youtube.com/watch?v=${id}` })
}

/**
 * Tìm video trên YouTube theo từ khoá (innertube `search`, client WEB).
 * Trả về mã video + liên kết để app nhúng thẳng vào trình phát.
 */
export const onRequestGet = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120)
  // params=EgIQAQ%3D%3D: chỉ lấy VIDEO (bỏ kênh, danh sách phát)
  const filter = url.searchParams.get('cc') === '1' ? 'EgQQARgD' : 'EgIQAQ%3D%3D'
  if (!q) return fail('Thiếu từ khoá.')

  return cached(request, `/__cache/search?q=${encodeURIComponent(q)}&f=${filter}`, 60 * 60 * 6, async () => {
    let data: Record<string, unknown>
    try {
      data = await fetchJson<Record<string, unknown>>(
        'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'user-agent': CHROME_UA,
            'x-youtube-client-name': '1',
            'x-youtube-client-version': '2.20250312.04.00',
            cookie: 'CONSENT=YES+1; SOCS=CAI',
          },
          body: JSON.stringify({
            context: { client: { clientName: 'WEB', clientVersion: '2.20250312.04.00', hl: 'en', gl: 'US' } },
            query: q,
            params: decodeURIComponent(filter),
          }),
        },
        12000,
      )
    } catch (e) {
      return fail(`Không tìm được: ${(e as Error).message}`, 502)
    }
    const found: SearchItem[] = []
    walk(data, found)
    const seen = new Set<string>()
    const items: SearchItem[] = []
    for (const it of found) {
      if (seen.has(it.id)) continue
      seen.add(it.id)
      items.push(it)
      if (items.length >= 24) break
    }
    if (!items.length) return fail('Không có kết quả nào.', 502)
    return json({ success: true, items })
  })
}
