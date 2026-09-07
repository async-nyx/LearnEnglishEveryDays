import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SpeakerHigh } from '@phosphor-icons/react'
import { defineWord, defineWordFull, translateText } from '../lib/api'
import type { DefineResult, TranslateResult } from '../lib/types'
import { playWordAudio } from '../lib/speech'
import { normalizeWord } from '../lib/text'
import { findImage } from '../lib/images'
import { useLookup } from '../store/useLookup'
import { useStore } from '../store/useStore'
import { Button, cx } from './ui'

const W = 340

/**
 * Popover tra từ. Hai nguồn chạy song song:
 *  - /api/translate (nhanh, ~0.3 s) -> nghĩa tiếng Việt, hiện ngay
 *  - /api/define    (chậm, có thể tới 20 s) -> IPA, audio, định nghĩa Anh-Anh
 * Nút "Lưu từ" mở khoá ngay khi có bản dịch; khi từ điển về sau thì bổ sung vào mục đã lưu.
 */
export function WordPopover() {
  const target = useLookup((s) => s.target)
  const close = useLookup((s) => s.close)
  const [vi, setVi] = useState<TranslateResult | null>(null)
  const [dict, setDict] = useState<DefineResult | null>(null)
  const [dictPending, setDictPending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean }>({ left: 0, top: 0, above: false })
  const ref = useRef<HTMLDivElement>(null)

  const vocab = useStore((s) => s.vocab)
  const addVocab = useStore((s) => s.addVocab)
  const removeVocab = useStore((s) => s.removeVocab)
  const updateVocab = useStore((s) => s.updateVocab)
  const toast = useStore((s) => s.toast)
  const imageSlugs = useStore((s) => s.imageSlugs)

  const norm = target ? normalizeWord(target.word) : ''
  // chữ Hán: từ điển Anh-Anh không có, chỉ dịch sang tiếng Việt
  const isHan = /\p{Script=Han}/u.test(norm)
  const lemma = dict?.lemma ?? norm
  const saved = vocab.find((v) => v.lemma === lemma || v.word === norm)
  const image = target ? findImage(imageSlugs, lemma, norm) : null

  useEffect(() => {
    if (!target) return
    setVi(null)
    setDict(null)
    setErr(null)
    setDictPending(true)
    let alive = true
    translateText(target.word, 'vi', isHan ? 'zh' : 'en')
      .then((r) => alive && setVi(r))
      .catch((e: Error) => alive && setErr(e.message))
    if (isHan) {
      setDictPending(false)
      return () => {
        alive = false
      }
    }
    // nhanh (~0,3 s): Datamuse + TTS. Chậm (tới 25 s lần đầu): IPA chuẩn, audio người đọc, ví dụ.
    defineWord(target.word)
      .then((d) => alive && setDict((cur) => (cur && cur.source === 'dictionaryapi' ? cur : d)))
      .catch(() => undefined)
    defineWordFull(target.word)
      .then((full) => {
        if (!alive) return
        setDictPending(false)
        if (!full.found) return
        setDict((cur) => {
          if (!cur) return full
          // giữ phần đã có, lấy thêm IPA chuẩn / audio người đọc / ví dụ
          return {
            ...full,
            phonetic: full.phonetic || cur.phonetic,
            audio: full.audio || cur.audio,
            meanings: full.meanings.length ? full.meanings : cur.meanings,
          }
        })
      })
      .catch(() => alive && setDictPending(false))
    return () => {
      alive = false
    }
  }, [target])

  // từ điển về sau khi đã lưu -> bổ sung IPA/định nghĩa cho mục đó
  useEffect(() => {
    if (!dict || !saved) return
    if ((!saved.phonetic && dict.phonetic) || (dict.source === 'dictionaryapi' && saved.audio.startsWith('/api/tts'))) {
      const first = dict.meanings[0]
      updateVocab(saved.id, {
        phonetic: dict.phonetic,
        audio: dict.audio,
        lemma: dict.lemma,
        definitionEn: saved.definitionEn || first?.definitions[0]?.definition || '',
        pos: saved.pos || first?.pos || '',
      })
    }
  }, [dict, saved, updateVocab])

  useLayoutEffect(() => {
    if (!target) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(W, vw - 16)
    let left = target.rect.x + target.rect.w / 2 - width / 2
    left = Math.max(8, Math.min(vw - width - 8, left))
    const h = ref.current?.offsetHeight ?? 320
    const spaceBelow = vh - (target.rect.y + target.rect.h)
    const above = spaceBelow < h + 16 && target.rect.y > h + 16
    const top = above ? target.rect.y - h - 10 : target.rect.y + target.rect.h + 10
    setPos({ left, top, above })
  }, [target, dict, vi])

  useEffect(() => {
    if (!target) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [target, close])

  const onSave = () => {
    if (!target) return
    if (saved) {
      removeVocab(saved.id)
      toast('Đã bỏ khỏi sổ từ')
      return
    }
    const first = dict?.meanings[0]
    addVocab({
      word: norm,
      lemma,
      phonetic: dict?.phonetic ?? '',
      audio: dict?.audio ?? '',
      meaningVi: vi?.text ?? '',
      definitionEn: first?.definitions[0]?.definition ?? '',
      pos: first?.pos ?? '',
      example: target.example,
      videoId: target.videoId,
      videoTitle: target.videoTitle,
      start: target.start,
    })
    toast(`Đã lưu “${norm}” vào sổ từ`, 'ok')
  }

  const canSave = !!vi || !!dict

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          ref={ref}
          key={target.word + target.rect.x + target.rect.y}
          initial={{ opacity: 0, y: pos.above ? 6 : -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          style={{ left: pos.left, top: pos.top, width: Math.min(W, window.innerWidth - 16) }}
          className="glass fixed z-40 rounded-2xl p-4 text-chu"
          role="dialog"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xl font-semibold tracking-tight">{lemma}</span>
                {dict && dict.lemma !== norm && <span className="text-sm text-chu-mo">← {norm}</span>}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-sm text-chu-mo">
                {dict ? (
                  <span className="font-mono">{dict.phonetic || '—'}</span>
                ) : (
                  <span className="skeleton inline-block h-4 w-20" />
                )}
                <button
                  className="press grid h-7 w-7 place-items-center rounded-md text-chu-nhat hover:bg-mat-noi hover:text-chu"
                  onClick={() => playWordAudio(dict?.audio ?? '', lemma)}
                  aria-label="Phát âm"
                >
                  <SpeakerHigh size={16} weight="fill" />
                </button>
              </div>
            </div>
            <button onClick={close} className="grid h-7 w-7 place-items-center rounded-md text-chu-mo hover:bg-mat-noi hover:text-chu" aria-label="Đóng">
              <span className="text-lg leading-none">×</span>
            </button>
          </div>

          <div className="mt-3 max-h-[46vh] overflow-y-auto pr-1">
            {image && (
              <div className="mb-3 aspect-[16/9] w-full overflow-hidden rounded-xl bg-mat-noi">
                <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
              </div>
            )}
            {err && !vi && <div className="text-sm text-sai">{err}</div>}

            {/* nghĩa tiếng Việt: nguồn nhanh */}
            {vi ? (
              <div className="text-[15px] font-medium text-nhan-van">{vi.text || 'Chưa có bản dịch'}</div>
            ) : (
              !err && <div className="skeleton h-5 w-2/3" />
            )}
            {vi && vi.alternatives.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {vi.alternatives.flatMap((a) =>
                  a.terms.slice(0, 4).map((t) => (
                    <span key={a.pos + t} className="rounded-md bg-mat-noi px-2 py-0.5 text-xs text-chu-nhat">
                      <span className="text-chu-mo-hon">{a.pos && a.pos.slice(0, 3) + ' · '}</span>
                      {t}
                    </span>
                  )),
                )}
              </div>
            )}

            {/* định nghĩa Anh-Anh: nguồn chậm */}
            {!dict && (
              <div className="mt-3 flex flex-col gap-2 border-t border-vien pt-3">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
              </div>
            )}
            {dict && dict.meanings.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2.5 border-t border-vien pt-3">
                {dict.meanings.slice(0, 3).map((m, i) => (
                  <li key={i} className="text-sm">
                    <span className="mr-1.5 rounded bg-mat-noi px-1.5 py-0.5 font-mono text-[11px] text-chu-nhat">{m.pos}</span>
                    <span className="text-chu">{m.definitions[0]?.definition}</span>
                    {m.definitions[0]?.example && <div className="mt-1 text-[13px] italic text-chu-mo">“{m.definitions[0].example}”</div>}
                  </li>
                ))}
              </ul>
            )}
            {dict && !dict.found && !dictPending && (
              <div className="mt-2 text-xs text-chu-mo-hon">Từ điển Anh-Anh chưa có mục này; chỉ có bản dịch máy.</div>
            )}
            {dict && dictPending && <div className="mt-2 text-[11px] text-chu-mo-hon">Đang lấy thêm ví dụ và giọng đọc người thật…</div>}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-vien pt-3">
            <div className="truncate text-xs text-chu-mo-hon">
              Trong câu: “{target.example.slice(0, 48)}
              {target.example.length > 48 ? '…' : ''}”
            </div>
            <Button size="sm" variant={saved ? 'outline' : 'primary'} onClick={onSave} disabled={!canSave && !saved} className={cx(saved && 'text-dung')}>
              {saved ? 'Đã lưu' : 'Lưu từ'}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
