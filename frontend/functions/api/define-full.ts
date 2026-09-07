import { CHROME_UA, cached, cleanWord, fail, fetchJson, json, lemmaCandidates } from './_shared'

interface DictEntry {
  word?: string
  phonetic?: string
  phonetics?: { text?: string; audio?: string }[]
  meanings?: { partOfSpeech?: string; definitions?: { definition?: string; example?: string }[]; synonyms?: string[] }[]
}

/** dictionaryapi.dev: IPA + audio người đọc + ví dụ, chậm (~20 s). */
export async function fromDictionaryApi(word: string, timeoutMs = 25000) {
  const entries = await fetchJson<DictEntry[]>(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`, {}, timeoutMs)
  if (!Array.isArray(entries) || !entries.length) return null
  let phonetic = ''
  let audio = ''
  const meanings: { pos: string; definitions: { definition: string; example: string | null }[]; synonyms: string[] }[] = []
  for (const e of entries) {
    if (!phonetic) phonetic = e.phonetic ?? ''
    for (const p of e.phonetics ?? []) {
      if (!phonetic && p.text) phonetic = p.text
      if (!audio && p.audio) audio = p.audio
    }
    for (const m of e.meanings ?? []) {
      meanings.push({
        pos: m.partOfSpeech ?? '',
        definitions: (m.definitions ?? []).slice(0, 3).map((d) => ({ definition: d.definition ?? '', example: d.example ?? null })),
        synonyms: (m.synonyms ?? []).slice(0, 6),
      })
    }
  }
  return { word: entries[0].word ?? word, phonetic, audio, meanings: meanings.slice(0, 5), source: 'dictionaryapi' }
}

const TAG = /<[^>]+>/g
const strip = (s: string) => (s ?? '').replace(TAG, '').replace(/\s+/g, ' ').trim()

/** Wiktionary REST: nghĩa theo từ loại + ví dụ, không có IPA/audio. */
export async function fromWiktionary(word: string, timeoutMs = 10000) {
  const data = await fetchJson<Record<string, { partOfSpeech?: string; definitions?: { definition?: string; parsedExamples?: { example?: string }[] }[] }[]>>(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${word}`,
    { headers: { 'user-agent': CHROME_UA, accept: 'application/json' } },
    timeoutMs,
  )
  const en = data?.en
  if (!en?.length) return null
  const meanings = []
  for (const m of en) {
    const defs = []
    for (const d of (m.definitions ?? []).slice(0, 3)) {
      const text = strip(d.definition ?? '')
      if (!text) continue
      const ex = d.parsedExamples?.[0]?.example
      defs.push({ definition: text, example: ex ? strip(ex) : null })
    }
    if (defs.length) meanings.push({ pos: (m.partOfSpeech ?? '').toLowerCase(), definitions: defs, synonyms: [] })
  }
  if (!meanings.length) return null
  return { word, phonetic: '', audio: '', meanings: meanings.slice(0, 5), source: 'wiktionary' }
}

async function firstFound(fn: (w: string) => Promise<unknown>, cands: string[]) {
  const results = await Promise.all(cands.map((c) => fn(c).catch(() => null)))
  const idx = results.findIndex(Boolean)
  return idx === -1 ? null : { lemma: cands[idx], entry: results[idx] as Record<string, unknown> }
}

export const onRequestGet = async ({ request }: { request: Request }) => {
  const word = cleanWord(new URL(request.url).searchParams.get('word'))
  if (!word) return fail('Thiếu từ cần tra.')
  return cached(request, `/__cache/define-full?word=${word}`, 60 * 60 * 24 * 30, async () => {
    const cands = lemmaCandidates(word)
    const hit = (await firstFound(fromDictionaryApi, cands)) ?? (await firstFound(fromWiktionary, cands))
    if (!hit) return json({ success: true, word, lemma: word, found: false, phonetic: '', audio: '', meanings: [] })
    return json({ success: true, lemma: hit.lemma, found: true, ...hit.entry, word })
  })
}
