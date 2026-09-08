import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { translateSentence } from '../lib/api'
import { AI_KEY_HINT, AI_MODELS, AI_MODEL_OPTIONS, aiExplain, aiTranslate, type AiProvider, type AiSentence } from '../lib/ai'
import { STYLE_HINT, STYLE_LABEL, type TransStyle } from '../lib/novel-style'
import { formatTime } from '../lib/text'
import type { Sentence, TranscriptData } from '../lib/types'
import { usePlayer } from '../store/usePlayer'
import { useStore } from '../store/useStore'
import { ensurePinyin, pinyinLine, usePinyinReady } from '../lib/pinyin'
import { hanVietLine, hasHan, matchTerms } from '../lib/xianxia'
import { ClickableText } from './ClickableText'
import { Button, EmptyState, cx } from './ui'

const CHUNK = 12 // số câu gửi AI mỗi lượt

/**
 * Tab Dịch: cả bài song ngữ. Dịch máy chạy sẵn (miễn phí); cắm khoá Gemini hoặc Grok thì có bản
 * dịch theo văn cảnh, ghi chú cấu trúc, và nút giảng sâu từng câu. Khoá lưu trên máy người dùng.
 */
export function TranslateView({ data, sentences }: { data: TranscriptData; sentences: Sentence[] }) {
  const provider = useStore((s) => s.settings.aiProvider)
  const key = useStore((s) => s.settings.aiKey)
  const aiModel = useStore((s) => s.settings.aiModel)
  const style = useStore((s) => s.settings.transStyle)
  const updateSettings = useStore((s) => s.updateSettings)
  const toast = useStore((s) => s.toast)
  const seekTo = usePlayer((s) => s.seekTo)
  const currentTime = usePlayer((s) => s.currentTime)

  const [machine, setMachine] = useState<Record<number, string>>({})
  const [ai, setAi] = useState<Record<number, AiSentence>>({})
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [explainAt, setExplainAt] = useState<number | null>(null)
  const [explain, setExplain] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [draftKey, setDraftKey] = useState(key)
  const [showHv, setShowHv] = useState(true)
  const pinyinVersion = usePinyinReady((st) => st.version)

  /** Phụ đề tiếng Trung: bật lớp tiên hiệp (thuật ngữ Hán-Việt, dòng đọc Hán-Việt, prompt riêng). */
  const isZh = (data.language_code ?? '').toLowerCase().startsWith('zh') || sentences.slice(0, 5).some((s) => hasHan(s.text))
  useEffect(() => {
    if (isZh) void ensurePinyin()
  }, [isZh])
  const abort = useRef<AbortController | null>(null)

  const hasKey = key.trim().length > 0
  const active = useMemo(() => {
    let best = -1
    for (let i = 0; i < sentences.length; i++) if (sentences[i].start <= currentTime + 0.05) best = i
    return best
  }, [sentences, currentTime])

  // dịch máy: chạy dần cho cả bài, không chặn giao diện
  useEffect(() => {
    let alive = true
    setMachine({})
    setAi({})
    setExplain(null)
    setExplainAt(null)
    ;(async () => {
      for (const s of sentences) {
        if (!alive) return
        try {
          const r = await translateSentence(s.text)
          if (!alive) return
          setMachine((m) => ({ ...m, [s.id]: r.text }))
        } catch {
          /* bỏ qua câu lỗi */
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [sentences, style])

  const runAi = useCallback(async () => {
    if (!hasKey || busy) return
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setBusy(true)
    setProgress(0)
    try {
      for (let i = 0; i < sentences.length; i += CHUNK) {
        const part = sentences.slice(i, i + CHUNK)
        const out = await aiTranslate(provider, key, part.map((s) => s.text), ctrl.signal, isZh ? 'zh' : 'en', aiModel, style)
        setAi((prev) => {
          const next = { ...prev }
          part.forEach((s, j) => {
            if (out[j]?.vi) next[s.id] = out[j]
          })
          return next
        })
        setProgress(Math.min(1, (i + part.length) / sentences.length))
      }
      toast('Đã dịch cả bài bằng AI.', 'ok')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(`AI lỗi: ${(e as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }, [hasKey, busy, sentences, provider, key, toast, isZh, aiModel])

  const runExplain = async (i: number) => {
    if (!hasKey) {
      setShowKey(true)
      return
    }
    setExplainAt(i)
    setExplain(null)
    const context = sentences.slice(Math.max(0, i - 1), i + 2).map((s) => s.text).join(' ')
    try {
      setExplain(await aiExplain(provider, key, sentences[i].text, context, undefined, isZh ? 'zh' : 'en', aiModel, style))
    } catch (e) {
      setExplain(`Không giảng được: ${(e as Error).message}`)
    }
  }

  useEffect(() => () => abort.current?.abort(), [])

  if (sentences.length === 0) return <EmptyState title="Chưa có câu để dịch" body="Phụ đề của video này trống." />

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* thanh công cụ */}
      <div className="flex flex-wrap items-center gap-2 border-b border-vien pb-3">
        <Button variant="primary" onClick={runAi} disabled={!hasKey || busy}>
          {busy ? `Đang dịch ${Math.round(progress * 100)}%` : 'Dịch cả bài bằng AI'}
        </Button>
        {busy && (
          <Button variant="ghost" onClick={() => abort.current?.abort()}>
            Dừng
          </Button>
        )}
        <Button variant={showKey ? 'outline' : 'subtle'} onClick={() => setShowKey((v) => !v)} className={cx(showKey && 'border-nhan/40 text-nhan-van')}>
          {hasKey ? `Khoá ${provider === 'gemini' ? 'Gemini' : 'Grok'}` : 'Cắm khoá AI'}
        </Button>
        <div className="flex items-center gap-0.5 rounded-lg bg-mat p-0.5 hairline" title="Văn phong bản dịch">
          {(['tunhien', 'truyen', 'cophong'] as TransStyle[]).map((k) => (
            <button
              key={k}
              onClick={() => updateSettings({ transStyle: k })}
              title={STYLE_HINT[k]}
              className={cx(
                'press h-8 rounded-md px-2.5 text-[12.5px] font-medium',
                style === k ? 'bg-nhan text-nhan-chu' : 'text-chu-nhat hover:text-chu',
              )}
            >
              {STYLE_LABEL[k]}
            </button>
          ))}
        </div>
        {isZh && (
          <Button variant={showHv ? 'outline' : 'subtle'} onClick={() => setShowHv((v) => !v)} className={cx(showHv && 'border-nhan/40 text-nhan-van')}>
            Hán-Việt
          </Button>
        )}
        <span className="ml-auto text-xs text-chu-mo-hon">
          {hasKey ? `Mô hình ${aiModel || `tự chọn (${AI_MODELS[provider]}…)`}` : 'Chưa có khoá: đang dùng dịch máy'}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {showKey && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-2xl bg-mat p-4 hairline">
              <div className="flex flex-wrap items-center gap-2">
                {(['gemini', 'grok'] as AiProvider[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => updateSettings({ aiProvider: p })}
                    className={cx(
                      'press h-9 rounded-lg px-3 text-[13px] font-medium hairline',
                      provider === p ? 'border-nhan/40 bg-nhan-nhat text-nhan-van' : 'bg-nen text-chu-nhat hover:text-chu',
                    )}
                  >
                    {p === 'gemini' ? 'Google Gemini' : 'xAI Grok'}
                  </button>
                ))}
                <select
                  value={aiModel}
                  onChange={(e) => updateSettings({ aiModel: e.target.value })}
                  className="h-9 rounded-lg border border-vien bg-nen px-2 text-[13px] text-chu focus:border-chu-mo-hon focus:outline-none"
                  aria-label="Mô hình AI"
                >
                  <option value="">Tự chọn (thử từ mới nhất)</option>
                  {AI_MODEL_OPTIONS[provider].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <a href={AI_KEY_HINT[provider].url} target="_blank" rel="noreferrer" className="text-[13px] text-nhan-van underline-offset-2 hover:underline">
                  Lấy khoá ở {AI_KEY_HINT[provider].label}
                </a>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  type="password"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={`Dán khoá ${AI_KEY_HINT[provider].prefix}`}
                  className="h-10 min-w-[240px] flex-1 rounded-xl border border-vien bg-nen px-3 font-mono text-sm text-chu placeholder:text-chu-mo-hon focus:border-chu-mo-hon focus:outline-none"
                />
                <Button
                  variant="primary"
                  onClick={() => {
                    updateSettings({ aiKey: draftKey.trim() })
                    toast(draftKey.trim() ? 'Đã lưu khoá trên máy này.' : 'Đã xoá khoá.', 'ok')
                    setShowKey(false)
                  }}
                >
                  Lưu khoá
                </Button>
                {hasKey && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDraftKey('')
                      updateSettings({ aiKey: '' })
                      toast('Đã xoá khoá.')
                    }}
                  >
                    Xoá
                  </Button>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-chu-mo-hon">
                Google hay khai tử model cũ (khoá mới không gọi được gemini-2.5-flash nữa). Để “Tự chọn” thì app thử lần lượt từ model mới nhất xuống, gặp cái nào chạy được thì dùng tiếp cái đó.
                Khoá chỉ nằm trong trình duyệt của bạn và gửi thẳng tới nhà cung cấp. App không lưu khoá trên máy chủ. Nếu trình duyệt chặn, lời gọi đi vòng qua máy chủ của app nhưng khoá vẫn không được ghi lại.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* danh sách song ngữ */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ol className="flex flex-col divide-y divide-vien">
          {sentences.map((s, i) => {
            const isActive = i === active
            const a = ai[s.id]
            return (
              <li key={s.id} className={cx('grid gap-1 px-2 py-3 transition-colors', isActive ? 'bg-mat-chim' : 'hover:bg-mat')}>
                <div className="flex items-start gap-3">
                  <button onClick={() => seekTo(s.start)} className={cx('press shrink-0 font-mono text-[12px] tabular-nums', isActive ? 'text-nhan-van' : 'text-chu-mo-hon hover:text-chu')}>
                    {formatTime(s.start)}
                  </button>
                  <div className="min-w-0 flex-1">
                    <ClickableText text={s.text} start={s.start} className="text-[15px] leading-relaxed text-chu" />
                    <div className="mt-1 text-[15px] leading-relaxed text-nhan-van">
                      {a?.vi ?? machine[s.id] ?? <span className="skeleton inline-block h-4 w-2/5 align-middle" />}
                      {a && <span className="ml-2 rounded bg-nhan-nhat px-1.5 py-0.5 text-[10px] font-semibold text-nhan-van">AI</span>}
                    </div>
                    {isZh && (s.pinyin || pinyinVersion >= 0) && (
                      <div className="mt-0.5 text-[13px] leading-relaxed text-chu-mo-hon">{s.pinyin || pinyinLine(s.text)}</div>
                    )}
                    {isZh && showHv && <div className="mt-1 text-[13px] leading-relaxed text-chu-mo-hon">{hanVietLine(s.text)}</div>}
                    {a?.note && <div className="mt-1 text-[13px] leading-relaxed text-chu-mo">{a.note}</div>}
                    {isZh && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {matchTerms(s.text)
                          .filter((h) => !h.isName)
                          .slice(0, 4)
                          .map((h) => (
                            <span key={h.at} className="rounded-md bg-mat-noi px-1.5 py-0.5 text-[11.5px] text-chu-mo" title={h.note}>
                              <b className="font-semibold text-chu">{h.zh}</b> = {h.vi}
                            </span>
                          ))}
                      </div>
                    )}
                    <button onClick={() => void runExplain(i)} className="press mt-1.5 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-chu-mo hover:bg-mat-noi hover:text-chu">
                      Giảng câu này
                    </button>
                    <AnimatePresence>
                      {explainAt === i && (
                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 rounded-xl bg-mat-noi p-3 text-[13.5px] leading-relaxed text-chu">
                          {explain === null ? (
                            <span className="flex items-center gap-2 text-chu-mo">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-vien border-t-nhan" />
                              Đang hỏi AI…
                            </span>
                          ) : (
                            explain.split('\n').filter(Boolean).map((line, k) => (
                              <p key={k} className="mb-1 last:mb-0">
                                {line.replace(/\*\*/g, '')}
                              </p>
                            ))
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
