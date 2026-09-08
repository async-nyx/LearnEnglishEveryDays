import { STYLE_LABEL, type TransStyle } from './novel-style'
import { glossaryFor } from './xianxia'

/** Nói cho AI biết mức Hán-Việt mong muốn — cùng ba mức với tầng văn phong ở `novel-style.ts`. */
const STYLE_BRIEF: Record<TransStyle, string> = {
  tunhien:
    'Văn phong: tiếng Việt hiện đại, dễ hiểu nhất. Đại từ dùng tôi/bạn/anh ấy/cô ấy, hạn chế từ Hán-Việt ngoài thuật ngữ bắt buộc.',
  truyen:
    'Văn phong: như truyện tiên hiệp dịch hay — câu cú Việt tự nhiên nhưng giữ lớp từ Hán-Việt đặc trưng, xưng hô ta/ngươi/hắn/nàng/sư huynh/tiền bối theo vai vế. Đây là mức mặc định, đừng Việt hoá tới mức mất chất truyện, cũng đừng phiên âm Hán-Việt cả câu.',
  cophong:
    'Văn phong: cổ phong đậm — ta/ngươi/hắn/nàng, "vì sao", "lúc này", "chẳng lẽ", "e rằng"; vẫn phải đọc hiểu được, không phiên âm Hán-Việt cả câu.',
}
/**
 * Gọi AI bằng KHOÁ CỦA NGƯỜI DÙNG. Mặc định gọi thẳng từ trình duyệt để khoá không rời máy;
 * nhà cung cấp nào chặn CORS thì tự rơi về proxy `/api/ai` (máy chủ chỉ chuyển tiếp, không lưu khoá).
 */
export type AiProvider = 'gemini' | 'grok'

/**
 * Google khai tử model rất nhanh: khoá mới không gọi được `gemini-2.5-flash` nữa ("no longer
 * available to new users"). Nên ở đây là DANH SÁCH theo thứ tự mới → cũ; khi người dùng để
 * "Tự chọn", app thử lần lượt và nhớ lại model đầu tiên chạy được trong phiên này.
 */
export const AI_MODEL_OPTIONS: Record<AiProvider, string[]> = {
  // danh sách Gemini 3.x đang có trên AI Studio (USER tra 2026-09-07), mới → cũ
  gemini: [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3-flash',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash',
  ],
  grok: ['grok-4-fast', 'grok-4', 'grok-3'],
}

/** Model mặc định hiển thị khi người dùng chưa chọn gì. */
export const AI_MODELS: Record<AiProvider, string> = {
  gemini: AI_MODEL_OPTIONS.gemini[0],
  grok: AI_MODEL_OPTIONS.grok[0],
}

/** Model đã chạy được trong phiên này, để lần sau khỏi thử lại từ đầu. */
const working: Partial<Record<AiProvider, string>> = {}

/** Lỗi kiểu "model không tồn tại / không còn dùng được" thì đáng thử model kế tiếp. */
function isModelGone(message: string): boolean {
  return /no longer available|not found|not supported|unsupported|does not exist|404|deprecat/i.test(message)
}

export const AI_KEY_HINT: Record<AiProvider, { label: string; url: string; prefix: string }> = {
  gemini: { label: 'Google AI Studio', url: 'https://aistudio.google.com/apikey', prefix: 'AIza…' },
  grok: { label: 'xAI Console', url: 'https://console.x.ai', prefix: 'xai-…' },
}

async function callGemini(key: string, prompt: string, model: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
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

async function callGrok(key: string, prompt: string, model: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
    signal,
  })
  const data = (await r.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } | string }
  if (!r.ok) throw new Error(typeof data.error === 'string' ? data.error : (data.error?.message ?? `Grok lỗi ${r.status}`))
  const text = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Grok không trả về nội dung.')
  return text
}

async function viaProxy(provider: AiProvider, key: string, prompt: string, model: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, key, prompt, model }),
    signal,
  })
  const data = (await r.json()) as { success?: boolean; text?: string; error?: string }
  if (!r.ok || !data.success) throw new Error(data.error ?? `Máy chủ lỗi ${r.status}`)
  return data.text ?? ''
}

export async function askAi(provider: AiProvider, key: string, prompt: string, signal?: AbortSignal, model = ''): Promise<string> {
  if (!key.trim()) throw new Error('Chưa cắm khoá API.')
  // model rỗng = tự chọn: thử từ mới tới cũ, nhớ cái chạy được
  const chain = model ? [model] : [working[provider], ...AI_MODEL_OPTIONS[provider]].filter(Boolean) as string[]
  let lastError: Error | null = null
  for (const m of chain) {
    try {
      const text = await callOnce(provider, key, prompt, m, signal)
      working[provider] = m
      return text
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError') throw err
      lastError = err
      if (model || !isModelGone(err.message)) throw err // model do người dùng chọn thì báo thẳng
    }
  }
  throw lastError ?? new Error('Không gọi được AI.')
}

async function callOnce(provider: AiProvider, key: string, prompt: string, model: string, signal?: AbortSignal): Promise<string> {
  try {
    return provider === 'gemini'
      ? await callGemini(key, prompt, model, signal)
      : await callGrok(key, prompt, model, signal)
  } catch (e) {
    // TypeError = trình duyệt chặn CORS -> đi vòng qua máy chủ của app
    if (e instanceof TypeError) return viaProxy(provider, key, prompt, model, signal)
    throw e
  }
}

