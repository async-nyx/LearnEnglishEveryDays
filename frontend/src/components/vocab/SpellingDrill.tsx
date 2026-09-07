import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SpeakerHigh } from '@phosphor-icons/react'
import { playWordAudio } from '../../lib/speech'
import { normalizeWord, shuffle } from '../../lib/text'
import type { VocabItem } from '../../lib/types'
import { useStore } from '../../store/useStore'
import { Button, EmptyState, Kbd, Progress, cx } from '../ui'

export function SpellingDrill() {
  const vocab = useStore((s) => s.vocab)
  const rateVocab = useStore((s) => s.rateVocab)
  const byId = useMemo(() => new Map(vocab.map((v) => [v.id, v])), [vocab])

  const [queue, setQueue] = useState<string[]>([])
  const [pos, setPos] = useState(0)
  const [input, setInput] = useState('')
  const [state, setState] = useState<'typing' | 'right' | 'wrong'>('typing')
  const [tally, setTally] = useState({ ok: 0, bad: 0 })
  const [started, setStarted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const start = () => {
    setQueue(shuffle(vocab).map((v) => v.id))
    setPos(0)
    setInput('')
    setState('typing')
    setTally({ ok: 0, bad: 0 })
    setStarted(true)
  }

  const card: VocabItem | undefined = byId.get(queue[pos])
  const finished = started && pos >= queue.length

  useEffect(() => {
    if (card) {
      inputRef.current?.focus()
      playWordAudio(card.audio, card.word)
    }
  }, [card])

  const check = () => {
    if (!card || !input.trim()) return
    const ok = normalizeWord(input) === normalizeWord(card.word)
    setState(ok ? 'right' : 'wrong')
    rateVocab(card.id, ok)
    setTally((t) => ({ ok: t.ok + (ok ? 1 : 0), bad: t.bad + (ok ? 0 : 1) }))
  }

  const next = () => {
    setPos((p) => p + 1)
    setInput('')
    setState('typing')
  }

  if (vocab.length === 0) {
    return <EmptyState title="Chưa có từ để chép" body="Lưu vài từ từ phụ đề trước." />
  }

  if (!started) {
    return (
      <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
        <div className="rounded-2xl bg-mat p-6 hairline">
          <h3 className="text-lg font-semibold tracking-tight">Nghe và chép từ</h3>
          <p className="mt-1 max-w-[50ch] text-sm leading-relaxed text-chu-mo">
            Bạn nghe phát âm, nhìn nghĩa tiếng Việt và định nghĩa, rồi gõ đúng chính tả từ đó. Sai chữ nào sẽ được tô đỏ để bạn nhìn thấy ngay.
          </p>
          <Button variant="primary" className="mt-5" onClick={start}>
            Bắt đầu với {vocab.length} từ
          </Button>
        </div>
        <div className="flex flex-col justify-end gap-1 rounded-2xl border border-dashed border-vien p-5 text-sm text-chu-mo">
          <div className="flex items-center gap-2"><Kbd>Enter</Kbd> kiểm tra / từ tiếp</div>
          <div className="flex items-center gap-2"><Kbd>Ctrl</Kbd>+<Kbd>Space</Kbd> nghe lại</div>
        </div>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="rounded-2xl bg-mat p-6 hairline">
        <h3 className="text-lg font-semibold tracking-tight">Xong lượt chép</h3>
        <div className="mt-3 flex items-end gap-6">
          <div>
            <div className="font-mono text-4xl font-semibold text-dung">{tally.ok}</div>
            <div className="text-xs text-chu-mo-hon">đúng</div>
          </div>
          <div>
            <div className="font-mono text-4xl font-semibold text-sai">{tally.bad}</div>
            <div className="text-xs text-chu-mo-hon">sai</div>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={start}>
            
            Lượt mới
          </Button>
          <Button variant="ghost" onClick={() => setStarted(false)}>Quay lại</Button>
        </div>
      </div>
    )
  }

  if (!card) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-chu-mo">
        <span>
          Từ <span className="font-mono text-chu">{pos + 1}</span>/<span className="font-mono">{queue.length}</span>
        </span>
        <span className="flex items-center gap-3 font-mono">
          <span className="text-dung">{tally.ok}</span>
          <span className="text-sai">{tally.bad}</span>
        </span>
      </div>
      <Progress value={pos / queue.length} />

      <div className="mx-auto w-full max-w-xl rounded-3xl bg-mat p-6 hairline shadow-soft sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-chu-mo-hon">Nghĩa</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-nhan-van">{card.meaningVi || '—'}</div>
            {card.definitionEn && (
              <div className="mt-2 text-[15px] leading-relaxed text-chu-nhat">
                {card.pos && <span className="mr-1.5 rounded bg-vien px-1.5 py-0.5 font-mono text-[11px] text-chu-nhat">{card.pos}</span>}
                {card.definitionEn}
              </div>
            )}
          </div>
          <Button size="icon" variant="subtle" onClick={() => playWordAudio(card.audio, card.word)} aria-label="Nghe lại" className="h-11 w-11 shrink-0 rounded-xl">
            <SpeakerHigh size={20} weight="fill" />
          </Button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <label htmlFor="spell-input" className="text-xs font-medium text-chu-mo">
            Gõ từ tiếng Anh ({card.word.length} chữ)
          </label>
          <input
            id="spell-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                state === 'typing' ? check() : next()
              } else if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                playWordAudio(card.audio, card.word)
              }
            }}
            disabled={state !== 'typing'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className={cx(
              'h-14 w-full rounded-xl border bg-nen px-4 font-mono text-2xl tracking-wide text-chu focus:outline-none',
              state === 'typing' && 'border-vien focus:border-nhan/60',
              state === 'right' && 'border-dung/60 text-dung',
              state === 'wrong' && 'border-sai/60',
            )}
          />
          <AnimatePresence>
            {state === 'wrong' && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="font-mono text-2xl tracking-wide">
                <LetterDiff target={card.word} input={input} />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2 pt-1">
            {state === 'typing' ? (
              <Button variant="primary" onClick={check} disabled={!input.trim()}>
                
                Kiểm tra
              </Button>
            ) : (
              <Button variant="primary" onClick={next}>
                Từ tiếp
                
              </Button>
            )}
            {state === 'typing' && (
              <Button
                variant="ghost"
                onClick={() => {
                  setState('wrong')
                  rateVocab(card.id, false)
                  setTally((t) => ({ ...t, bad: t.bad + 1 }))
                }}
              >
                Không nhớ
              </Button>
            )}
            {state === 'right' && <span className="text-sm text-dung">Chính xác.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Hiện từ đúng, tô đỏ chữ người dùng gõ khác. */
function LetterDiff({ target, input }: { target: string; input: string }) {
  const t = target.toLowerCase()
  const u = input.toLowerCase().trim()
  return (
    <span>
      {t.split('').map((ch, i) => (
        <span key={i} className={cx(u[i] === ch ? 'text-dung' : 'rounded bg-sai/15 text-sai')}>
          {ch}
        </span>
      ))}
    </span>
  )
}
