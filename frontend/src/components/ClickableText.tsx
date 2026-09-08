import { memo, useMemo, useRef } from 'react'
import { tokenize, normalizeWord } from '../lib/text'
import { prefetchWord } from '../lib/api'
import { useLookup } from '../store/useLookup'
import { useStore } from '../store/useStore'
import { cx } from './ui'

interface Props {
  text: string
  start: number
  className?: string
  /** từ cần tô nổi (đã normalize) */
  highlight?: Set<string>
  /** gọi thêm khi bấm một từ (ví dụ: tua video tới câu này) */
  onWordClick?: () => void
}

/** Đoạn văn mà mỗi từ đều bấm được để tra nghĩa. */
export const ClickableText = memo(function ClickableText({ text, start, className, highlight, onWordClick }: Props) {
  const tokens = useMemo(() => tokenize(text), [text])
  // vị trí ký tự đầu của từng token trong câu (popover cần để dò cụm thuật ngữ tiên hiệp)
  const offsets = useMemo(() => {
    let at = 0
    return tokens.map((t) => {
      const start = at
      at += t.text.length
      return start
    })
  }, [tokens])
  const open = useLookup((s) => s.open)
  const saved = useStore((s) => s.vocab)
  const savedSet = useMemo(() => new Set(saved.map((v) => v.lemma)), [saved])
  const hoverTimer = useRef<number | null>(null)

  return (
    <span className={className}>
      {tokens.map((tok, i) => {
        if (!tok.isWord) return <span key={i}>{tok.text}</span>
        const norm = normalizeWord(tok.text)
        const isSaved = savedSet.has(norm)
        const hl = highlight?.has(norm)
        return (
          <span
            key={i}
            role="button"
            tabIndex={-1}
            className={cx(
              'word',
              isSaved && 'underline decoration-nhan/70 decoration-2 underline-offset-[3px]',
              hl && 'bg-nhan/25 text-chu',
            )}
            onMouseEnter={() => {
              if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
              hoverTimer.current = window.setTimeout(() => prefetchWord(norm), 120)
            }}
            onMouseLeave={() => {
              if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
            }}
            onClick={(e) => {
              e.stopPropagation()
              onWordClick?.()
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const st = useStore.getState()
              const data = st.currentVideoId ? st.transcripts[st.currentVideoId] : null
              open({
                word: tok.text,
                example: text,
                index: offsets[i],
                videoId: st.currentVideoId ?? '',
                videoTitle: data?.title ?? '',
                start,
                rect: { x: r.left, y: r.top, w: r.width, h: r.height },
              })
            }}
          >
            {tok.text}
          </span>
        )
      })}
    </span>
  )
})