export interface AiSentence {
  vi: string
  note?: string
}

/**
 * Dịch một loạt câu, trả về đúng thứ tự. Yêu cầu AI trả JSON để ghép lại cho chắc.
 * Câu tiếng Trung đi kèm bảng thuật ngữ tiên hiệp khớp được trong đoạn — đây mới là chỗ chữa gốc
 * cho phim tu tiên: máy dịch nào cũng dịch phẳng 元婴/道友 nếu không được bảo trước.
 */
export async function aiTranslate(
  provider: AiProvider,
  key: string,
  sentences: string[],
  signal?: AbortSignal,
  lang: 'en' | 'zh' = 'en',
  model = '',
  style: TransStyle = 'truyen',
): Promise<AiSentence[]> {
  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const gloss = lang === 'zh' ? glossaryFor(sentences) : ''
  const prompt =
    lang === 'zh'
      ? `Bạn dịch phụ đề phim hoạt hình Trung Quốc (tiên hiệp / tu tiên) cho người Việt xem phim.
Dịch CẢ CÂU cho tự nhiên và đúng văn cảnh của đoạn — KHÔNG ghép nghĩa từng chữ. Phụ đề không có dấu
câu, câu dài thì tự tách ý cho đúng.
${STYLE_BRIEF[style]}
Thuật ngữ tu luyện và tên riêng dùng ÂM HÁN-VIỆT như truyện dịch quen dùng (元婴 = Nguyên Anh, 道友 = đạo hữu,
韩立 = Hàn Lập, 王某 = Vương mỗ, 青云宗 = Thanh Vân Tông), TUYỆT ĐỐI không dịch nghĩa đen ("em bé nguyên thủy",
"bạn đạo", "ngựa đạo hữu", "ông Vương nào đó"). Cùng một tên phải dịch GIỐNG NHAU ở mọi câu.
Câu nào có thuật ngữ lạ thì thêm ghi chú NGẮN (dưới 20 từ) giải thích cho người mới xem.${
          gloss ? `\n\nBảng thuật ngữ và tên riêng của phim này (dùng ĐÚNG cách viết này):\n${gloss}` : ''
        }

Chỉ trả về JSON, không thêm chữ nào khác, dạng:
{"items":[{"vi":"bản dịch câu 1","note":"ghi chú nếu có"}, ...]}

Các câu:
${numbered}`
      : `Bạn là giáo viên tiếng Anh dạy người Việt. Dịch từng câu dưới đây sang tiếng Việt tự nhiên, đúng văn cảnh của cả đoạn (không dịch từng chữ).
Với câu có cấu trúc hoặc thành ngữ đáng chú ý, thêm một ghi chú NGẮN bằng tiếng Việt (dưới 20 từ) giải thích chỗ đó.

Chỉ trả về JSON, không thêm chữ nào khác, dạng:
{"items":[{"vi":"bản dịch câu 1","note":"ghi chú nếu có"}, ...]}

Các câu:
${numbered}`
  const raw = await askAi(provider, key, prompt, signal, model)
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
export async function aiExplain(
  provider: AiProvider,
  key: string,
  sentence: string,
  context: string,
  signal?: AbortSignal,
  lang: 'en' | 'zh' = 'en',
  model = '',
  style: TransStyle = 'truyen',
): Promise<string> {
  const gloss = lang === 'zh' ? glossaryFor([sentence, context]) : ''
  const prompt =
    lang === 'zh'
      ? `Bạn giảng phụ đề phim hoạt hình Trung Quốc (tiên hiệp / tu tiên) cho người Việt đang học tiếng Trung, nói ngắn gọn và cụ thể.
Câu cần giảng: "${sentence}"
Ngữ cảnh quanh câu: "${context}"${gloss ? `\n\nThuật ngữ liên quan:\n${gloss}` : ''}

Viết bằng tiếng Việt, dùng đúng bốn mục sau, mỗi mục 1-2 câu, không thêm mục nào khác:
**Nghĩa:** dịch tự nhiên theo văn phong ${STYLE_LABEL[style].toLowerCase()}, thuật ngữ và tên riêng để âm Hán-Việt.
**Chữ khó:** 2-3 chữ hoặc từ đáng học, kèm pinyin, âm Hán-Việt và nghĩa.
**Cách nói:** cấu trúc hoặc cách nói đáng chú ý trong câu.
**Trong phim:** thuật ngữ tu luyện xuất hiện ở đây nghĩa là gì (bỏ mục này nếu câu không có).`
      : `Bạn là giáo viên tiếng Anh dạy người Việt, nói ngắn gọn và cụ thể.
Câu cần giảng: "${sentence}"
Ngữ cảnh quanh câu: "${context}"

Viết bằng tiếng Việt, dùng đúng bốn mục sau, mỗi mục 1-2 câu, không thêm mục nào khác:
**Nghĩa:** dịch tự nhiên.
**Cấu trúc:** cấu trúc ngữ pháp chính trong câu.
**Từ đáng nhớ:** 2-3 từ hoặc cụm đáng học, kèm nghĩa.
**Nói thế nào:** chỗ nối âm hoặc trọng âm khiến câu này khó nghe.`
  return askAi(provider, key, prompt, signal, model)
}
