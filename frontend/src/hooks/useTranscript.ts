import { useEffect, useMemo, useState } from 'react'
import { selectCurrentTranscript, useStore } from '../store/useStore'
import { usePlayer } from '../store/usePlayer'
import { buildSentences } from '../lib/text'
import type { Sentence, TranscriptData } from '../lib/types'

export function useCurrentTranscript(): TranscriptData | null {
  return useStore(selectCurrentTranscript)
}

export function useSentences(data: TranscriptData | null): Sentence[] {
  return useMemo(() => (data ? buildSentences(data.segments) : []), [data])
}

/** Chỉ số câu đang phát (theo currentTime), -1 nếu chưa tới câu nào. */
export function useActiveIndex(items: { start: number; end?: number; duration?: number }[]): number {
  const t = usePlayer((s) => s.currentTime)
  return useMemo(() => {
    if (!items.length) return -1
    // tìm nhị phân theo start
    let lo = 0
    let hi = items.length - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (items[mid].start <= t + 0.05) {
        ans = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return ans
  }, [items, t])
}

/** Debounce đơn giản. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}
