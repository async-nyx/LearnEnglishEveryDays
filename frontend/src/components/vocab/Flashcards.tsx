import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SpeakerHigh } from '@phosphor-icons/react'
import { isDue } from '../../lib/srs'
import { playWordAudio } from '../../lib/speech'
import { shuffle } from '../../lib/text'
import { findImage } from '../../lib/images'
import type { VocabItem } from '../../lib/types'
import { useStore } from '../../store/useStore'
import { Button, EmptyState, Kbd, Progress, cx } from '../ui'
import { Example } from './VocabList'

type Scope = 'due' | 'all'

export function Flashcards() {
  const vocab = useStore((s) => s.vocab)
  const rateVocab = useStore((s) => s.rateVocab)
  const imageSlugs = useStore((s) => s.imageSlugs)
  const [scope, setScope] = useState<Scope>('due')
  const [queue, setQueue] = useState<string[]>([])
  const [pos, setPos] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [tally, setTally] = useState({ ok: 0, bad: 0 })
  const [started, setStarted] = useState(false)

  const dueCount = useMemo(() => vocab.filter((v) => isDue(v.srs)).length, [vocab])
  const byId = useMemo(() => new Map(vocab.map((v) => [v.id, v])), [vocab])

  const start = (sc: Scope) => {
    const pool = sc === 'due' ? vocab.filter((v) => isDue(v.srs)) : vocab
    setScope(sc)
    setQueue(shuffle(pool).map((v) => v.id))
    setPos(0)
    setFlipped(false)
    setTally({ ok: 0, bad: 0 })
    setStarted(true)
  }

  const card: VocabItem | undefined = byId.get(queue[pos])
  const finished = started && pos >= queue.length

  const answer = (ok: boolean) => {
    if (!card) return
    rateVocab(card.id, ok)
    setTally((t) => ({ ok: t.ok + (ok ? 1 : 0), bad: t.bad + (ok ? 0 : 1) }))
    setFlipped(false)
    setTimeout(() => setPos((p) => p + 1), 120)
  }

  useEffect(() => {
    if (!started || finished) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (flipped && (e.key === '1' || e.key === 'ArrowLeft')) answer(false)
      else if (flipped && (e.key === '2' || e.key === 'ArrowRight')) answer(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished, flipped, card])

  if (vocab.length === 0) {
    return <EmptyState title="Chưa có thẻ nào" body="Lưu vài từ từ phụ đề, thẻ sẽ tự sinh ra ở đây." />
  }

  if (!started) {
    return (
      <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
        <div className="rounded-2xl bg-mat p-6 hairline">
          <h3 className="text-lg font-semibold tracking-tight">Thẻ lật theo lịch ôn</h3>
          <p className="mt-1 max-w-[50ch] text-sm leading-relaxed text-chu-mo">
            Mặt trước là từ và phiên âm; lật ra để xem nghĩa, định nghĩa và câu gốc trong video. Đánh “Nhớ” thì khoảng cách ôn giãn ra, “Chưa nhớ” thì quay về hộp đầu.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => start('due')} disabled={dueCount === 0}>
              Ôn {dueCount} từ tới hạn
            </Button>
            <Button variant="outline" onClick={() => start('all')}>
              Lật tất cả {vocab.length} từ
            </Button>
          </div>
          {dueCount === 0 && <div className="mt-3 text-xs text-dung">Hôm nay không còn từ nào tới hạn.</div>}
        </div>
        <div className="flex flex-col justify-end gap-1 rounded-2xl border border-dashed border-vien p-5 text-sm text-chu-mo">
          <div className="flex items-center gap-2"><Kbd>Space</Kbd> lật thẻ</div>
          <div className="flex items-center gap-2"><Kbd>1</Kbd> hoặc <Kbd>←</Kbd> chưa nhớ</div>
          <div className="flex items-center gap-2"><Kbd>2</Kbd> hoặc <Kbd>→</Kbd> nhớ rồi</div>
        </div>
      </div>
    )
  }

  if (finished) {
    const total = tally.ok + tally.bad
    return (
      <div className="rounded-2xl bg-mat p-6 hairline">
        <h3 className="text-lg font-semibold tracking-tight">Xong lượt này</h3>
        <div className="mt-3 flex items-end gap-6">
          <div>
            <div className="font-mono text-4xl font-semibold text-dung">{tally.ok}</div>
            <div className="text-xs text-chu-mo-hon">nhớ</div>
          </div>
          <div>
            <div className="font-mono text-4xl font-semibold text-sai">{tally.bad}</div>
            <div className="text-xs text-chu-mo-hon">chưa nhớ</div>
          </div>
          <div className="pb-1 text-sm text-chu-mo">{total > 0 && `${Math.round((tally.ok / total) * 100)}% đúng`}</div>
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={() => start(scope)}>
            
            Lượt mới
          </Button>
          <Button variant="ghost" onClick={() => setStarted(false)}>Quay lại</Button>
        </div>
      </div>
    )
  }

  if (!card) return null
  const image = findImage(imageSlugs, card.lemma, card.word)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-chu-mo">
        <span>
          Thẻ <span className="font-mono text-chu">{pos + 1}</span>/<span className="font-mono">{queue.length}</span>
        </span>
        <span className="flex items-center gap-3 font-mono">
          <span className="text-dung">{tally.ok}</span>
          <span className="text-sai">{tally.bad}</span>
        </span>
      </div>
      <Progress value={pos / queue.length} />

      <div className="perspective-1200 mx-auto w-full max-w-xl">
        <motion.div
          className={cx('preserve-3d relative w-full cursor-pointer select-none', image ? 'h-[460px] sm:h-[500px]' : 'h-[320px] sm:h-[340px]')}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 22 }}
          onClick={() => setFlipped((f) => !f)}
        >
          {/* mặt trước */}
          <div className="backface-hidden absolute inset-0 flex flex-col rounded-3xl bg-mat p-7 hairline shadow-soft">
            <div className="text-xs font-medium uppercase tracking-wide text-chu-mo-hon">Từ</div>
            <div className="flex flex-1 flex-col items-start justify-center gap-2">
              <div className="text-4xl font-semibold tracking-tight text-chu sm:text-5xl">{card.word}</div>
              <div className="flex items-center gap-2 font-mono text-base text-chu-mo">
                {card.phonetic || '—'}
                <button
                  className="press grid h-8 w-8 place-items-center rounded-lg text-chu-nhat hover:bg-mat-noi hover:text-chu"
                  onClick={(e) => {
                    e.stopPropagation()
                    playWordAudio(card.audio, card.word)
                  }}
                  aria-label="Phát âm"
                >
                  <SpeakerHigh size={18} weight="fill" />
                </button>
              </div>
            </div>
            <div className="text-xs text-chu-mo-hon">Bấm hoặc nhấn Space để lật</div>
          </div>

          {/* mặt sau */}
          <div className="backface-hidden absolute inset-0 flex flex-col rounded-3xl bg-mat-chim p-7 hairline shadow-soft [transform:rotateY(180deg)]">
            <div className="text-xs font-medium uppercase tracking-wide text-chu-mo-hon">Nghĩa</div>
            {image && (
              <div className="mt-3 aspect-[16/10] w-full overflow-hidden rounded-2xl bg-mat-noi">
                <img src={image} alt={card.meaningVi} className="h-full w-full object-cover" />
              </div>
            )}
            <div className="flex flex-1 flex-col justify-center gap-3 overflow-hidden">
              <div className="text-2xl font-semibold tracking-tight text-nhan-van sm:text-3xl">{card.meaningVi || '—'}</div>
              {card.definitionEn && (
                <div className="text-[15px] leading-relaxed text-chu-nhat">
                  {card.pos && <span className="mr-1.5 rounded bg-vien px-1.5 py-0.5 font-mono text-[11px] text-chu-nhat">{card.pos}</span>}
                  {card.definitionEn}
                </div>
              )}
              {card.example && (
                <div className="border-t border-vien pt-3 text-sm leading-relaxed text-chu-mo">
                  <Example text={card.example} word={card.word} />
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {flipped && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mx-auto flex w-full max-w-xl gap-3">
            <Button variant="outline" size="lg" className={cx('flex-1 text-sai hover:bg-sai/10')} onClick={() => answer(false)}>
              
              Chưa nhớ
            </Button>
            <Button variant="outline" size="lg" className="flex-1 text-dung hover:bg-dung/10" onClick={() => answer(true)}>
              
              Nhớ rồi
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
