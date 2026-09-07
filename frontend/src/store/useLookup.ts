import { create } from 'zustand'

export interface LookupTarget {
  word: string
  /** câu chứa từ, dùng làm ví dụ khi lưu */
  example: string
  videoId: string
  videoTitle: string
  start: number
  /** vị trí phần tử được bấm, để đặt popover */
  rect: { x: number; y: number; w: number; h: number }
}

interface LookupState {
  target: LookupTarget | null
  open: (t: LookupTarget) => void
  close: () => void
}

export const useLookup = create<LookupState>()((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}))
