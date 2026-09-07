import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SpeakerHigh } from '@phosphor-icons/react'
import { playWordAudio } from '../../lib/speech'
import { shuffle } from '../../lib/text'
import type { VocabItem } from '../../lib/types'
import { useStore } from '../../store/useStore'
import { Button, EmptyState, Kbd, Progress, Segmented, cx } from '../ui'

type Dir = 'w2m' | 'm2w'
const MIN = 4

interface Question {
  item: VocabItem
  options: VocabItem[]
}

export function Quiz() {
  const vocab = useStore((s) => s.vocab)
  const rateVocab = useStore((s) => s.rateVocab)
  const usable = useMemo(() => vocab.filter((v) => v.meaningVi.trim()), [vocab])

  const [dir, setDir] = useState<Dir>('w2m')
  const [qs, setQs] = useState<Question[]>([])
  const [pos, setPos] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [tally, setTally] = useState({ ok: 0, bad: 0 })
  const [started, setStarted] = useState(false)

  const start = () => {
    const order = shuffle(usable)
    const built: Question[] = order.map((item) => {
      const others = shuffle(usable.filter((v) => v.id !== item.id && v.meaningVi !== item.meaningVi)).slice(0, 3)
      return { item, options: shuffle([item, ...others]) }
    })
    setQs(built)
    setPos(0)
    setPicked(null)
    setTally({ ok: 0, bad: 0 })
    setStarted(true)
  }

  const q = qs[pos]
  const finished = started && pos >= qs.length

  const pick = (id: string) => {
    if (!q || picked) return
    setPicked(id)
    const ok = id === q.item.id
    rateVocab(q.item.id, ok)
    setTally((t) => ({ ok: t.ok + (ok ? 1 : 0), bad: t.bad + (ok ? 0 : 1) }))
    if (dir === 'w2m' && ok) playWordAudio(q.item.audio, q.item.word)
  }
  const next = () => {
    setPicked(null)
    setPos((p) => p + 1)
  }

  useEffect(() => {
    if (!started || finished || !q) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const n = Number(e.key)
      if (!picked && n >= 1 && n <= q.options.length) pick(q.options[n - 1].id)
      else if (picked && e.key === 'Enter') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished, q, picked])

  if (usable.length < MIN) {
    return (
      <EmptyState
        title={`Cần ít nhất ${MIN} từ có nghĩa để tạo trắc nghiệm`}
        body={`Bạn đang có ${usable.length}. Lưu thêm từ từ phụ đề, các đáp án sai sẽ lấy từ chính sổ từ của bạn.`}
      />
    )
  }

  if (!started) {
    return (
      <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
        <div className="rounded-2xl bg-mat p-6 hairline">
          <h3 className="text-lg font-semibold tracking-tight">Trắc nghiệm 4 đáp án</h3>
          <p className="mt-1 max-w-[50ch] text-sm leading-relaxed text-chu-mo">
            Đáp án nhiễu lấy từ sổ từ của bạn nên câu hỏi khó dần theo số từ đã lưu. Chọn chiều hỏi rồi bắt đầu.
          </p>
          <div className="mt-4">
            <Segmented
              size="sm"
              value={dir}
              onChange={setDir}
              options={[
                { value: 'w2m', label: 'Từ → nghĩa' },
                { value: 'm2w', label: 'Nghĩa → từ' },
              ]}
            />
          </div>
          <Button variant="primary" className="mt-5" onClick={start}>
            Bắt đầu {usable.length} câu
          </Button>
        </div>
        <div className="flex flex-col justify-end gap-1 rounded-2xl border border-dashed border-vien p-5 text-sm text-chu-mo">
          <div className="flex items-center gap-2"><Kbd>1</Kbd>–<Kbd>4</Kbd> chọn đáp án</div>
          <div className="flex items-center gap-2"><Kbd>Enter</Kbd> câu tiếp</div>
        </div>
      </div>
    )
  }

  if (finished) {
    const total = tally.ok + tally.bad
    return (
      <div className="rounded-2xl bg-mat p-6 hairline">
        <h3 className="text-lg font-semibold tracking-tight">Kết quả</h3>
        <div className="mt-3 flex items-end gap-6">
          <div>
            <div className="font-mono text-4xl font-semibold text-chu">
              {tally.ok}<span className="text-chu-mo-hon">/{total}</span>
            </div>
            <div className="text-xs text-chu-mo-hon">câu đúng</div>
          </div>
          <div className="pb-1 font-mono text-2xl text-nhan-van">{total ? Math.round((tally.ok / total) * 100) : 0}%</div>
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={start}>
            
            Làm lại
          </Button>
          <Button variant="ghost" onClick={() => setStarted(false)}>Quay lại</Button>
        </div>
      </div>
    )
  }

  if (!q) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-chu-mo">
        <span>
          Câu <span className="font-mono text-chu">{pos + 1}</span>/<span className="font-mono">{qs.length}</span>
        </span>
        <span className="flex items-center gap-3 font-mono">
          <span className="text-dung">{tally.ok}</span>
          <span className="text-sai">{tally.bad}</span>
        </span>
      </div>
      <Progress value={pos / qs.length} />

      <div className="mx-auto w-full max-w-2xl">
        <motion.div key={q.item.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-mat p-6 hairline shadow-soft sm:p-7">
          <div className="text-xs font-medium uppercase tracking-wide text-chu-mo-hon">{dir === 'w2m' ? 'Từ này nghĩa là gì?' : 'Từ nào mang nghĩa này?'}</div>
          <div className="mt-2 flex items-center gap-3">
            {dir === 'w2m' ? (
              <>
                <span className="text-3xl font-semibold tracking-tight text-chu sm:text-4xl">{q.item.word}</span>
                {q.item.phonetic && <span className="font-mono text-chu-mo">{q.item.phonetic}</span>}
                <button className="press grid h-8 w-8 place-items-center rounded-lg text-chu-nhat hover:bg-mat-noi hover:text-chu" onClick={() => playWordAudio(q.item.audio, q.item.word)} aria-label="Phát âm">
                  <SpeakerHigh size={18} weight="fill" />
                </button>
              </>
            ) : (
              <span className="text-2xl font-semibold tracking-tight text-nhan-van sm:text-3xl">{q.item.meaningVi}</span>
            )}
          </div>
          {dir === 'm2w' && q.item.definitionEn && <div className="mt-2 text-sm text-chu-mo">{q.item.definitionEn}</div>}

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {q.options.map((o, i) => {
              const isAnswer = o.id === q.item.id
              const isPicked = o.id === picked
              const revealed = !!picked
              return (
                <button
                  key={o.id}
                  onClick={() => pick(o.id)}
                  disabled={revealed}
                  className={cx(
                    'press flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-[15px] leading-snug transition-colors',
                    !revealed && 'border-vien bg-nen hover:border-chu-mo-hon hover:bg-mat-chim',
                    revealed && isAnswer && 'border-dung/60 bg-dung/10 text-dung',
                    revealed && isPicked && !isAnswer && 'border-sai/60 bg-sai/10 text-sai',
                    revealed && !isPicked && !isAnswer && 'border-vien text-chu-mo-hon',
                  )}
                >
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-mat-noi font-mono text-[11px] text-chu-mo">{i + 1}</span>
                  <span>{dir === 'w2m' ? o.meaningVi : o.word}</span>
                </button>
              )
            })}
          </div>

          <AnimatePresence>
            {picked && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 flex flex-wrap items-center gap-3 border-t border-vien pt-4">
                <span className={cx('text-sm', picked === q.item.id ? 'text-dung' : 'text-sai')}>
                  {picked === q.item.id ? 'Đúng.' : `Sai. Đáp án: ${dir === 'w2m' ? q.item.meaningVi : q.item.word}`}
                </span>
                {q.item.example && <span className="w-full text-sm text-chu-mo sm:w-auto sm:flex-1">“{q.item.example}”</span>}
                <Button variant="primary" size="sm" onClick={next} className="ml-auto">
                  Câu tiếp
                  
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
