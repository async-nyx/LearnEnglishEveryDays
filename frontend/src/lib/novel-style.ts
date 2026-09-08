/*
  TẦNG VĂN PHONG TRUYỆN — chạy SAU máy dịch.

  Vì sao cần: máy dịch lo được cú pháp nhưng chọn đại từ theo văn hiện đại, nên câu truyện tu tiên
  ra kiểu "Nếu bạn xúc phạm tôi hai lần, nếu tôi không giết bạn thì tôi không phải là Vương".
  Người đọc truyện Trung chờ "Ngươi đã phạm ta hai lần, ta còn không giết ngươi thì Vương mỗ còn gì
  là Vương mỗ".

  Ba mức (USER chọn, mặc định "truyện"):
    tunhien — để nguyên máy dịch, tiếng Việt hiện đại, dễ đọc nhất.
    truyen  — Việt tự nhiên + đại từ và lớp từ Hán-Việt của truyện. MẶC ĐỊNH.
    cophong — thêm cách nói cổ (vì sao, lúc này, chẳng lẽ…).

  Chỉ đổi ĐẠI TỪ và vài cách nói; KHÔNG đụng vào tên riêng/thuật ngữ vì tầng trước đã khoá chúng.
*/

export type TransStyle = 'tunhien' | 'truyen' | 'cophong'

export const STYLE_LABEL: Record<TransStyle, string> = {
  tunhien: 'Tự nhiên',
  truyen: 'Truyện',
  cophong: 'Cổ phong',
}

export const STYLE_HINT: Record<TransStyle, string> = {
  tunhien: 'Tiếng Việt hiện đại, dễ đọc nhất',
  truyen: 'Việt tự nhiên + ta/ngươi/hắn/nàng như truyện dịch',
  cophong: 'Đậm chất cổ: vì sao, lúc này, chẳng lẽ…',
}

/** [tìm, thay] — cụm DÀI đặt trước để không bị cụm ngắn ăn mất. */
const TRUYEN: [string, string][] = [
  ['các bạn', 'các ngươi'],
  ['các anh', 'các ngươi'],
  ['chúng tôi', 'chúng ta'],
  ['chúng mình', 'chúng ta'],
  ['bọn họ', 'bọn chúng'],
  ['anh ấy', 'hắn'],
  ['anh ta', 'hắn'],
  ['ông ấy', 'lão'],
  ['ông ta', 'lão'],
  ['cô ấy', 'nàng'],
  ['cô ta', 'nàng'],
  ['chị ấy', 'nàng'],
  ['bà ấy', 'bà ta'],
  ['cậu ấy', 'hắn'],
  ['cậu ta', 'hắn'],
  ['của bạn', 'của ngươi'],
  ['của tôi', 'của ta'],
  ['với bạn', 'với ngươi'],
  ['với tôi', 'với ta'],
  ['tôi', 'ta'],
  ['tớ', 'ta'],
  ['bạn', 'ngươi'],
  ['cậu', 'ngươi'],
  ['mày', 'ngươi'],
  ['tao', 'ta'],
]

const COPHONG: [string, string][] = [
  ['tại sao', 'vì sao'],
  ['vì sao vậy', 'vì sao'],
  ['bây giờ', 'lúc này'],
  ['hiện giờ', 'lúc này'],
  ['ngay lập tức', 'lập tức'],
  ['có lẽ', 'e rằng'],
  ['chẳng lẽ nào', 'chẳng lẽ'],
  ['không thể nào', 'tuyệt không thể'],
  ['rất nhiều', 'vô số'],
  ['một chút', 'một chút'],
  ['thế nào', 'ra sao'],
  ['như thế nào', 'ra sao'],
  ['cái gì vậy', 'cái gì'],
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Giữ nguyên chữ hoa đầu câu khi thay. */
function applyPairs(text: string, pairs: [string, string][]): string {
  let out = text
  for (const [from, to] of pairs) {
    const re = new RegExp(`(^|[^\\p{L}])(${escape(from)})(?![\\p{L}])`, 'giu')
    out = out.replace(re, (_m, pre: string, hit: string) => {
      const upper = hit[0] === hit[0].toUpperCase() && hit[0] !== hit[0].toLowerCase()
      return pre + (upper ? to[0].toUpperCase() + to.slice(1) : to)
    })
  }
  return out
}

/** Dọn rác của máy dịch: khoảng trắng thừa, dấu câu dính, chữ đầu câu. */
export function tidy(text: string): string {
  let t = text.replace(/\s+/g, ' ').trim()
  t = t.replace(/\s+([,.!?;:…])/g, '$1').replace(/([,.!?;:])(?=[^\s,.!?;:)”"'])/g, '$1 ')
  t = t.replace(/\s*"\s*/g, '"')
  if (t) t = t[0].toUpperCase() + t.slice(1)
  return t
}

export function styleVietnamese(text: string, style: TransStyle): string {
  const t = tidy(text)
  if (style === 'tunhien') return t
  const truyen = applyPairs(t, TRUYEN)
  return style === 'cophong' ? applyPairs(truyen, COPHONG) : truyen
}

/** Văn phong đang dùng. `Study` đồng bộ từ settings; `translateSentence` đọc ở đây. */
let current: TransStyle = 'truyen'
export function setTransStyle(style: TransStyle): void {
  current = style
}
export function transStyle(): TransStyle {
  return current
}
