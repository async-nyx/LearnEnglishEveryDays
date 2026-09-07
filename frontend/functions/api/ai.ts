import { fail, json } from './_shared'

/**
 * Chuyển tiếp lời gọi AI khi trình duyệt chặn CORS. Khoá của người dùng chỉ đi qua, KHÔNG lưu,
 * KHÔNG ghi log, và không có khoá nào của máy chủ ở đây.
 */
export const onRequestPost = async ({ request }: { request: Request }) => {
  let body: { provider?: string; key?: string; prompt?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return fail('Body không hợp lệ.')
  }
  const { provider, key, prompt } = body
  if (!key || !prompt) return fail('Thiếu khoá hoặc nội dung.')
  if (provider !== 'gemini' && provider !== 'grok') return fail('Nhà cung cấp không hỗ trợ.')

  try {
    if (provider === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }),
      })
      const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } }
      if (!r.ok) return fail(data.error?.message ?? `Gemini lỗi ${r.status}`, 502)
      return json({ success: true, text: data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '' })
    }
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'grok-4-fast', messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
    })
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } | string }
    if (!r.ok) return fail(typeof data.error === 'string' ? data.error : (data.error?.message ?? `Grok lỗi ${r.status}`), 502)
    return json({ success: true, text: data.choices?.[0]?.message?.content ?? '' })
  } catch (e) {
    return fail(`Không gọi được AI: ${(e as Error).message}`, 502)
  }
}
