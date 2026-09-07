/**
 * Gọi AI bằng KHOÁ CỦA NGƯỜI DÙNG. Mặc định gọi thẳng từ trình duyệt để khoá không rời máy;
 * nhà cung cấp nào chặn CORS thì tự rơi về proxy `/api/ai` (máy chủ chỉ chuyển tiếp, không lưu khoá).
 */
export type AiProvider = 'gemini' | 'grok'

export const AI_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-2.5-flash',
  grok: 'grok-4-fast',
}

export const AI_KEY_HINT: Record<AiProvider, { label: string; url: string; prefix: string }> = {
  gemini: { label: 'Google AI Studio', url: 'https://aistudio.google.com/apikey', prefix: 'AIza…' },
  grok: { label: 'xAI Console', url: 'https://console.x.ai', prefix: 'xai-…' },
}

async function callGemini(key: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.gemini}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }),
    signal,
  })
  const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } }
  if (!r.ok) throw new Error(data.error?.message ?? `Gemini lỗi ${r.status}`)
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Gemini không trả về nội dung.')
  return text
}

async function callGrok(key: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: AI_MODELS.grok, messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
    signal,
  })
  const data = (await r.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } | string }
  if (!r.ok) throw new Error(typeof data.error === 'string' ? data.error : (data.error?.message ?? `Grok lỗi ${r.status}`))
  const text = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Grok không trả về nội dung.')
  return text
}

async function viaProxy(provider: AiProvider, key: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, key, prompt }),
    signal,
  })
  const data = (await r.json()) as { success?: boolean; text?: string; error?: string }
  if (!r.ok || !data.success) throw new Error(data.error ?? `Máy chủ lỗi ${r.status}`)
  return data.text ?? ''
}

export async function askAi(provider: AiProvider, key: string, prompt: string, signal?: AbortSignal): Promise<string> {
  if (!key.trim()) throw new Error('Chưa cắm khoá API.')
  try {
    return provider === 'gemini' ? await callGemini(key, prompt, signal) : await callGrok(key, prompt, signal)
  } catch (e) {
    // TypeError = trình duyệt chặn (CORS) chứ không phải nhà cung cấp từ chối -> thử qua proxy
    if (e instanceof TypeError) return viaProxy(provider, key, prompt, signal)
    throw e
  }
}

export interface AiSentence {
  vi: string
  note?: string
}

/** Dịch một loạt câu, trả về đúng thứ tự. Yêu cầu AI trả JSON để ghép lại cho chắc. */
export async function aiTranslate(provider: AiProvider, key: string, sentences: string[], signal?: AbortSignal): Promise<AiSentence[]> {
  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const prompt = `Bạn là giáo viên tiếng Anh dạy người Việt. Dịch từng câu dưới đây sang tiếng Việt tự nhiên, đúng văn cảnh của cả đoạn (không dịch từng chữ).
Với câu có cấu trúc hoặc thành ngữ đáng chú ý, thêm một ghi chú NGẮN bằng tiếng Việt (dưới 20 từ) giải thích chỗ đó.

Chỉ trả về JSON, không thêm chữ nào khác, dạng:
{"items":[{"vi":"bản dịch câu 1","note":"ghi chú nếu có"}, ...]}

Các câu:
${numbered}`
  const raw = await askAi(provider, key, prompt, signal)
  const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  let parsed: { items?: AiSentence[] }
  try {
    parsed = JSON.parse(jsonText) as { items?: AiSentence[] }
  } catch {
    throw new Error('AI trả về không đúng dạng JSON.')
  }
  const items = parsed.items ?? []
  return sentences.map((_, i) => items[i] ?? { vi: '' })
}

/** Giải thích sâu một câu: nghĩa, cấu trúc, từ khó, cách nói tự nhiên. */
export async function aiExplain(provider: AiProvider, key: string, sentence: string, context: string, signal?: AbortSignal): Promise<string> {
  const prompt = `Bạn là giáo viên tiếng Anh dạy người Việt, nói ngắn gọn và cụ thể.
Câu cần giảng: "${sentence}"
Ngữ cảnh quanh câu: "${context}"

Viết bằng tiếng Việt, dùng đúng bốn mục sau, mỗi mục 1-2 câu, không thêm mục nào khác:
**Nghĩa:** dịch tự nhiên.
**Cấu trúc:** cấu trúc ngữ pháp chính trong câu.
**Từ đáng nhớ:** 2-3 từ hoặc cụm đáng học, kèm nghĩa.
**Nói thế nào:** chỗ nối âm hoặc trọng âm khiến câu này khó nghe.`
  return askAi(provider, key, prompt, signal)
}
