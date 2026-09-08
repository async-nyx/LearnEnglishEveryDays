import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { translateSentence } from '../lib/api'
import { hasHan } from '../lib/xianxia'
import { formatTime, toSrt, downloadText, wordsOf } from '../lib/text'
import type { Sentence, TranscriptData } from '../lib/types'
import { usePlayer } from '../store/usePlayer'
import { useStore } from '../store/useStore'
import { useActiveIndex, useDebounced } from '../hooks/useTranscript'
import { ensurePinyin, pinyinLine, usePinyinReady } from '../lib/pinyin'
import { splitTrilingual } from '../lib/trilingual'
import { ClickableText } from './ClickableText'
import { Button, Kbd, cx } from './ui'

interface Row {
  id: number
  start: number
  end: number
  text: string
  /** phiên âm tách ra từ dòng phụ đề ba tầng */
  pinyin?: string
  /** bản tiếng Anh in sẵn trong phụ đề */
  en?: string
}

export function TranscriptView({ data, sentences }: { data: TranscriptData; sentences: Sentence[] }) {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const toast = useStore((s) => s.toast)
  const seekTo = usePlayer((s) => s.seekTo)
  const setLoop = usePlayer((s) => s.setLoop)

  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim().toLowerCase(), 200)
  const [exportOpen, setExportOpen] = useState(false)

  const rows: Row[] = useMemo(
    () =>
      settings.sentenceMode
        ? sentences.map((s) => ({ id: s.id, start: s.start, end: s.end, text: s.text, pinyin: s.pinyin, en: s.en }))
        : data.segments.map((s, i) => {
            const parts = splitTrilingual(s.text)
            return {
              id: i,
              start: s.start,
              end: s.start + s.duration,
              text: parts.split && parts.zh ? parts.zh : s.text,
              pinyin: parts.pinyin || undefined,
              en: parts.en || undefined,
            }
          }),
    [settings.sentenceMode, sentences, data.segments],
  )

  const layers = settings.subLayers
  const isZh = (data.language_code ?? '').toLowerCase().startsWith('zh') || hasHan(rows[0]?.text ?? '')
  const pinyinVersion = usePinyinReady((s) => s.version)
  useEffect(() => {
    // phụ đề không kèm sẵn pinyin thì tự phiên âm — bảng nặng nên chỉ tải khi bật lớp này
    if (isZh && layers.pinyin) void ensurePinyin()
  }, [isZh, layers.pinyin])

  const active = useActiveIndex(rows)
  const listRef = useRef<HTMLDivElement>(null)
  const userScrolled = useRef(false)
  const scrollTimer = useRef<number | null>(null)

  // bật Dịch: dịch trước 2 câu kế để tới lượt là có ngay
  useEffect(() => {
    if (!settings.showTranslation || active < 0) return
    for (const r of rows.slice(active + 1, active + 3)) void translateSentence(r.text).catch(() => undefined)
  }, [active, rows, settings.showTranslation])

  // cuộn theo dòng đang phát
  useEffect(() => {
    if (!settings.autoScroll || active < 0 || userScrolled.current || q) return
    const box = listRef.current
    const el = box?.querySelector<HTMLElement>(`[data-row="${active}"]`)
    if (!box || !el) return
    // đưa dòng đang phát về khoảng 1/3 chiều cao khung, cuộn trong KHUNG phụ đề chứ không cuộn cả trang
    const target = el.offsetTop - box.offsetTop - box.clientHeight / 3 + el.offsetHeight / 2
    box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [active, settings.autoScroll, q])

  const onScroll = () => {
    userScrolled.current = true
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current)
    scrollTimer.current = window.setTimeout(() => {
      userScrolled.current = false
    }, 2500)
  }

  const highlight = useMemo(() => (q ? new Set(wordsOf(q)) : undefined), [q])
  const filtered = useMemo(() => {
    if (!q) return rows
    return rows.filter((r) => r.text.toLowerCase().includes(q))
  }, [rows, q])

  const copyAll = () => {
    navigator.clipboard.writeText(data.segments.map((s) => s.text).join(' ')).then(() => toast('Đã chép toàn bộ văn bản', 'ok'))
    setExportOpen(false)
  }
  const copyTs = () => {
    navigator.clipboard
      .writeText(data.segments.map((s) => `[${s.timestamp}] ${s.text}`).join('\n'))
      .then(() => toast('Đã chép kèm mốc thời gian', 'ok'))
    setExportOpen(false)
  }
  const dlTxt = () => {
    downloadText(`${data.video_id}.txt`, data.segments.map((s) => `[${s.timestamp}] ${s.text}`).join('\n'))
    setExportOpen(false)
  }
  const dlSrt = () => {
    downloadText(`${data.video_id}.srt`, toSrt(data.segments))
    setExportOpen(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* thanh công cụ */}
      <div className="flex flex-wrap items-center gap-2 border-b border-vien pb-3">
        <div className="relative flex min-w-[180px] flex-1 items-center">
          <MagnifyingGlass size={15} className="pointer-events-none absolute left-2.5 text-chu-mo-hon" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm trong phụ đề…"
            className="h-9 w-full rounded-lg border border-vien bg-mat pl-8 pr-8 text-sm placeholder:text-chu-mo-hon focus:border-chu-mo-hon focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 text-base leading-none text-chu-mo-hon hover:text-chu" aria-label="Xoá tìm">
              ×
            </button>
          )}
        </div>

        <ToolToggle
          active={settings.sentenceMode}
          onClick={() => updateSettings({ sentenceMode: !settings.sentenceMode })}
          title={settings.sentenceMode ? 'Đang gộp theo câu' : 'Đang hiện từng dòng gốc'}
        >
          
          <span>{settings.sentenceMode ? 'Theo câu' : 'Theo dòng'}</span>
        </ToolToggle>
        {isZh ? (
          <div className="flex items-center gap-0.5 rounded-lg bg-mat p-0.5 hairline" title="Chọn lớp phụ đề muốn thấy">
            {(
              [
                ['zh', '中文'],
                ['pinyin', 'Pinyin'],
                ['vi', 'Việt'],
                ['en', 'English'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => updateSettings({ subLayers: { ...layers, [k]: !layers[k] } })}
                className={cx(
                  'press h-8 rounded-md px-2 text-[12.5px] font-medium',
                  layers[k] ? 'bg-nhan text-nhan-chu' : 'text-chu-nhat hover:text-chu',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <ToolToggle active={settings.showTranslation} onClick={() => updateSettings({ showTranslation: !settings.showTranslation })} title="Dịch câu đang phát">
            <span>Dịch</span>
          </ToolToggle>
        )}
        <ToolToggle active={settings.autoScroll} onClick={() => updateSettings({ autoScroll: !settings.autoScroll })} title="Tự cuộn theo video">
          
          <span>Tự cuộn</span>
        </ToolToggle>

        <div className="flex items-center rounded-lg bg-mat p-0.5 hairline">
          <button className="press h-8 w-8 rounded-md text-chu-nhat hover:text-chu" onClick={() => updateSettings({ fontSize: Math.max(13, settings.fontSize - 1) })} aria-label="Chữ nhỏ hơn">
            <span className="text-[12px] font-semibold">A−</span>
          </button>
          <span className="w-7 text-center font-mono text-[11px] text-chu-mo">{settings.fontSize}</span>
          <button className="press h-8 w-8 rounded-md text-chu-nhat hover:text-chu" onClick={() => updateSettings({ fontSize: Math.min(26, settings.fontSize + 1) })} aria-label="Chữ to hơn">
            <span className="text-[15px] font-semibold">A+</span>
          </button>
        </div>

        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => setExportOpen((v) => !v)}>
            
            Xuất
          </Button>
          <AnimatePresence>
            {exportOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="glass absolute right-0 top-10 z-20 w-56 rounded-xl p-1.5 shadow-soft"
                onMouseLeave={() => setExportOpen(false)}
              >
                <MenuItem onClick={copyAll}>Chép toàn bộ văn bản</MenuItem>
                <MenuItem onClick={copyTs}>Chép kèm mốc thời gian</MenuItem>
                <MenuItem onClick={dlTxt}>Tải .txt</MenuItem>
                <MenuItem onClick={dlSrt}>Tải .srt</MenuItem>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 py-2 text-xs text-chu-mo-hon">
        <span>
          {q ? `${filtered.length} kết quả` : `${rows.length} ${settings.sentenceMode ? 'câu' : 'dòng'}`} · bấm dòng để phát từ đó · bấm từ để tra nghĩa
        </span>
        <span className="hidden items-center gap-1 xl:flex">
          <Kbd>Space</Kbd> phát/dừng · <Kbd>←</Kbd><Kbd>→</Kbd> 5s
        </span>
      </div>

      {/* danh sách */}
      <div ref={listRef} onWheel={onScroll} onTouchMove={onScroll} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 && <div className="p-6 text-sm text-chu-mo-hon">Không có dòng nào khớp “{query}”.</div>}
        <ol className="flex flex-col divide-y divide-vien">
          {filtered.map((r) => {
            const isActive = r.id === active
            const playHere = () => {
              setLoop(null)
              seekTo(r.start)
            }
            return (
              <li
                key={r.id}
                data-row={r.id}
                onClick={playHere}
                className={cx(
                  'group relative grid cursor-pointer grid-cols-[3.4rem_1fr] gap-x-2 px-2 py-2.5 transition-colors sm:grid-cols-[3.8rem_1fr]',
                  isActive ? 'bg-mat-chim' : 'hover:bg-mat',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="active-bar"
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-nhan"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <div className="flex flex-col items-start gap-1 pt-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      playHere()
                    }}
                    className={cx(
                      'press font-mono text-[12px] tabular-nums',
                      isActive ? 'text-nhan-van' : 'text-chu-mo-hon hover:text-chu',
                    )}
                  >
                    {formatTime(r.start)}
                  </button>
                </div>
                <div>
                  {/* tắt hết lớp có nội dung thì vẫn phải thấy chữ, không thì dòng trống trơn */}
                  {(!isZh || layers.zh || !(layers.pinyin || layers.vi || layers.en)) && (
                    <ClickableText
                      text={r.text}
                      start={r.start}
                      highlight={highlight}
                      className={cx('leading-relaxed', isActive ? 'text-chu' : 'text-chu-nhat')}
                    />
                  )}
                  {isZh && layers.pinyin && (
                    <div className={cx('leading-relaxed text-chu-mo-hon', layers.zh ? 'mt-0.5 text-[0.8em]' : 'text-[1em] text-chu-nhat')}>
                      {r.pinyin || (pinyinVersion >= 0 ? pinyinLine(r.text) : '')}
                    </div>
                  )}
                  {isZh && layers.en && r.en && <div className="mt-0.5 text-[0.82em] leading-relaxed text-chu-mo">{r.en}</div>}
                  {((isZh && layers.vi) || (!isZh && settings.showTranslation)) && isActive && <Translation text={r.text} />}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

function Translation({ text }: { text: string }) {
  const [vi, setVi] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setVi(null)
    translateSentence(text)
      .then((r) => alive && setVi(r.text))
      .catch((e: Error) => alive && setVi(`Không dịch được (${e.message})`))
    return () => {
      alive = false
    }
  }, [text])
  return (
    <div className="mt-1.5 text-[0.9em] leading-relaxed text-nhan-van/90">
      {vi ?? <span className="skeleton inline-block h-4 w-2/3 align-middle" />}
    </div>
  )
}

function ToolToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cx(
        'press inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium hairline',
        active ? 'border-nhan/40 bg-nhan/10 text-nhan-van' : 'bg-mat text-chu-nhat hover:text-chu',
      )}
    >
      {children}
    </button>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="press flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-chu hover:bg-vien">
      {children}
    </button>
  )
}
