import { useMemo } from 'react'
import { LEVELS, LEVEL_LABEL, libraryItem, type Level } from '../lib/library'
import { boxLabel } from '../lib/srs'
import { buildSentences } from '../lib/text'
import { useStore } from '../store/useStore'
import { cx } from './ui'

const DAY = 86400000

function dayKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Tiến trình: chuỗi ngày, lịch hoạt động 12 tuần, từng video, sổ từ theo hộp, bậc đã học. */
export function ProgressView() {
  const activity = useStore((s) => s.activity)
  const history = useStore((s) => s.history)
  const transcripts = useStore((s) => s.transcripts)
  const dictation = useStore((s) => s.dictation)
  const shadowing = useStore((s) => s.shadowing)
  const vocab = useStore((s) => s.vocab)
  const openVideo = useStore((s) => s.openVideo)
  const setStudyMode = useStore((s) => s.setStudyMode)
  const openLibraryVideo = useStore((s) => s.openLibraryVideo)

  const today = dayKey(Date.now())
  const totals = useMemo(() => {
    let dictOk = 0
    let shadow = 0
    for (const rows of Object.values(dictation)) for (const e of Object.values(rows)) if (e.ok) dictOk++
    for (const rows of Object.values(shadowing)) for (const v of Object.values(rows)) if (v >= 0.8) shadow++
    return { dictOk, shadow }
  }, [dictation, shadowing])

  // chuỗi ngày liên tiếp có hoạt động (tính tới hôm nay hoặc hôm qua)
  const streak = useMemo(() => {
    let n = 0
    let t = Date.now()
    if (!activity[dayKey(t)]) t -= DAY
    while (activity[dayKey(t)]) {
      n++
      t -= DAY
    }
    return n
  }, [activity])

  const activeDays = Object.keys(activity).length

  // lịch 12 tuần, cột = tuần, hàng = thứ (T2 đầu)
  const weeks = useMemo(() => {
    const end = new Date()
    end.setHours(0, 0, 0, 0)
    const endDow = (end.getDay() + 6) % 7 // T2=0
    const start = new Date(end.getTime() - (endDow + 11 * 7) * DAY)
    const cols: { key: string; score: number; future: boolean }[][] = []
    for (let w = 0; w < 12; w++) {
      const col = []
      for (let d = 0; d < 7; d++) {
        const t = start.getTime() + (w * 7 + d) * DAY
        const key = dayKey(t)
        const a = activity[key]
        const score = a ? a.dictOk + a.shadow + a.words + a.opened : 0
        col.push({ key, score, future: t > end.getTime() })
      }
      cols.push(col)
    }
    return cols
  }, [activity])

  const boxes = useMemo(() => {
    const c = [0, 0, 0, 0, 0, 0]
    for (const v of vocab) c[Math.min(5, v.srs.box)]++
    return c
  }, [vocab])
  const due = vocab.filter((v) => v.srs.due <= Date.now()).length

  const levels = useMemo(() => {
    const c: Record<Level, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }
    for (const h of history) {
      const l = libraryItem(h.videoId)?.level
      if (l) c[l]++
    }
    return c
  }, [history])
  const maxLevel = Math.max(1, ...Object.values(levels))

  const videos = useMemo(
    () =>
      history.map((h) => {
        const data = transcripts[h.videoId]
        const total = data ? buildSentences(data.segments).length : 0
        const d = dictation[h.videoId] ?? {}
        const s = shadowing[h.videoId] ?? {}
        return {
          ...h,
          total,
          dictOk: Object.values(d).filter((e) => e.ok).length,
          shadowOk: Object.values(s).filter((v) => v >= 0.8).length,
          level: libraryItem(h.videoId)?.level,
          cached: !!data,
        }
      }),
    [history, transcripts, dictation, shadowing],
  )

  const open = (id: string, mode: 'read' | 'dictation' | 'shadow') => {
    setStudyMode(mode)
    if (transcripts[id]) openVideo(id)
    else void openLibraryVideo(id)
  }

  return (
    <div className="flex w-full flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Tiến trình</h2>
        <p className="mt-1 text-sm text-chu-mo">Mọi số liệu tính từ dữ liệu trên máy này. Ngày có bất kỳ hoạt động nào (mở video, chép đúng một câu, nói đạt, lưu từ) đều tính là ngày học.</p>
      </header>

      {/* số tổng */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-vien hairline sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Chuỗi ngày" value={streak} unit="ngày" accent={streak > 0} hint={activity[today] ? 'Hôm nay đã học' : 'Hôm nay chưa học'} />
        <Stat label="Ngày đã học" value={activeDays} unit="ngày" />
        <Stat label="Video đã mở" value={history.length} />
        <Stat label="Câu chép đúng" value={totals.dictOk} />
        <Stat label="Câu nói đạt" value={totals.shadow} />
        <Stat label="Từ đã lưu" value={vocab.length} hint={due ? `${due} tới hạn ôn` : 'Không có từ tới hạn'} accent={due > 0} />
      </section>

      {/* lịch hoạt động */}
      <section>
        <h3 className="text-[17px] font-semibold tracking-tight">12 tuần gần đây</h3>
        <p className="mb-3 text-[13px] text-chu-mo">Mỗi ô là một ngày; đậm hơn là làm nhiều hơn.</p>
        <div className="flex gap-3 overflow-x-auto pb-1">
          <div className="grid grid-rows-7 gap-1 text-[10px] text-chu-mo-hon">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
              <span key={d} className="flex h-4 items-center">
                {d}
              </span>
            ))}
          </div>
          {weeks.map((col, i) => (
            <div key={i} className="grid grid-rows-7 gap-1">
              {col.map((c) => (
                <span
                  key={c.key}
                  title={`${c.key}: ${c.score} hoạt động`}
                  className={cx(
                    'h-4 w-4 rounded-[4px]',
                    c.future ? 'bg-transparent' : c.score === 0 ? 'bg-mat-noi' : c.score < 3 ? 'bg-nhan/30' : c.score < 8 ? 'bg-nhan/60' : 'bg-nhan',
                    c.key === today && 'ring-2 ring-chu/40',
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* từng video */}
        <section>
          <h3 className="text-[17px] font-semibold tracking-tight">Từng video</h3>
          <p className="mb-3 text-[13px] text-chu-mo">Bấm số để mở đúng chế độ đó.</p>
          {videos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-vien p-6 text-sm text-chu-mo-hon">Chưa mở video nào.</div>
          ) : (
            <ul className="divide-y divide-vien rounded-2xl bg-mat hairline">
              {videos.map((v) => (
                <li key={v.videoId} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto]">
                  <button onClick={() => open(v.videoId, 'read')} className="press overflow-hidden rounded-lg">
                    <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                  </button>
                  <div className="min-w-0">
                    <button onClick={() => open(v.videoId, 'read')} className="press block max-w-full truncate text-left text-[14px] font-semibold text-chu hover:underline">
                      {v.title}
                    </button>
                    <div className="mt-0.5 truncate text-xs text-chu-mo">
                      {v.author || 'YouTube'}
                      {v.level && <span className="ml-2 rounded bg-mat-noi px-1.5 py-0.5 font-mono text-[10px] text-chu-nhat">{v.level}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <Bar label="Chép" ok={v.dictOk} total={v.total} onClick={() => open(v.videoId, 'dictation')} />
                      <Bar label="Nói" ok={v.shadowOk} total={v.total} onClick={() => open(v.videoId, 'shadow')} />
                    </div>
                  </div>
                  <div className="hidden text-right text-[11px] text-chu-mo-hon sm:block">{new Date(v.lastOpened).toLocaleDateString('vi-VN')}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-8">
          {/* sổ từ theo hộp */}
          <section>
            <h3 className="text-[17px] font-semibold tracking-tight">Sổ từ theo mức nhớ</h3>
            <p className="mb-3 text-[13px] text-chu-mo">Hộp càng cao thì lần ôn tới càng xa.</p>
            <ul className="flex flex-col gap-2 rounded-2xl bg-mat p-4 hairline">
              {boxes.map((n, i) => (
                <li key={i} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
                  <span className="text-chu-nhat">
                    {boxLabel(i)} <span className="font-mono text-[11px] text-chu-mo-hon">·{i}</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-mat-noi">
                    <span className={cx('block h-full rounded-full', i >= 5 ? 'bg-dung' : i >= 3 ? 'bg-nhan' : 'bg-luu-y')} style={{ width: `${vocab.length ? (n / vocab.length) * 100 : 0}%` }} />
                  </span>
                  <span className="text-right font-mono text-xs text-chu">{n}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* bậc đã học */}
          <section>
            <h3 className="text-[17px] font-semibold tracking-tight">Bậc đã học</h3>
            <p className="mb-3 text-[13px] text-chu-mo">Số video trong thư viện đã mở theo bậc.</p>
            <ul className="flex flex-col gap-2 rounded-2xl bg-mat p-4 hairline">
              {LEVELS.map((l) => (
                <li key={l} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
                  <span className="text-chu-nhat">
                    <span className="font-mono font-semibold text-chu">{l}</span> <span className="text-[11px] text-chu-mo-hon">{LEVEL_LABEL[l]}</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-mat-noi">
                    <span className="block h-full rounded-full bg-nhan" style={{ width: `${(levels[l] / maxLevel) * 100}%` }} />
                  </span>
                  <span className="text-right font-mono text-xs text-chu">{levels[l]}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, unit, hint, accent }: { label: string; value: number; unit?: string; hint?: string; accent?: boolean }) {
  return (
    <div className="bg-mat px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-chu-mo-hon">{label}</div>
      <div className={cx('mt-1 font-mono text-2xl font-semibold tabular-nums', accent ? 'text-nhan-van' : 'text-chu')}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-chu-mo">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-chu-mo">{hint}</div>}
    </div>
  )
}

function Bar({ label, ok, total, onClick }: { label: string; ok: number; total: number; onClick: () => void }) {
  const pct = total ? Math.round((ok / total) * 100) : 0
  return (
    <button onClick={onClick} className="press flex items-center gap-2 rounded-md px-1.5 py-0.5 hover:bg-mat-noi" title={`${label}: ${ok}${total ? `/${total}` : ''}`}>
      <span className="text-chu-mo">{label}</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-mat-noi">
        <span className="block h-full rounded-full bg-nhan" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-chu">
        {ok}
        {total ? <span className="text-chu-mo-hon">/{total}</span> : ''}
      </span>
    </button>
  )
}
