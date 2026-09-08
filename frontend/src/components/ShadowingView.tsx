import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { translateSentence } from '../lib/api'
import { createRecognizer, speak, speechRecognitionSupported, startRecording, type Recognizer, type RecorderHandle } from '../lib/speech'
import { diffWords, formatTime, type DiffOp } from '../lib/text'
import type { Sentence, TranscriptData } from '../lib/types'
import { usePlayer } from '../store/usePlayer'
import { useStore } from '../store/useStore'
import { ClickableText } from './ClickableText'
import { Button, EmptyState, Progress, ScoreBadge, cx } from './ui'

const EMPTY: Record<number, number> = {}

export function ShadowingView({ data, sentences }: { data: TranscriptData; sentences: Sentence[] }) {
  const progress = useStore((s) => s.shadowing[data.video_id] ?? EMPTY)
  const setScore = useStore((s) => s.setShadowScore)
  const toast = useStore((s) => s.toast)
  const playRange = usePlayer((s) => s.playRange)
  const pause = usePlayer((s) => s.pause)
  const loop = usePlayer((s) => s.loop)
  const playing = usePlayer((s) => s.playing)
  const loopCount = usePlayer((s) => s.loopCount)
  const rate = usePlayer((s) => s.rate)
  const setRate = usePlayer((s) => s.setRate)

  // bám theo chỗ video đang phát khi vừa chuyển sang chế độ này
  const active = useMemo(() => {
    const t = usePlayer.getState().currentTime
    if (t > 0.5) {
      let best = 0
      for (let i = 0; i < sentences.length; i++) if (sentences[i].start <= t + 0.05) best = i
      return best
    }
    const i = sentences.findIndex((s) => (progress[s.id] ?? 0) < 0.8)
    return i === -1 ? 0 : i
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentences])
  const [idx, setIdx] = useState(active)
  const [showVi, setShowVi] = useState(true)
  const [vi, setVi] = useState<string | null>(null)

  const [recording, setRecording] = useState(false)
  const [interim, setInterim] = useState('')
  const [result, setResult] = useState<{ heard: string; ops: DiffOp[]; score: number } | null>(null)
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const recRef = useRef<RecorderHandle | null>(null)
  const asrRef = useRef<Recognizer | null>(null)
  const asrSupported = speechRecognitionSupported()

  /*
    CHẠY LIÊN TIẾP: phát câu → im lặng một quãng bằng độ dài câu (tối thiểu 1,5 s) để người học
    đọc theo → tự sang câu kế → phát. Dừng khi bấm lại hoặc hết bài.
  */
  const [chain, setChain] = useState(false)
  const chainStage = useRef<'idle' | 'playing' | 'gap'>('idle')
  const gapTimer = useRef<number | null>(null)

  const cur = sentences[idx]
  const done = Object.values(progress).filter((v) => v >= 0.8).length

  const clearGap = () => {
    if (gapTimer.current) window.clearTimeout(gapTimer.current)
    gapTimer.current = null
  }

  const go = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(sentences.length - 1, i))
      setIdx(n)
      setResult(null)
      setInterim('')
      setVi(null)
      if (clipUrl) URL.revokeObjectURL(clipUrl)
      setClipUrl(null)
      if (!chain) pause()
    },
    [sentences.length, pause, clipUrl, chain],
  )

  useEffect(() => {
    if (!showVi || !cur || vi) return
    translateSentence(cur.text)
      .then((r) => setVi(r.text))
      .catch((e: Error) => setVi(`Không dịch được (${e.message})`))
  }, [showVi, cur, vi])

  const listenOnce = () => cur && playRange(cur.start, cur.end, 'once')
  const isLooping = !!loop && !!cur && Math.abs(loop.start - cur.start) < 0.01 && loop.mode === 'repeat'
  const toggleLoop = () => (isLooping ? pause() : cur && playRange(cur.start, cur.end, 'repeat'))

  // chạy liên tiếp: câu vừa phát xong (playing về false, loop bị xoá) -> chờ -> sang câu kế
  useEffect(() => {
    if (!chain || !cur) return
    if (chainStage.current === 'playing' && !playing && loop === null) {
      chainStage.current = 'gap'
      const gap = Math.max(1500, (cur.end - cur.start) * 1000)
      gapTimer.current = window.setTimeout(() => {
        if (idx >= sentences.length - 1) {
          setChain(false)
          chainStage.current = 'idle'
          toast('Đã chạy hết bài.', 'ok')
          return
        }
        setIdx(idx + 1)
        setResult(null)
        setVi(null)
      }, gap)
    }
  }, [chain, playing, loop, cur, idx, sentences.length, toast])

  // bật chạy liên tiếp hoặc sang câu mới trong lúc đang chạy -> phát ngay
  useEffect(() => {
    if (!chain || !cur) return
    chainStage.current = 'playing'
    playRange(cur.start, cur.end, 'once')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, chain])

  const toggleChain = () => {
    if (chain) {
      setChain(false)
      chainStage.current = 'idle'
      clearGap()
      pause()
    } else {
      setChain(true)
    }
  }

  const startRec = async () => {
    if (!cur) return
    pause()
    setResult(null)
    setInterim('')
    try {
      recRef.current = await startRecording()
    } catch {
      toast('Không truy cập được micro. Hãy cho phép trình duyệt dùng micro.', 'bad')
      return
    }
    if (asrSupported) {
      asrRef.current = createRecognizer({
        onInterim: setInterim,
        onFinal: (text) => {
          const d = diffWords(cur.text, text)
          const score = d.total ? d.correct / d.total : 0
          setResult({ heard: text, ops: d.ops, score })
          if (text) setScore(data.video_id, cur.id, score)
        },
        onError: (err) => {
          if (err !== 'no-speech' && err !== 'aborted') toast(`Nhận dạng giọng nói lỗi: ${err}`, 'bad')
        },
      })
      asrRef.current?.start()
    }
    setRecording(true)
  }

  const stopRec = async () => {
    setRecording(false)
    asrRef.current?.stop()
    asrRef.current = null
    const h = recRef.current
    recRef.current = null
    if (h) {
      const blob = await h.stop()
      if (clipUrl) URL.revokeObjectURL(clipUrl)
      setClipUrl(URL.createObjectURL(blob))
    }
  }

  useEffect(
    () => () => {
      asrRef.current?.stop()
      recRef.current?.stop().catch(() => undefined)
      if (clipUrl) URL.revokeObjectURL(clipUrl)
      clearGap()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  if (!cur) return <EmptyState title="Chưa có câu để luyện" body="Phụ đề của video này trống." />

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-col gap-2 border-b border-vien pb-3">
        <div className="flex items-center justify-between text-xs text-chu-mo">
          <span>
            Câu <span className="font-mono text-chu">{idx + 1}</span>/<span className="font-mono">{sentences.length}</span>
            <span className="mx-2 text-vien-manh">·</span>
            đạt <span className="font-mono text-chu">{done}</span>
          </span>
          <span className="font-mono">{formatTime(cur.start)}–{formatTime(cur.end)}</span>
        </div>
        <Progress value={done / sentences.length} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        <motion.div
          key={cur.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="rounded-2xl bg-mat p-5 hairline"
        >
          <ClickableText text={cur.text} start={cur.start} className="text-[19px] leading-relaxed text-chu sm:text-[21px]" />
          <AnimatePresence>
            {showVi && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-3 border-t border-vien pt-3 text-[15px] leading-relaxed text-nhan-van">
                  {vi ?? <span className="skeleton inline-block h-4 w-1/2" />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={listenOnce}>
            
            Nghe
          </Button>
          <Button variant={isLooping ? 'outline' : 'subtle'} onClick={toggleLoop} className={cx(isLooping && 'border-nhan/40 text-nhan-van')}>
            
            {isLooping && playing ? `Lặp ×${loopCount + 1}` : 'Lặp câu'}
          </Button>
          <Button
            variant={chain ? 'outline' : 'subtle'}
            onClick={toggleChain}
            className={cx(chain && 'border-nhan/40 text-nhan-van')}
            title="Phát câu, nghỉ một quãng để bạn đọc theo, rồi tự sang câu kế"
          >
            
            {chain ? 'Đang chạy liên tiếp' : 'Chạy liên tiếp'}
          </Button>
          <Button variant="subtle" onClick={() => speak(cur.text, Math.min(rate, 1))} title="Đọc bằng giọng máy, chậm và rõ">
            
            Giọng máy
          </Button>
          <Button variant={showVi ? 'outline' : 'ghost'} onClick={() => setShowVi((v) => !v)} className={cx(showVi && 'text-nhan-van')}>
            
            Nghĩa
          </Button>
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-mat p-0.5 hairline">
            {[0.65, 0.85, 1].map((r) => (
              <button
                key={r}
                onClick={() => setRate(r)}
                className={cx('press h-7 rounded-md px-2 font-mono text-[11.5px]', Math.abs(rate - r) < 0.01 ? 'bg-vien text-chu' : 'text-chu-mo hover:text-chu')}
              >
                {r}×
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-vien p-4">
          <div className="flex flex-wrap items-center gap-3">
            {!recording ? (
              <Button variant="primary" size="lg" onClick={startRec} className="bg-chu text-nen hover:bg-chu-nhat">
                
                Nói theo
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={stopRec}>
                <span className="pulse-dot mr-1 inline-block h-2.5 w-2.5 rounded-full bg-nhan-chu" />
                
                Dừng
              </Button>
            )}
            <div className="min-w-0 flex-1 text-sm text-chu-mo">
              {recording ? <span className="text-chu">{interim || 'Đang nghe bạn nói…'}</span> : <span>Bấm rồi đọc lại câu trên. Dùng tai nghe để micro không bắt tiếng video.</span>}
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Câu trước">
                Trước
              </Button>
              <Button size="sm" variant="ghost" onClick={() => go(idx + 1)} disabled={idx >= sentences.length - 1} aria-label="Câu sau">
                Sau
              </Button>
            </div>
          </div>
          {!asrSupported && (
            <div className="mt-3 flex items-start gap-2 text-xs text-luu-y">
              
              Trình duyệt này không hỗ trợ nhận dạng giọng nói, chỉ ghi âm để bạn tự nghe lại. Chrome hoặc Edge sẽ chấm được điểm.
            </div>
          )}

          <AnimatePresence>
            {(clipUrl || result) && !recording && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex flex-col gap-3 border-t border-vien pt-4">
                {clipUrl && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-chu-mo-hon">Giọng bạn</span>
                    <audio controls src={clipUrl} className="h-9 max-w-full flex-1" />
                  </div>
                )}
                {result && (
                  <div>
                    <div className="mb-2 flex items-center gap-3">
                      <ScoreBadge score={result.score} />
                      <span className="text-sm text-chu-nhat">
                        {result.heard ? (result.score >= 0.8 ? 'Máy nghe ra gần hết. Tốt.' : 'Máy nghe ra khác vài chỗ, đọc chậm và rõ hơn.') : 'Máy không nghe ra gì. Thử nói gần micro hơn.'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-[15px]">
                      {result.ops.map((op, i) => (
                        <span
                          key={i}
                          className={cx(
                            'rounded px-1',
                            op.type === 'ok' && 'text-dung',
                            op.type === 'missing' && 'bg-sai/15 text-sai',
                            op.type === 'extra' && 'text-chu-mo-hon line-through',
                          )}
                        >
                          {op.word}
                        </span>
                      ))}
                    </div>
                    {result.heard && <div className="mt-2 text-xs text-chu-mo-hon">Máy nghe: “{result.heard}”</div>}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
