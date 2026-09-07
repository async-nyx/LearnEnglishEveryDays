import { arpabetToIpa, cached, cleanWord, fail, fetchJson, json, lemmaCandidates } from './_shared'
import { fromDictionaryApi, fromWiktionary } from './define-full'

const POS: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', u: '' }

interface DatamuseRow {
  word: string
  defs?: string[]
  tags?: string[]
}

class Unavailable extends Error {}

/**
 * Đường NHANH: Datamuse (WordNet + ARPAbet) và audio TTS.
 * Trả null khi từ điển KHÔNG có; ném Unavailable khi không gọi được (để không cache kết quả rỗng giả).
 */
async function fromDatamuse(word: string) {
  const u = new URL('https://api.datamuse.com/words')
  u.search = new URLSearchParams({ sp: word, md: 'dpr', max: '1', qe: 'sp' }).toString()
  let rows: DatamuseRow[]
  try {
    rows = await fetchJson<DatamuseRow[]>(u.toString(), {}, 6000)
  } catch (e) {
    throw new Unavailable((e as Error).message)
  }
  const row = rows[0]
  if (!row || row.word.toLowerCase() !== word || !row.defs?.length) return null
  const grouped = new Map<string, { definition: string; example: null }[]>()
  for (const d of row.defs) {
    const [pos, text] = d.split('\t')
    const key = POS[pos] ?? pos
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push({ definition: (text ?? '').trim(), example: null })
  }
  const pron = row.tags?.find((t) => t.startsWith('pron:'))?.slice(5) ?? ''
  return {
    word,
    phonetic: arpabetToIpa(pron),
    audio: `/api/tts?q=${encodeURIComponent(word)}`,
    meanings: Array.from(grouped.entries())
      .slice(0, 5)
      .map(([pos, defs]) => ({ pos, definitions: defs.slice(0, 3), synonyms: [] })),
    source: 'datamuse',
  }
}

async function firstFound<T>(fn: (w: string) => Promise<T | null>, cands: string[]): Promise<{ lemma: string; entry: T; unavailable: boolean } | { lemma: null; entry: null; unavailable: boolean }> {
  let unavailable = false
  const results = await Promise.all(
    cands.map((c) =>
      fn(c).catch((e) => {
        if (e instanceof Unavailable) unavailable = true
        return null
      }),
    ),
  )
  const idx = results.findIndex(Boolean)
  if (idx === -1) return { lemma: null, entry: null, unavailable }
  return { lemma: cands[idx], entry: results[idx] as T, unavailable }
}

export const onRequestGet = async ({ request }: { request: Request }) => {
  const word = cleanWord(new URL(request.url).searchParams.get('word'))
  if (!word) return fail('Thiếu từ cần tra.')
  return cached(request, `/__cache/define2?word=${word}`, 60 * 60 * 24 * 30, async () => {
    const cands = lemmaCandidates(word)
    const notFound = () => ({ success: true, word, lemma: word, found: false, phonetic: '', audio: `/api/tts?q=${encodeURIComponent(word)}`, meanings: [] })

    const dm = await firstFound(fromDatamuse, cands)
    if (dm.entry) return json({ success: true, lemma: dm.lemma, found: true, ...dm.entry, word })

    // Datamuse không có (hoặc không gọi được từ Cloudflare) -> dictionaryapi rồi Wiktionary, tự gắn audio TTS nếu thiếu
    for (const fn of [fromDictionaryApi, fromWiktionary]) {
      const r = await firstFound(async (w) => {
        try {
          return await fn(w, 9000)
        } catch (e) {
          throw new Unavailable((e as Error).message)
        }
      }, cands)
      if (r.entry) {
        const entry = r.entry as { audio?: string }
        if (!entry.audio) entry.audio = `/api/tts?q=${encodeURIComponent(r.lemma)}`
        return json({ success: true, lemma: r.lemma, found: true, ...entry, word })
      }
      if (r.unavailable) dm.unavailable = true
    }
    // nguồn nào cũng không gọi được -> trả rỗng nhưng KHÔNG cache
    return new Response(JSON.stringify(notFound()), {
      status: dm.unavailable ? 503 : 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  })
}
