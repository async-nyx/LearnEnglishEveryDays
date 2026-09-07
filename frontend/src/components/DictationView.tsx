import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { answerWords, dictationDiff, isDictationCorrect } from '../lib/dictation'
import { translateText } from '../lib/api'
import { formatTime } from '../lib/text'
import type { DictationEntry, Sentence, TranscriptData } from '../lib/types'
import { usePlayer } from '../store/usePlayer'
import { useStore } from '../store/useStore'
import { ClickableText } from './ClickableText'
import { Button, EmptyState, Kbd, cx } from './ui'

const EMPTY: Record<number, DictationEntry> = {}
const BLANK: DictationEntry = { typed: '', shown: 0, ok: false }
const SLOW = 0.75

/*
  CHÉP CHÍNH TẢ — theo cách của betterVocab:
  · MỘT thẻ duy nhất, dãy ô số là bản đồ cả bài (trắng chưa động, đỏ đã làm mà chưa đúng, xanh đúng)
  · chỉ được NGHE, không lộ câu; "Kiểm tra" lộ đúng MỘT từ (từ đầu tiên chưa gõ đúng)
  · hàng từ: xanh = gõ đúng vị trí, tím = đã lộ, còn lại là chấm dài bằng từ ấy
  · tạm dừng giữ chỗ, bấm nghe lại thì nghe tiếp; đổi câu mới phát lại từ đầu
  · Enter = Kiểm tra · Ctrl/Alt + ← → = chuyển câu · Ctrl+Space = nghe
*/
export function DictationView({ data, sentences }: { data: TranscriptData; sentences: Sentence[] }) {
  const rows = useStore((s) => s.dictation[data.video_id] ?? EMPTY)
  const setDictation = useStore((s) => s.setDictation)
  const resetDictation = useStore((s) => s.resetDictation)
  const toast = useStore((s) => s.toast)

  const playing = usePlayer((s) => s.playing)
  const currentTime = usePlayer((s) => s.currentTime)
  const loop = usePlayer((s) => s.loop)
  const rate = usePlayer((s) => s.rate)
  const setRate = usePlayer((s) => s.setRate)
  const resumeRange = usePlayer((s) => s.resumeRange)
  const playRange = usePlayer((s) => s.playRange)
  const pause = usePlayer((s) => s.pause)

  const firstOpen = useMemo(() => {
    const i = sentences.findIndex((s) => !rows[s.id]?.ok)
    return i === -1 ? 0 : i
  }, [sentences, rows])
  const [at, setAt] = useState(firstOpen)
  const [showAll, setShowAll] = useState(false)
  const [showVi, setShowVi] = useState(true)
  const [vi, setVi] = useState<string | null>(null)
  const [autoNext, setAutoNext] = useState(true)
  const box = useRef<HTMLTextAreaElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const cur = sentences[at]
  const entry = cur ? rows[cur.id] ?? BLANK : BLANK

  const answer = useMemo(() => (cur ? answerWords(cur.text) : []), [cur])
  const diff = useMemo(() => (cur ? dictationDiff(entry.typed, cur.text) : []), [cur, entry.typed])
  const right = cur ? isDictationCorrect(entry.typed, cur.text) : false
  const done = sentences.filter((s) => rows[s.id]?.ok).length
  const slow = rate < 0.99

  const go = useCallback(
    (to: number) => {
      const n = Math.max(0, Math.min(sentences.length - 1, to))
      pause()
      setAt(n)
      setShowAll(false)
      requestAnimationFrame(() => box.current?.focus())
    },
    [sentences.length, pause],
  )

  // vào câu mới: tự phát, trỏ vào ô nhập, cuộn dãy ô số tới câu này
  useEffect(() => {
    if (!cur) return
    playRange(cur.start, cur.end, 'once')
    box.current?.focus()
    strip.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, data.video_id])

  // nghĩa tiếng Việt của câu đang chép
  useEffect(() => {
    setVi(null)
    if (!cur || !showVi) return
    let alive = true
    translateText(cur.text)
      .then((r) => alive && setVi(r.text))
      .catch((e: Error) => alive && setVi(`Không dịch được (${e.message})`))
    return () => {
      alive = false
    }
  }, [cur, showVi])

  const listen = useCallback(() => {
    if (!cur) return
    if (playing) pause()
    else resumeRange(cur.start, cur.end)
  }, [cur, playing, pause, resumeRange])

  const toggleSlow = () => setRate(slow ? 1 : SLOW)

  const type = (value: string) => {
    if (!cur) return
    const ok = isDictationCorrect(value, cur.text)
    setDictation(data.video_id, cur.id, { typed: value, ok })
    if (ok && !entry.ok) {
      toast('Đúng từng chữ.', 'ok')
      if (autoNext && at < sentences.length - 1) setTimeout(() => go(at + 1), 1100)
    }
  }

  /** Lộ thêm đúng MỘT từ: từ đầu tiên chưa gõ đúng. */
  const revealOne = useCallback(() => {
    if (!cur || right) return
    const firstMiss = diff.findIndex((d) => !d.hit)
    const upto = firstMiss < 0 ? answer.length : firstMiss + 1
    setDictation(data.video_id, cur.id, { shown: Math.max(entry.shown, upto) })
    box.current?.focus()
  }, [cur, right, diff, answer.length, entry.shown, setDictation, data.video_id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      const typing = tag === 'TEXTAREA' || tag === 'INPUT'
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (!typing || e.ctrlKey || e.altKey || e.metaKey)) {
        e.preventDefault()
        go(at + (e.key === 'ArrowLeft' ? -1 : 1))
      } else if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        listen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, at, listen])

  if (!cur) return <EmptyState title="Chưa có câu để chép" body="Phụ đề của video này trống." />

  const inRange = loop && Math.abs(loop.start - cur.start) < 0.01
  const elapsed = inRange ? Math.max(0, Math.min(cur.end - cur.start, currentTime - cur.start)) : 0
  const total = cur.end - cur.start

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* dãy ô số + điều hướng */}
      <div className="flex items-start gap-2">
        <div ref={strip} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sentences.map((s, i) => {
            const e = rows[s.id]
            const ok = e?.ok === true
            const touched = !ok && ((e?.shown ?? 0) > 0 || ((e?.typed ?? '').trim() !== '' && i !== at))
            return (
              <button
                key={s.id}
                aria-label={`Câu ${i + 1}`}
                aria-current={i === at}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => go(i)}
                className={cx(
                  'press grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[12px] font-semibold transition-colors',
                  ok ? 'bg-dung text-nhan-chu' : touched ? 'bg-sai text-nhan-chu' : 'bg-mat text-chu-mo ring-1 ring-vien',
                  i === at && 'ring-2 ring-nhan ring-offset-2 ring-offset-nen',
                )}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button size="sm" variant="subtle" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Câu trước">
            Trước
          </Button>
          <Button size="sm" variant="subtle" onClick={() => go(at + 1)} disabled={at >= sentences.length - 1} aria-label="Câu sau">
            Sau
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-chu-mo">
        <span>
          Câu <span className="font-mono text-chu">{at + 1}</span>/<span className="font-mono">{sentences.length}</span>
          <span className="mx-2 text-vien-manh">·</span>
          đúng <span className="font-mono text-chu">{done}</span>
        </span>
        <span className="hidden items-center gap-1 xl:flex">
          <Kbd>Enter</Kbd> kiểm tra · <Kbd>Ctrl</Kbd>+<Kbd>Space</Kbd> nghe · <Kbd>Ctrl</Kbd>+<Kbd>←</Kbd><Kbd>→</Kbd> đổi câu
        </span>
      </div>

      {/* thẻ */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="rounded-2xl bg-mat p-4 hairline shadow-soft sm:p-5">
          {/* thanh nghe */}
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={listen} aria-label={playing ? 'Tạm dừng' : 'Nghe câu này'} className="h-11 rounded-xl px-4">
              {playing && inRange ? 'Dừng' : 'Nghe'}
            </Button>
            <div className="min-w-0 flex-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-mat-noi">
                <div className="h-full rounded-full bg-nhan transition-[width] duration-100" style={{ width: `${total > 0 ? (elapsed / total) * 100 : 0}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[11px] text-chu-mo-hon">
                <span>{elapsed.toFixed(1)}s</span>
                <span>
                  {formatTime(cur.start)} · {total.toFixed(1)}s · {answer.length} từ
                </span>
              </div>
            </div>
            <button
              onClick={toggleSlow}
              aria-pressed={slow}
              title="Nghe chậm 0.75×"
              className={cx(
                'press inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium hairline',
                slow ? 'border-nhan/40 bg-nhan-nhat text-nhan-van' : 'bg-mat text-chu-nhat hover:text-chu',
              )}
            >
              
              <span className="hidden sm:inline">Chậm</span>
            </button>
          </div>

          <div className="mt-3 flex items-start gap-2 text-[14px] leading-relaxed">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowVi((v) => !v)}
              className="press mt-0.5 shrink-0 rounded-md bg-mat-noi px-1.5 py-0.5 text-[11px] font-medium text-chu-mo hover:text-chu"
              title={showVi ? 'Ẩn nghĩa' : 'Hiện nghĩa'}
            >
              Nghĩa
            </button>
            {showVi ? (
              <span className="text-nhan-van">{vi ?? <span className="skeleton inline-block h-4 w-1/2 align-middle" />}</span>
            ) : (
              <span className="text-chu-mo-hon">đã ẩn</span>
            )}
          </div>

          <textarea
            ref={box}
            value={entry.typed}
            onChange={(e) => type(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (right) go(at + 1)
                else revealOne()
              }
            }}
            rows={2}
            placeholder="Gõ lại câu vừa nghe…"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label={`Chép chính tả câu ${at + 1}`}
            className={cx(
              'mt-4 w-full resize-none rounded-xl border bg-nen px-4 py-3 text-[16px] leading-relaxed text-chu placeholder:text-chu-mo-hon focus:outline-none',
              right ? 'border-dung/60' : 'border-vien focus:border-nhan/60',
            )}
          />

          {/* hàng từ */}
          <p className="mt-3 flex flex-wrap items-center gap-1">
            {answer.map((word, i) => {
              const hit = diff[i]?.hit === true
              const open = hit || i < entry.shown || showAll
              return (
                <span
                  key={`${word}-${i}`}
                  className={cx(
                    'inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[13.5px] font-semibold',
                    hit ? 'bg-dung-nen text-dung' : open ? 'bg-nhan-nhat text-nhan-van' : 'bg-mat-noi text-chu-mo-hon',
                  )}
                >
                  {open ? word : '•'.repeat(Math.min(word.length, 12))}
                </span>
              )
            })}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {right ? (
              <Button variant="primary" onClick={() => go(at + 1)} disabled={at >= sentences.length - 1} className="flex-1 sm:flex-none">
                Câu tiếp
                
              </Button>
            ) : (
              <Button variant="primary" onMouseDown={(e) => e.preventDefault()} onClick={revealOne} disabled={entry.shown >= answer.length} className="flex-1 sm:flex-none">
                Kiểm tra
              </Button>
            )}
            <Button variant="ghost" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowAll((v) => !v)} className={cx(showAll && 'text-luu-y')}>
              
              {showAll ? 'Ẩn câu' : 'Hiện cả câu'}
            </Button>
            <label className="ml-auto flex items-center gap-2 text-xs text-chu-mo">
              <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} className="accent-[var(--nhan)]" />
              Đúng thì tự sang câu tiếp
            </label>
          </div>

          <AnimatePresence>
            {(right || showAll) && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 border-t border-vien pt-3 text-[15px] leading-relaxed text-chu">
                <span className="mr-2 text-xs font-medium uppercase tracking-wide text-chu-mo-hon">Câu gốc</span>
                <ClickableText text={cur.text} start={cur.start} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {done > 0 && (
          <div className="mt-3 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('Xoá toàn bộ bài chép của video này?')) {
                  resetDictation(data.video_id)
                  go(0)
                }
              }}
            >
              
              Làm lại từ đầu
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
