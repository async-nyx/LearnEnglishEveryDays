import { arpabetToIpa, cached, cleanWord, fail, fetchJson, json, lemmaCandidates } from './_shared'

const POS: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', u: '' }

interface DatamuseRow {
  word: string
  defs?: string[]
  tags?: string[]
}

/** Đường NHANH: Datamuse (WordNet + ARPAbet) và audio TTS. */
async function fromDatamuse(word: string) {
  const u = new URL('https://api.datamuse.com/words')
  u.search = new URLSearchParams({ sp: word, md: 'dpr', max: '1', qe: 'sp' }).toString()
  const rows = await fetchJson<DatamuseRow[]>(u.toString(), {}, 6000)
  const row = rows[0]
  if (!row || row.word.toLowerCase() !== word || !row.defs?.length) return null
  const grouped = new Map<string, { definition: string; example: null }[]>()
  for (const d of row.defs) {
    const [pos, , text] = d.split(/(\t)/)
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

export const onRequestGet = async ({ request }: { request: Request }) => {
  const word = cleanWord(new URL(request.url).searchParams.get('word'))
  if (!word) return fail('Thiếu từ cần tra.')
  return cached(request, `/__cache/define?word=${word}`, 60 * 60 * 24 * 30, async () => {
    const cands = lemmaCandidates(word)
    const results = await Promise.all(cands.map((c) => fromDatamuse(c).catch(() => null)))
    const idx = results.findIndex(Boolean)
    if (idx === -1) {
      return json({ success: true, word, lemma: word, found: false, phonetic: '', audio: `/api/tts?q=${encodeURIComponent(word)}`, meanings: [] })
    }
    return json({ success: true, word, lemma: cands[idx], found: true, ...results[idx] })
  })
}
