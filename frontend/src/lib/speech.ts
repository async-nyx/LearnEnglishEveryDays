/** Đọc to bằng giọng máy của trình duyệt (ưu tiên giọng tiếng Anh). */
export function speak(text: string, rate = 1): void {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = rate
  const voices = speechSynthesis.getVoices()
  const en =
    voices.find((v) => v.lang === 'en-US' && /natural|neural|google|online/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith('en'))
  if (en) u.voice = en
  speechSynthesis.speak(u)
}

let audioEl: HTMLAudioElement | null = null
/** Phát tệp âm thanh từ điển; nếu không có thì đọc bằng giọng máy. */
export function playWordAudio(url: string, fallbackText: string): void {
  if (url) {
    if (!audioEl) audioEl = new Audio()
    audioEl.src = url.startsWith('//') ? `https:${url}` : url
    audioEl.play().catch(() => speak(fallbackText))
    return
  }
  speak(fallbackText)
}

// ---------------------------------------------------------------- nhận dạng giọng nói
type RecognitionCtor = new () => SpeechRecognitionLike
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export const speechRecognitionSupported = (): boolean => getRecognitionCtor() !== null

export interface Recognizer {
  start(): void
  stop(): void
}

export function createRecognizer(handlers: {
  onInterim?: (text: string) => void
  onFinal: (text: string) => void
  onEnd?: () => void
  onError?: (err: string) => void
}): Recognizer | null {
  const Ctor = getRecognitionCtor()
  if (!Ctor) return null
  const rec = new Ctor()
  rec.lang = 'en-US'
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1
  let finalText = ''
  rec.onresult = (e) => {
    let interim = ''
    finalText = ''
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i]
      const t = r[0]?.transcript ?? ''
      if (r.isFinal) finalText += t + ' '
      else interim += t
    }
    handlers.onInterim?.((finalText + interim).trim())
  }
  rec.onerror = (e) => handlers.onError?.(e.error)
  rec.onend = () => {
    handlers.onFinal(finalText.trim())
    handlers.onEnd?.()
  }
  return {
    start: () => {
      finalText = ''
      try {
        rec.start()
      } catch {
        /* đã chạy */
      }
    },
    stop: () => rec.stop(),
  }
}

// ---------------------------------------------------------------- ghi âm
export interface RecorderHandle {
  stop(): Promise<Blob>
  stream: MediaStream
}

export async function startRecording(): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const chunks: BlobPart[] = []
  const rec = new MediaRecorder(stream)
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  rec.start()
  return {
    stream,
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop())
          resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))
        }
        rec.stop()
      }),
  }
}
