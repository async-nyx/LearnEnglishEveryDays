import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DECKS, loadDeck, partLabel, type DeckFile, type DeckInfo, type DeckWord } from '../../lib/decks'
import { playWordAudio } from '../../lib/speech'
import { useStore } from '../../store/useStore'
import { Button, cx } from '../ui'

/**
 * BỘ TỪ CÓ SẴN — TOEIC (TOEIC Service List) và HSK 1–4.
 * Chọn bộ → chọn chặng → xem 200 (hoặc 50) từ một lần, nghe phát âm, thêm cả chặng vào sổ từ để
 * ôn bằng thẻ lật / chép từ / trắc nghiệm như từ lưu từ video.
 */
export function DeckBrowser() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [deck, setDeck] = useState<DeckFile | null>(null)
  const [part, setPart] = useState(1)
  const [q, setQ] = useState('')
  const vocab = useStore((s) => s.vocab)
  const addVocab = useStore((s) => s.addVocab)
  const removeVocab = useStore((s) => s.removeVocab)
  const toast = useStore((s) => s.toast)

  useEffect(() => {
    if (!openId) return
    let alive = true
    setDeck(null)
    void loadDeck(openId).then((d) => alive && setDeck(d))
    return () => {
      alive = false
    }
  }, [openId])

  const saved = useMemo(() => new Map(vocab.map((v) => [v.word.toLowerCase(), v.id])), [vocab])
  const info = DECKS.find((d) => d.id === openId) ?? null

  const words = useMemo(() => {
    if (!deck) return []
    const needle = q.trim().toLowerCase()
    if (needle) return deck.items.filter((w) => w.w.toLowerCase().includes(needle) || w.vi.toLowerCase().includes(needle)).slice(0, 300)
    return deck.items.filter((w) => w.part === part)
  }, [deck, part, q])

  const add = (w: DeckWord, quiet = false) => {
    if (saved.has(w.w.toLowerCase())) return false
    addVocab({
      word: w.w,
      lemma: w.w,
      phonetic: w.pinyin ?? '',
      audio: '',
      meaningVi: w.defVi || w.vi,
      definitionEn: w.def ?? '',
      pos: w.pos ?? '',
      example: w.ex ?? '',
      videoId: '',
      videoTitle: info ? `Bộ từ · ${info.title}` : 'Bộ từ',
      start: 0,
    })
    if (!quiet) toast(`Đã thêm “${w.w}” vào sổ từ`, 'ok')
    return true
  }

  const addAllInPart = () => {
    let n = 0
    for (const w of words) if (add(w, true)) n += 1
    toast(n ? `Đã thêm ${n} từ vào sổ từ` : 'Chặng này đã có đủ trong sổ từ rồi', n ? 'ok' : undefined)
  }

  if (!info) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {DECKS.map((d) => (
          <DeckCard key={d.id} deck={d} savedCount={0} onOpen={() => { setOpenId(d.id); setPart(1); setQ('') }} />
        ))}
        {DECKS.length === 0 && (
          <p className="text-sm text-chu-mo">Chưa dựng bộ từ nào. Chạy <code className="font-mono">py scripts/build_decks.py</code>.</p>
        )}
      </div>
    )
  }

  const doneInPart = words.filter((w) => saved.has(w.w.toLowerCase())).length

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <button onClick={() => setOpenId(null)} className="press mb-1 text-[13px] font-medium text-chu-mo hover:text-chu">
            ‹ Tất cả bộ từ
          </button>
          <h3 className="text-[20px] font-semibold tracking-tight">{info.title}</h3>
          <p className="mt-0.5 max-w-[64ch] text-[13.5px] leading-relaxed text-chu-mo">{info.blurb}</p>
          <p className="mt-1 text-[11.5px] text-chu-mo-hon">Nguồn: {info.credit}</p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm từ hoặc nghĩa…"
          className="h-10 w-52 rounded-xl border border-vien bg-nen px-3 text-sm text-chu placeholder:text-chu-mo-hon focus:border-chu-mo-hon focus:outline-none"
        />
      </div>

      {!q && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {Array.from({ length: info.parts }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPart(p)}
              className={cx(
                'press h-8 rounded-lg px-2.5 text-[12.5px] font-medium hairline',
                p === part ? 'border-nhan/40 bg-nhan-nhat text-nhan-van' : 'bg-mat text-chu-nhat hover:text-chu',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-chu-mo">
          {q ? `${words.length} từ khớp “${q}”` : `${partLabel(part)} · ${words.length} từ · đã lưu ${doneInPart}`}
        </span>
        <Button variant="primary" onClick={addAllInPart} className="ml-auto">
          Thêm {q ? 'các từ đang xem' : partLabel(part).toLowerCase()} vào sổ
        </Button>
      </div>

      {!deck && <div className="mt-4 grid gap-2">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>}

      <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
        <AnimatePresence initial={false}>
          {words.map((w) => {
            const id = saved.get(w.w.toLowerCase())
            return (
              <motion.li
                key={w.w + w.rank}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-mat px-3 py-2 hairline"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[15px] font-semibold text-chu">{w.w}</span>
                    {w.pinyin && <span className="text-[12.5px] text-chu-mo-hon">{w.pinyin}</span>}
                    {w.pos && <span className="rounded bg-mat-noi px-1.5 text-[10.5px] text-chu-mo">{w.pos}</span>}
                  </div>
                  <div className="text-[13px] text-chu-nhat">{w.vi}</div>
                  {(w.defVi || w.def) && (
                    <div className="text-[12px] leading-snug text-chu-mo-hon" title={w.def}>
                      {w.defVi || w.def}
                    </div>
                  )}
                  {w.ex && <div className="truncate text-[12px] text-chu-mo-hon">{w.ex}{w.exVi ? ` — ${w.exVi}` : ''}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => playWordAudio('', w.w)}
                    className="press h-8 w-8 rounded-lg text-[13px] text-chu-nhat hover:bg-mat-noi hover:text-chu"
                    aria-label="Nghe"
                    title="Nghe phát âm"
                  >
                    ♪
                  </button>
                  <button
                    onClick={() => (id ? (removeVocab(id), toast('Đã bỏ khỏi sổ từ')) : add(w))}
                    className={cx(
                      'press h-8 rounded-lg px-2 text-[12.5px] font-medium',
                      id ? 'bg-nhan-nhat text-nhan-van' : 'bg-mat-noi text-chu-nhat hover:text-chu',
                    )}
                  >
                    {id ? 'Đã lưu' : 'Lưu'}
                  </button>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>
    </div>
  )
}

function DeckCard({ deck, onOpen }: { deck: DeckInfo; savedCount: number; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="press grid w-full grid-cols-[minmax(0,1fr)] gap-1 rounded-2xl bg-mat p-4 text-left hairline transition-colors hover:border-chu-mo-hon">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-mat-noi px-1.5 py-0.5 font-mono text-[11px] font-semibold text-chu-nhat">
          {deck.lang === 'en' ? 'EN' : '中文'}
        </span>
        <span className="text-[16px] font-semibold tracking-tight text-chu">{deck.title}</span>
        <span className="ml-auto font-mono text-[12px] text-chu-mo">{deck.count} từ</span>
      </div>
      <p className="text-[13px] leading-relaxed text-chu-mo">{deck.blurb}</p>
      <p className="text-[11px] text-chu-mo-hon">{deck.parts} chặng · nguồn: {deck.credit}</p>
    </button>
  )
}
