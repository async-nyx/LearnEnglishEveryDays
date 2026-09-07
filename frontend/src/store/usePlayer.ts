import { create } from 'zustand'

/**
 * Bọc YouTube IFrame Player API. Trình phát thật được giữ ngoài React (module-level),
 * store chỉ phản chiếu trạng thái để UI đọc.
 */
interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  setPlaybackRate(rate: number): void
  setVolume(v: number): void
  getVolume(): number
  mute(): void
  unMute(): void
  isMuted(): boolean
  unloadModule(name: string): void
  getVideoData(): { video_id?: string }
  setOption(module: string, option: string, value: unknown): void
  loadVideoById(id: string): void
  cueVideoById(id: string): void
  destroy(): void
}

interface Loop {
  start: number
  end: number
  /** 'repeat' lặp vô hạn, 'once' phát tới cuối rồi dừng */
  mode: 'repeat' | 'once'
}

interface PlayerState {
  ready: boolean
  playing: boolean
  /** video vừa phát tới hết (trạng thái 0 của YouTube) */
  ended: boolean
  currentTime: number
  duration: number
  rate: number
  loop: Loop | null
  loopCount: number
  /** mã lỗi YouTube (2, 5, 100, 101, 150) nếu video không phát được */
  error: number | null
  /** video người dùng bấm chọn NGAY TRONG trình phát (đề xuất cuối video) — app sẽ nạp phụ đề nó */
  externalVideoId: string | null
  volume: number
  muted: boolean
  setVolume(v: number): void
  toggleMute(): void
  play(): void
  pause(): void
  toggle(): void
  seekTo(t: number, autoplay?: boolean): void
  setRate(rate: number): void
  setLoop(loop: Loop | null): void
  /** phát một đoạn [start,end): tự dừng ở cuối (hoặc lặp) */
  playRange(start: number, end: number, mode?: Loop['mode']): void
  /** đang tạm dừng giữa đoạn thì nghe tiếp từ chỗ dừng; hết đoạn hoặc đoạn khác thì phát lại từ đầu */
  resumeRange(start: number, end: number): void
}

let player: YTPlayer | null = null
let tick: number | null = null
let apiPromise: Promise<void> | null = null
let currentVideoId: string | null = null
/** sau khi app tự đổi video, bỏ qua phát hiện "video lạ" một lúc vì getVideoData còn trả mã cũ */
let ignoreForeignUntil = 0

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement | string, opts: unknown) => YTPlayer; PlayerState: Record<string, number> }
    onYouTubeIframeAPIReady?: () => void
  }
}

function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    document.head.appendChild(s)
  })
  return apiPromise
}

/** Chỉ trả về player khi API đã sẵn sàng; trước đó các hàm như seekTo còn chưa tồn tại trên đối tượng. */
function live(): YTPlayer | null {
  return player && usePlayer.getState().ready ? player : null
}

export const usePlayer = create<PlayerState>()((set, get) => ({
  ready: false,
  playing: false,
  ended: false,
  currentTime: 0,
  duration: 0,
  rate: 1,
  loop: null,
  loopCount: 0,
  error: null,
  externalVideoId: null,
  volume: 100,
  muted: false,
  setVolume: (v) => {
    const vol = Math.max(0, Math.min(100, Math.round(v)))
    live()?.setVolume(vol)
    if (vol > 0 && get().muted) live()?.unMute()
    set({ volume: vol, muted: vol === 0 ? true : false })
  },
  toggleMute: () => {
    if (get().muted) {
      live()?.unMute()
      set({ muted: false, volume: get().volume || 100 })
    } else {
      live()?.mute()
      set({ muted: true })
    }
  },

  play: () => live()?.playVideo(),
  pause: () => live()?.pauseVideo(),
  toggle: () => (get().playing ? live()?.pauseVideo() : live()?.playVideo()),
  seekTo: (t, autoplay = true) => {
    const p = live()
    if (!p) return
    p.seekTo(Math.max(0, t), true)
    set({ currentTime: t })
    if (autoplay) p.playVideo()
  },
  setRate: (rate) => {
    live()?.setPlaybackRate(rate)
    set({ rate })
  },
  setLoop: (loop) => set({ loop, loopCount: 0 }),
  playRange: (start, end, mode = 'once') => {
    set({ loop: { start, end, mode }, loopCount: 0 })
    get().seekTo(start, true)
  },
  resumeRange: (start, end) => {
    const { currentTime, playing, loop } = get()
    const inside = currentTime > start + 0.05 && currentTime < end - 0.15
    const sameRange = loop && Math.abs(loop.start - start) < 0.01
    if (!playing && inside && sameRange) {
      live()?.playVideo()
      return
    }
    get().playRange(start, end, 'once')
  },
}))

