import { CHROME_UA, fail, fetchJson, fetchText, formatTime, json } from './_shared'

/*
  LẤY PHỤ ĐỀ TRÊN CLOUDFLARE — bản chạy mây của youtube_transcript_api:
  1. tải trang watch để lấy INNERTUBE_API_KEY (không có thì dùng khoá web công khai)
  2. gọi youtubei/v1/player với client ANDROID -> captionTracks
  3. tải bản json3 của track ưu tiên -> ghép sự kiện thành các đoạn
*/

const WEB_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'

function extractVideoId(input: string): string | null {
  const s = input.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/.exec(s)
  return m ? m[1] : null
}

interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string
  name?: { runs?: { text: string }[]; simpleText?: string }
}

interface PlayerResponse {
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } }
  videoDetails?: { title?: string; author?: string }
  playabilityStatus?: { status?: string; reason?: string }
}

async function playerResponse(videoId: string): Promise<PlayerResponse> {
  let key = WEB_KEY
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: { 'accept-language': 'en-US,en;q=0.9', cookie: 'CONSENT=YES+1; SOCS=CAI' },
    }, 12000)
    const m = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)
    if (m) key = m[1]
  } catch {
    /* dùng khoá công khai */
  }
  const body = {
    context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en', gl: 'US' } },
    videoId,
  }
  return fetchJson<PlayerResponse>(`https://www.youtube.com/youtubei/v1/player?key=${key}&prettyPrint=false`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
      'x-youtube-client-name': '3',
      'x-youtube-client-version': '20.10.38',
    },
    body: JSON.stringify(body),
  }, 12000)
}

function trackName(t: CaptionTrack): string {
  return t.name?.simpleText ?? t.name?.runs?.map((r) => r.text).join('') ?? t.languageCode
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const manual = tracks.filter((t) => t.kind !== 'asr')
  const order = ['en', 'en-US', 'en-GB']
  for (const code of order) {
    const t = manual.find((x) => x.languageCode === code)
    if (t) return t
  }
  return (
    manual.find((t) => t.languageCode.startsWith('en')) ??
    tracks.find((t) => t.languageCode.startsWith('en')) ??
    manual.find((t) => t.languageCode.startsWith('vi')) ??
    tracks[0] ??
    null
  )
}

interface Json3 {
  events?: { tStartMs: number; dDurationMs?: number; segs?: { utf8: string }[] }[]
}

export const onRequestPost = async ({ request }: { request: Request }) => {
  let url = ''
  try {
    const body = (await request.json()) as { url?: string }
    url = (body.url ?? '').trim()
  } catch {
    return fail('Body không hợp lệ.')
  }
  if (!url) return fail('Vui lòng nhập liên kết YouTube.')
  const videoId = extractVideoId(url)
  if (!videoId) return fail('Không nhận diện được mã video từ liên kết.')

  let pr: PlayerResponse
  try {
    pr = await playerResponse(videoId)
  } catch (e) {
    return fail(`Không gọi được YouTube: ${(e as Error).message}`, 502)
  }
  const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
  const available = tracks.map((t) => ({ code: t.languageCode, name: trackName(t), generated: t.kind === 'asr' }))
  if (!tracks.length) {
    const reason = pr.playabilityStatus?.reason
    return json({ success: false, error: reason ? `YouTube: ${reason}` : 'Video này chưa có phụ đề nào để lấy.', available }, 400)
  }
  const track = pickTrack(tracks)!
  const capUrl = track.baseUrl.includes('fmt=') ? track.baseUrl.replace(/fmt=[^&]*/, 'fmt=json3') : `${track.baseUrl}&fmt=json3`

  let data: Json3
  try {
    data = await fetchJson<Json3>(capUrl, { headers: { 'user-agent': CHROME_UA } }, 12000)
  } catch (e) {
    return fail(`Không tải được phụ đề: ${(e as Error).message}`, 502)
  }

  const segments = []
  for (const ev of data.events ?? []) {
    if (!ev.segs) continue
    let text = ev.segs.map((s) => s.utf8).join('')
    text = text.replace(/\n/g, ' ').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    const start = ev.tStartMs / 1000
    segments.push({ start: Math.round(start * 1000) / 1000, duration: Math.round((ev.dDurationMs ?? 2000)) / 1000, text, timestamp: formatTime(start) })
  }

  // tiêu đề/kênh: videoDetails, dự phòng oEmbed
  let title = pr.videoDetails?.title ?? null
  let author = pr.videoDetails?.author ?? null
  let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  if (!title) {
    try {
      const o = await fetchJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
        {},
        6000,
      )
      title = o.title ?? null
      author = o.author_name ?? null
      thumbnail = o.thumbnail_url ?? thumbnail
    } catch {
      /* bỏ qua */
    }
  }

  return json({
    success: true,
    video_id: videoId,
    title,
    author,
    thumbnail,
    language: trackName(track),
    language_code: track.languageCode,
    is_generated: track.kind === 'asr',
    available,
    segments,
    segment_count: segments.length,
  })
}
