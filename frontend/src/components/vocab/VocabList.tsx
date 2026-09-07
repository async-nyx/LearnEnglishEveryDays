import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SpeakerHigh } from '@phosphor-icons/react'
import { boxLabel, isDue } from '../../lib/srs'
import { playWordAudio } from '../../lib/speech'
import { downloadText, formatTime, normalizeWord, tokenize } from '../../lib/text'
import type { VocabItem } from '../../lib/types'
import { findImage } from '../../lib/images'
import { usePlayer } from '../../store/usePlayer'
import { useStore } from '../../store/useStore'
import { Button, EmptyState, cx } from '../ui'

type Sort = 'newest' | 'due' | 'alpha'

export function VocabList() {
  const vocab = useStore((s) => s.vocab)
  const removeVocab = useStore((s) => s.removeVocab)
  const openVideo = useStore((s) => s.openVideo)
  const transcripts = useStore((s) => s.transcripts)
  const toast = useStore((s) => s.toast)
  const seekTo = usePlayer((s) => s.seekTo)
  const imageSlugs = useStore((s) => s.imageSlugs)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('newest')

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let arr = vocab
    if (needle) arr = arr.filter((v) => v.word.includes(needle) || v.meaningVi.toLowerCase().includes(needle) || v.definitionEn.toLowerCase().includes(needle))
    arr = [...arr]
    if (sort === 'newest') arr.sort((a, b) => b.createdAt - a.createdAt)
    if (sort === 'due') arr.sort((a, b) => a.srs.due - b.srs.due)
    if (sort === 'alpha') arr.sort((a, b) => a.word.localeCompare(b.word))
    return arr
  }, [vocab, q, sort])

  const stats = useMemo(() => {
    const now = Date.now()
    return {
      total: vocab.length,
      due: vocab.filter((v) => isDue(v.srs, now)).length,
      learned: vocab.filter((v) => v.srs.box >= 5).length,
    }
  }, [vocab])

  const exportCsv = () => {
    const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`
    const rows = vocab.map((v) => [v.word, v.phonetic, v.meaningVi, v.definitionEn, v.example, v.videoTitle].map(esc).join(','))
    downloadText('subloop-vocab.csv', ['word,ipa,meaning_vi,definition_en,example,source', ...rows].join('\n'))
    toast('Đã tải tệp CSV (nhập được vào Anki)', 'ok')
  }

  const goToSource = (v: VocabItem) => {
    if (!transcripts[v.videoId]) {
      toast('Video này không còn trong bộ đệm. Dán lại liên kết để mở.', 'info')
      return
    }
    openVideo(v.videoId)
    setTimeout(() => seekTo(Math.max(0, v.start - 0.3)), 600)
  }

  if (vocab.length === 0) {
    return (
      <EmptyState
        title="Sổ từ còn trống"
        body="Mở một video, bấm vào bất kỳ từ nào trong phụ đề rồi chọn “Lưu từ”. Từ sẽ về đây kèm câu ví dụ và mốc thời gian."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-mat-noi hairline sm:max-w-md">
        <Stat label="Tổng" value={stats.total} />
        <Stat label="Cần ôn" value={stats.due} tone={stats.due > 0 ? 'accent' : undefined} />
        <Stat label="Đã thuộc" value={stats.learned} tone="ok" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex min-w-[200px] flex-1 items-center">
          
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm từ hoặc nghĩa…"
            className="h-9 w-full rounded-lg border border-vien bg-mat px-3 text-sm placeholder:text-chu-mo-hon focus:border-chu-mo-hon focus:outline-none"
          />
        </div>
        <div className="flex items-center rounded-lg bg-mat p-0.5 hairline">
          {(
            [
              ['newest', 'Mới nhất'],
              ['due', 'Sắp ôn'],
              ['alpha', 'A–Z'],
            ] as [Sort, string][]
          ).map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)} className={cx('press h-8 rounded-md px-2.5 text-[13px]', sort === k ? 'bg-vien text-chu' : 'text-chu-mo hover:text-chu')}>
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          
          CSV
        </Button>
      </div>

      <ul className="divide-y divide-vien">
        <AnimatePresence initial={false}>
          {list.map((v) => (
            <motion.li
              key={v.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -12 }}
              className="group grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="flex min-w-0 gap-3">
              {findImage(imageSlugs, v.lemma, v.word) && (
                <img src={findImage(imageSlugs, v.lemma, v.word) ?? ''} alt="" loading="lazy" className="mt-1 h-16 w-20 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  <span className="text-[17px] font-semibold tracking-tight text-chu">{v.word}</span>
                  {v.phonetic && <span className="font-mono text-sm text-chu-mo">{v.phonetic}</span>}
                  <button className="press text-chu-mo hover:text-chu" onClick={() => playWordAudio(v.audio, v.word)} aria-label="Phát âm">
                    <SpeakerHigh size={15} weight="fill" />
                  </button>
                  <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-medium', boxTone(v.srs.box))}>{boxLabel(v.srs.box)}</span>
                </div>
                <div className="mt-0.5 text-[15px] text-nhan-van">{v.meaningVi || '—'}</div>
                {v.definitionEn && <div className="mt-0.5 text-sm text-chu-mo">{v.pos && <span className="mr-1 font-mono text-[11px] text-chu-mo-hon">{v.pos}</span>}{v.definitionEn}</div>}
                {v.example && (
                  <div className="mt-1.5 text-sm leading-relaxed text-chu-nhat">
                    <Example text={v.example} word={v.word} />
                  </div>
                )}
              </div>
              </div>
              <div className="flex items-start gap-1 sm:flex-col sm:items-end">
                <button onClick={() => goToSource(v)} className="press inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-chu-mo hover:bg-mat-noi hover:text-chu" title={v.videoTitle}>
                  
                  <span className="max-w-[160px] truncate">{v.videoTitle || 'Video'}</span>
                  <span className="font-mono">{formatTime(v.start)}</span>
                </button>
                <button onClick={() => removeVocab(v.id)} className="press inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-chu-mo-hon hover:bg-sai/10 hover:text-sai">
                  
                  Xoá
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {list.length === 0 && <div className="py-6 text-sm text-chu-mo-hon">Không có từ nào khớp “{q}”.</div>}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'accent' | 'ok' }) {
  return (
    <div className="bg-mat px-4 py-3">
      <div className={cx('font-mono text-2xl font-semibold tabular-nums', tone === 'accent' ? 'text-nhan-van' : tone === 'ok' ? 'text-dung' : 'text-chu')}>{value}</div>
      <div className="text-xs text-chu-mo-hon">{label}</div>
    </div>
  )
}

function boxTone(box: number) {
  if (box === 0) return 'bg-mat-noi text-chu-nhat'
  if (box <= 2) return 'bg-luu-y/10 text-luu-y'
  if (box <= 4) return 'bg-nhan/10 text-nhan-van'
  return 'bg-dung/10 text-dung'
}

export function Example({ text, word }: { text: string; word: string }) {
  const target = normalizeWord(word)
  return (
    <span>
      {tokenize(text).map((t, i) =>
        t.isWord && normalizeWord(t.text).startsWith(target) ? (
          <mark key={i} className="rounded bg-nhan/20 px-0.5 text-chu">
            {t.text}
          </mark>
        ) : (
          <span key={i}>{t.text}</span>
        ),
      )}
    </span>
  )
}