function startTicker() {
  if (tick !== null) return
  tick = window.setInterval(() => {
    if (!player) return
    let t = 0
    try {
      t = player.getCurrentTime()
    } catch {
      return
    }
    // người dùng bấm video đề xuất trong iframe -> trình phát đổi video mà app không biết
    if (Date.now() > ignoreForeignUntil) {
      try {
        const vid = player.getVideoData?.().video_id
        if (vid && currentVideoId && vid !== currentVideoId && usePlayer.getState().externalVideoId !== vid) {
          usePlayer.setState({ externalVideoId: vid, loop: null })
        }
      } catch {
        /* bỏ qua */
      }
    }
    const { loop, playing, loopCount } = usePlayer.getState()
    if (loop && playing && t >= loop.end - 0.05) {
      if (loop.mode === 'repeat') {
        player.seekTo(loop.start, true)
        usePlayer.setState({ currentTime: loop.start, loopCount: loopCount + 1 })
        return
      }
      player.pauseVideo()
      usePlayer.setState({ currentTime: loop.end, loop: null })
      return
    }
    usePlayer.setState({ currentTime: t })
  }, 120)
}

/** Gắn trình phát vào một phần tử DOM. Trả về hàm huỷ. */
export function mountPlayer(el: HTMLElement, videoId: string, host: 'youtube' | 'nocookie' = 'youtube'): () => void {
  let cancelled = false
  currentVideoId = videoId
  ignoreForeignUntil = Date.now() + 6000
  loadApi().then(() => {
    if (cancelled || !window.YT) return
    player = new window.YT.Player(el, {
      videoId,
      width: '100%',
      height: '100%',
      host: host === 'nocookie' ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com',
      playerVars: {
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        cc_load_policy: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        enablejsapi: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          if (!player) return
          const rate = usePlayer.getState().rate
          try {
            player.setPlaybackRate(rate)
          } catch {
            /* bỏ qua */
          }
          // tắt phụ đề YouTube tự bật: app đã có phụ đề riêng, chữ đè lên hình chỉ gây nhiễu
          try {
            player.unloadModule('captions')
            player.unloadModule('cc')
          } catch {
            /* bỏ qua */
          }
          let volume = 100
          let muted = false
          try {
            volume = player.getVolume()
            muted = player.isMuted()
          } catch {
            /* bỏ qua */
          }
          usePlayer.setState({ ready: true, error: null, duration: player.getDuration(), volume, muted })
          startTicker()
        },
        onStateChange: (e: { data: number }) => {
          const playing = e.data === 1
          usePlayer.setState({ playing, ended: e.data === 0 })
          // mô-đun phụ đề chỉ tháo được khi đã bắt đầu phát; thử lại ở mỗi lần vào trạng thái phát
          if (playing) {
            try {
              player?.unloadModule('captions')
              player?.unloadModule('cc')
              player?.setOption('captions', 'track', {})
            } catch {
              /* bỏ qua */
            }
          }
          if (player && e.data !== -1) usePlayer.setState({ duration: player.getDuration() })
        },
        onPlaybackRateChange: (e: { data: number }) => usePlayer.setState({ rate: e.data }),
        onError: (e: { data: number }) => usePlayer.setState({ error: e.data }),
      },
    })
  })
  return () => {
    cancelled = true
    if (tick !== null) {
      clearInterval(tick)
      tick = null
    }
    try {
      player?.destroy()
    } catch {
      /* bỏ qua */
    }
    player = null
    currentVideoId = null
    usePlayer.setState({ ready: false, playing: false, currentTime: 0, loop: null })
  }
}

export function switchVideo(videoId: string) {
  if (!player || currentVideoId === videoId) return
  currentVideoId = videoId
  ignoreForeignUntil = Date.now() + 4000
  usePlayer.setState({ loop: null, currentTime: 0, playing: false, error: null, externalVideoId: null })
  player.cueVideoById(videoId)
  try {
    player.unloadModule('captions')
    player.unloadModule('cc')
  } catch {
    /* bỏ qua */
  }
}
