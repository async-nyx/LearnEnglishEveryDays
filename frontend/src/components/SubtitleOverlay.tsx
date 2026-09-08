import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { translateSentence } from '../lib/api'
import { ensurePinyin, pinyinLine, usePinyinReady } from '../lib/pinyin'
import type { Sentence } from '../lib/types'
import { hasHan } from '../lib/xianxia'
import { usePlayer } from '../store/usePlayer'
import { useStore } from '../store/useStore'
import { cx } from './ui'

/**
 * PHỤ ĐỀ CHẠY TRÊN VIDEO — vừa xem vừa đọc, không phải liếc sang cột bên.
 *
 * USER chê bản đầu: chữ mờ và nhỏ, màu chìm vào hình. Nay: nền đen đặc, chữ trắng có viền đổ bóng,
 * pinyin và tiếng Việt đủ sáng, cỡ chữ chỉnh được (`settings.subFontSize`), và KÉO ĐI ĐƯỢC —
 * kéo thả lưu vị trí vào `settings.subPos` (theo % khung video nên đổi kích thước vẫn đúng chỗ).
 */
export function SubtitleOverlay({ sentences, raised }: { sentences: Sentence[]; raised: boolean }) {
  const layers = useStore((s) => s.settings.videoSubLayers)
  const on = useStore((s) => s.settings.videoSubs)
  const size = useStore((s) => s.settings.subFontSize)
  const pos = useStore((s) => s.settings.subPos)
  const updateSettings = useStore((s) => s.updateSettings)
  const time = usePlayer((s) => s.currentTime)
  const pinyinVersion = usePinyinReady((s) => s.version)
  const [vi, setVi] = useState<Record<number, string>>({})
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const index = useMemo(() => {
    let best = -1
    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i].start <= time + 0.05) best = i
      else break
    }
    if (best >= 0 && time > sentences[best].end + 0.6) return -1
    return best
  }, [sentences, time])

  const cur = index >= 0 ? sentences[index] : null
  const isZh = hasHan(cur?.text ?? '')

  useEffect(() => {
    if (on && layers.pinyin && isZh) void ensurePinyin()
  }, [on, layers.pinyin, isZh])

  // dịch câu đang chạy và một câu kế, để không bị trống lúc chuyển câu
  useEffect(() => {
    if (!on || !layers.vi || index < 0) return
    let alive = true
    for (const s of sentences.slice(index, index + 2)) {
      if (vi[s.id] !== undefined) continue
      void translateSentence(s.text)
        .then((r) => alive && setVi((m) => ({ ...m, [s.id]: r.text })))
        .catch(() => undefined)
    }
    return () => {
      alive = false
    }
  }, [on, layers.vi, index, sentences, vi])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const parent = boxRef.current?.offsetParent as HTMLElement | null
      if (!parent) return
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      const rect = parent.getBoundingClientRect()
      const start = { px: e.clientX, py: e.clientY, x: pos?.x ?? 50, y: pos?.y ?? 88 }
      const move = (ev: PointerEvent) => {
        const x = start.x + ((ev.clientX - start.px) / rect.width) * 100
        const y = start.y + ((ev.clientY - start.py) / rect.height) * 100
        setDrag({ x: Math.max(6, Math.min(94, x)), y: Math.max(6, Math.min(96, y)) })
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        setDrag((d) => {
          if (d) updateSettings({ subPos: d })
          return null
        })
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [pos, updateSettings],
  )

  if (!on || !cur) return null
  const pinyin = isZh && layers.pinyin ? cur.pinyin || (pinyinVersion >= 0 ? pinyinLine(cur.text) : '') : ''
  const showZh = !isZh || layers.zh
  const place = drag ?? pos ?? { x: 50, y: raised ? 84 : 92 }

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      style={{
        left: `${place.x}%`,
        top: `${place.y}%`,
        transform: 'translate(-50%, -100%)',
        fontSize: `${size}px`,
        maxWidth: 'min(92%, 62ch)',
      }}
      className={cx(
        'absolute z-10 cursor-grab select-none rounded-xl bg-black/85 px-4 py-2.5 text-center shadow-[0_2px_18px_rgba(0,0,0,0.55)] ring-1 ring-white/12',
        drag && 'cursor-grabbing ring-nhan',
      )}
      title="Kéo để đổi chỗ phụ đề"
    >
      {showZh && (
        <div className="font-semibold leading-snug text-white" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
          {cur.text}
        </div>
      )}
      {pinyin && (
        <div
          className="leading-snug text-[#ffe9a8]"
          style={{ fontSize: showZh ? '0.72em' : '1em', textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}
        >
          {pinyin}
        </div>
      )}
      {isZh && layers.en && cur.en && (
        <div className="leading-snug text-white/85" style={{ fontSize: '0.72em', textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
          {cur.en}
        </div>
      )}
      {layers.vi && vi[cur.id] && (
        <div
          className="mt-0.5 leading-snug text-[#9ce8b4]"
          style={{ fontSize: showZh || pinyin ? '0.8em' : '1em', textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}
        >
          {vi[cur.id]}
        </div>
      )}
    </div>
  )
}
