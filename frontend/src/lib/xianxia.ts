import glossary from '../data/xianxia.json'
import hanvietRaw from '../data/hanviet.json'

/*
  TIÊN HIỆP / TU TIÊN — vì sao có tệp này.

  Dịch máy hỏng đúng ở chỗ quan trọng nhất của thể loại này: thuật ngữ tu luyện và tên người.
  Đo thật trên phụ đề Phàm Nhân Tu Tiên:
    神识隔绝      -> "phong tỏa ý thức"        (đúng: cách tuyệt thần thức)
    马道友这是怀疑 -> "ngựa đạo hữu"/"Mã đạo sĩ" (đúng: Mã đạo hữu)
    功法表像      -> "sự xuất hiện của kỹ thuật"(đúng: biểu tượng công pháp)

  Hai lớp chữa:
   1. THAY TRƯỚC KHI DỊCH — đổi thuật ngữ và tên riêng sang âm Hán-Việt rồi mới đưa cho máy dịch.
      Máy giữ nguyên chữ Latin và dịch phần còn lại, nên câu ra vừa đúng thuật ngữ vừa đúng ngữ pháp.
   2. HỌ NGƯỜI TRƯỚC TỪ XƯNG HÔ — 马道友 mà chỉ thay 道友 thì còn trơ chữ 马 và máy dịch là "ngựa".
      Nên chữ đơn đứng ngay trước từ xưng hô được đọc theo âm Hán-Việt (Mã, Hàn, Cốc…).
*/

export interface XiaTerm {
  /** âm Hán-Việt / cách gọi quen thuộc trong truyện dịch */
  hv: string
  /** giải thích ngắn cho người mới */
  vi: string
}

const RAW = glossary as { terms: Record<string, XiaTerm>; names: Record<string, Record<string, string>> }
export const XIA_TERMS: Record<string, XiaTerm> = RAW.terms
export const XIA_NAMES_BY_SERIES: Record<string, Record<string, string>> = RAW.names
export const HANVIET: Record<string, string> = hanvietRaw as Record<string, string>

/** Tên riêng của mọi bộ gộp lại — tên trong truyện đủ đặc trưng nên ít khi đụng nhau. */
const NAMES: Record<string, string> = {}
for (const map of Object.values(RAW.names)) for (const [zh, vi] of Object.entries(map)) NAMES[zh] = vi

/** Bảng tra chung: thuật ngữ trước, tên riêng sau (thuật ngữ thắng khi trùng). */
const LOOKUP = new Map<string, { vi: string; term?: XiaTerm; isName: boolean }>()
for (const [zh, vi] of Object.entries(NAMES)) LOOKUP.set(zh, { vi, isName: true })
for (const [zh, t] of Object.entries(XIA_TERMS)) LOOKUP.set(zh, { vi: t.hv, term: t, isName: false })
const MAX_LEN = Math.max(...Array.from(LOOKUP.keys(), (k) => k.length))

/** Từ xưng hô: chữ đứng ngay trước chúng gần như luôn là HỌ của nhân vật. */
const HONORIFIC = new Set([
  '道友', '前辈', '晚辈', '师兄', '师姐', '师弟', '师妹', '师尊', '师父', '长老', '掌门', '弟子', '公子', '姑娘', '大人',
])

const HAN = /\p{Script=Han}/u

export function hasHan(text: string): boolean {
  return HAN.test(text)
}

/** Âm Hán-Việt của một chữ; chữ nào Unihan không có thì trả về chính chữ đó. */
export function hanVietChar(ch: string): string | null {
  return HANVIET[ch] ?? null
}

/** Đọc cả câu theo âm Hán-Việt. Chữ không tra được giữ nguyên để người đọc thấy chỗ thiếu. */
export function hanVietLine(text: string): string {
  if (!HAN.test(text)) return '' // dòng không có chữ Hán thì chẳng có gì để đọc Hán-Việt
  const out: string[] = []
  let latin = ''
  const flush = () => {
    if (latin.trim()) out.push(latin.trim())
    latin = ''
  }
  for (const ch of text) {
    // BẪY: bản đầu tách TỪNG ký tự nên chữ Latin trong câu bị xé thành "F r u i t s"
    if (HAN.test(ch)) {
      flush()
      out.push(hanVietChar(ch) ?? ch)
    } else {
      latin += ch
    }
  }
  flush()
  return out.join(' ').replace(/\s+([,.!?;:])/g, '$1').trim()
}

export interface TermHit {
  /** chữ Hán gốc */
  zh: string
  /** âm Hán-Việt dùng thay */
  vi: string
  /** giải thích, chỉ có với thuật ngữ (tên riêng thì không) */
  note?: string
  isName: boolean
  at: number
}

/** Quét trái sang phải, ưu tiên cụm DÀI nhất (元婴 phải thắng 元 + 婴). */
export function matchTerms(text: string): TermHit[] {
  const hits: TermHit[] = []
  let i = 0
  while (i < text.length) {
    let found: TermHit | null = null
    for (let len = Math.min(MAX_LEN, text.length - i); len >= 1; len--) {
      const piece = text.slice(i, i + len)
      const entry = LOOKUP.get(piece)
      if (entry) {
        found = { zh: piece, vi: entry.vi, note: entry.term?.vi, isName: entry.isName, at: i }
        break
      }
    }
    if (found) {
      hits.push(found)
      i += found.zh.length
    } else {
      i += 1
    }
  }
  return hits
}


/* ─────────────────────────── TẦNG 2: NHẬN DIỆN TÊN RIÊNG (NER nhẹ) ───────────────────────────
   Từ điển không thể liệt kê hết tên trong mọi phim. Ba khuôn bắt được gần hết:
     · X某            -> "X mỗ"           (王某 = Vương mỗ — máy dịch hay ra "ông Vương nào đó")
     · XX宗/门/派/殿…  -> "Thanh Vân Tông"  (tên tông môn, địa danh)
     · X + xưng hô     -> "Mã đạo hữu"      (họ đứng trước 道友/前辈/师兄…)
   Tên nhận ra được GHI NHỚ cho cả video (`buildTermMemory`) nên chương nào cũng dịch giống nhau —
   đây là chỗ dịch máy trần hay lệch nhất: cùng một tên mỗi câu một kiểu.
*/

const SECT_SUFFIX: Record<string, string> = {
  宗: 'Tông', 门: 'Môn', 派: 'Phái', 殿: 'Điện', 阁: 'Các', 谷: 'Cốc', 峰: 'Phong', 城: 'Thành',
  山: 'Sơn', 府: 'Phủ', 域: 'Vực', 界: 'Giới', 楼: 'Lâu', 堂: 'Đường', 观: 'Quán', 寺: 'Tự',
  岛: 'Đảo', 教: 'Giáo', 帮: 'Bang', 会: 'Hội', 族: 'Tộc', 国: 'Quốc',
}

/** Hư từ tiếng Trung — không bao giờ là một phần của tên riêng. */
const FUNCTION_CHARS = new Set('你我他她它的了是在不这那们和与就都很有为会要把被从对也还又能可'.split(''))

export interface Entity {
  zh: string
  vi: string
  kind: 'name' | 'sect' | 'term'
}

const capWords = (s: string) => s.split(/\s+/).filter(Boolean).map(capitalize).join(' ')

/** Đọc cả cụm Hán theo âm Hán-Việt; thiếu chữ nào thì trả null (không đoán bừa). */
function readAll(chunk: string): string | null {
  const out: string[] = []
  for (const ch of chunk) {
    const r = hanVietChar(ch)
    if (!r) return null
    out.push(r)
  }
  return out.join(' ')
}

/** Tên riêng và tông môn xuất hiện trong câu. */
export function detectEntities(text: string): Entity[] {
  const found: Entity[] = []
  const seen = new Set<string>()
  const push = (zh: string, vi: string, kind: Entity['kind']) => {
    if (!seen.has(zh)) {
      seen.add(zh)
      found.push({ zh, vi, kind })
    }
  }

  // X某 -> "Vương mỗ"
  for (const m of text.matchAll(/([\p{Script=Han}])某/gu)) {
    const r = hanVietChar(m[1])
    if (r) push(m[0], `${capitalize(r)} mỗ`, 'name')
  }

  // 青云宗 -> "Thanh Vân Tông"
  const sects = new RegExp(`([\\p{Script=Han}]{2,3})([${Object.keys(SECT_SUFFIX).join('')}])`, 'gu')
  for (const m of text.matchAll(sects)) {
    if (XIA_TERMS[m[0]] || NAMES[m[0]]) continue // đã có trong từ điển thì để từ điển lo
    // BẪY: 你天剑宗 ra "Nể Thiên Kiếm Tông" vì nuốt cả chữ 你. Hư từ không bao giờ nằm trong tên.
    let head = m[1]
    while (head && FUNCTION_CHARS.has(head[0])) head = head.slice(1)
    if (head.length < 2 || Array.from(head).some((c) => FUNCTION_CHARS.has(c))) continue
    const read = readAll(head)
    if (!read) continue
    push(head + m[2], `${capWords(read)} ${SECT_SUFFIX[m[2]]}`, 'sect')
  }

  return found
}

/**
 * Trí nhớ thuật ngữ của CẢ video: quét mọi câu một lần, gộp từ điển + tên nhận diện được.
 * Dùng cho cả dịch máy lẫn lời nhắc AI để tên và thuật ngữ nhất quán từ đầu tới cuối.
 */
export function buildTermMemory(lines: string[]): Map<string, Entity> {
  const mem = new Map<string, Entity>()
  for (const line of lines) {
    for (const hit of matchTerms(line)) {
      if (!mem.has(hit.zh)) mem.set(hit.zh, { zh: hit.zh, vi: hit.vi, kind: hit.isName ? 'name' : 'term' })
    }
    for (const e of detectEntities(line)) if (!mem.has(e.zh)) mem.set(e.zh, e)
  }
  return mem
}

/**
 * Video này có phải phim truyện tu tiên không? Đếm thuật ngữ trong trí nhớ.
 * BẪY: bật văn phong "truyện" cho MỌI video tiếng Trung thì Peppa Pig cũng xưng "ta/ngươi".
 */
export function isNovelContext(): boolean {
  let n = 0
  for (const e of memory.values()) if (e.kind === 'term' || e.kind === 'sect') n += 1
  return n >= 3
}

/** Trí nhớ đang dùng cho video hiện tại (đặt ở `Study`, đọc trong `translateSentence`). */
let memory: Map<string, Entity> = new Map()
export function setTermMemory(mem: Map<string, Entity>): void {
  memory = mem
}
export function termMemory(): Map<string, Entity> {
  return memory
}

/** Thuật ngữ phủ lên vị trí `index` (dùng khi người học bấm vào một chữ trong câu). */
export function termAt(text: string, index: number): TermHit | null {
  for (const hit of matchTerms(text)) {
    if (hit.at <= index && index < hit.at + hit.zh.length) return hit
  }
  return null
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Gộp cụm từ điển với tên riêng nhận diện tại chỗ; cụm nào phủ lên nhau thì giữ cụm DÀI hơn. */
function mergeHits(base: TermHit[], text: string): TermHit[] {
  const extra: TermHit[] = []
  for (const e of detectEntities(text)) {
    let at = text.indexOf(e.zh)
    while (at >= 0) {
      extra.push({ zh: e.zh, vi: e.vi, isName: true, at })
      at = text.indexOf(e.zh, at + e.zh.length)
    }
  }
  const all = [...base, ...extra].sort((a, b) => a.at - b.at || b.zh.length - a.zh.length)
  const out: TermHit[] = []
  let end = -1
  for (const h of all) {
    if (h.at < end) continue
    out.push(h)
    end = h.at + h.zh.length
  }
  return out
}

export interface Prepared {
  /** câu đã thay thuật ngữ, sẵn sàng đưa cho máy dịch */
  text: string
  /** những chỗ đã thay, để hiện chú thích dưới câu */
  hits: TermHit[]
  changed: boolean
}

/**
 * Thay thuật ngữ + tên riêng bằng âm Hán-Việt trước khi đưa câu cho máy dịch.
 * Chữ đơn đứng ngay trước từ xưng hô được coi là họ và cũng đọc Hán-Việt.
 */
export function prepareForTranslation(text: string): Prepared {
  if (!hasHan(text)) return { text, hits: [], changed: false }
  const hits = mergeHits(matchTerms(text), text)
  if (!hits.length) return { text, hits: [], changed: false }
  let out = ''
  let cursor = 0
  for (const hit of hits) {
    let before = text.slice(cursor, hit.at)
    // 马道友 -> Mã đạo hữu (không thì máy dịch chữ 马 thành "ngựa")
    if (HONORIFIC.has(hit.zh) && before.length >= 1) {
      const last = before[before.length - 1]
      const beforeLast = before.length >= 2 ? before[before.length - 2] : ''
      const standalone = HAN.test(last) && (!beforeLast || !HAN.test(beforeLast))
      const reading = standalone ? hanVietChar(last) : null
      if (reading) before = `${before.slice(0, -1)} ${capitalize(reading)}`
    }
    out += `${before} ${hit.vi} `
    cursor = hit.at + hit.zh.length
  }
  out += text.slice(cursor)
  return { text: out.replace(/\s+/g, ' ').trim(), hits, changed: true }
}

/** Bảng thuật ngữ gọn để nhét vào lời nhắc AI (chỉ những từ có trong câu). */
export function glossaryFor(sentences: string[], limit = 60): string {
  const seen = new Map<string, { vi: string; note?: string }>()
  // ưu tiên thuật ngữ/tên có trong CHÍNH đoạn này, rồi bù thêm từ trí nhớ cả video
  for (const s of sentences) {
    for (const h of mergeHits(matchTerms(s), s)) if (!seen.has(h.zh)) seen.set(h.zh, { vi: h.vi, note: h.note })
  }
  for (const [zh, e] of memory) if (!seen.has(zh) && seen.size < limit) seen.set(zh, { vi: e.vi })
  return Array.from(seen.entries())
    .slice(0, limit)
    .map(([zh, e]) => `${zh} = ${e.vi}${e.note ? ` (${e.note})` : ''}`)
    .join('\n')
}


/* ─────────────────────── TẦNG 4: HẬU BIÊN TẬP — KHOÁ THUẬT NGỮ TRONG BẢN DỊCH ───────────────────
   ĐO THẬT rồi mới đổi cách làm: thay thuật ngữ TRƯỚC khi dịch làm vỡ câu — 青云宗的弟子 ra
   "Thanh Vân Tông Đích đệ tử" (chữ 的 trơ ra thành "Đích"), 闭关 ra "làm quan". Nên bây giờ:
     1. để máy dịch nguyên câu (nó lo cú pháp, đại từ, trật tự),
     2. rồi tìm xem máy đã dịch từng thuật ngữ thành chữ gì và THAY bằng cách viết chuẩn.
   Nhờ vậy câu vẫn tự nhiên mà 神识 luôn là "thần thức", 王某 luôn là "Vương mỗ" ở mọi câu.
*/

/** Chữ quá chung, thay vào là hỏng câu (máy dịch 我 = "tôi" thì đừng đụng). */
const RISKY = new Set([
  'tôi', 'ta', 'bạn', 'ngươi', 'anh', 'chị', 'em', 'nó', 'họ', 'của', 'là', 'và', 'người', 'cái', 'này', 'kia',
  'ông', 'bà', 'cô', 'chú', 'ai', 'gì', 'đó', 'các', 'những', 'một', 'hai', 'ba',
])

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Thay cách máy dịch một thuật ngữ bằng cách viết chuẩn.
 * `renderings` = bản dịch máy của RIÊNG thuật ngữ đó (gọi một lần rồi nhớ, xem `lib/api.ts`).
 */
export function lockTerms(vi: string, zh: string, renderings: Map<string, string>): string {
  let out = vi
  const hits = mergeHits(matchTerms(zh), zh)
  // cụm dài thay trước để không bị cụm ngắn cắt mất
  const sorted = [...hits].sort((a, b) => b.zh.length - a.zh.length)
  for (const hit of sorted) {
    if (out.toLowerCase().includes(hit.vi.toLowerCase())) continue // máy dịch đã đúng rồi
    const machine = (renderings.get(hit.zh) ?? '').trim().replace(/[.。!！?？,，]+$/, '')
    const forms: string[] = []
    if (machine && machine.length >= 2 && !RISKY.has(machine.toLowerCase())) forms.push(escapeRe(machine))
    for (const a of ALIASES[hit.zh] ?? []) forms.push(escapeRe(a))
    // tên tông môn: khớp cả phần đầu kèm đuôi máy tự chọn ("Thanh Vân phái" -> "Thanh Vân Tông")
    const sect = /\s(Tông|Môn|Phái|Điện|Các|Cốc|Phong|Thành|Sơn|Phủ|Vực|Giới|Lâu|Đường|Quán|Tự|Đảo|Giáo|Bang|Hội|Tộc|Quốc)$/.exec(hit.vi)
    // BẪY: máy hay viết "Giáo phái Thiên Kiếm" — nuốt cả tiền tố, không thì ra "Giáo phái Thiên Kiếm Tông"
    if (sect) forms.push(SECT_HEAD + escapeRe(hit.vi.slice(0, sect.index)) + SECT_TAIL)
    if (!forms.length) continue
    const re = new RegExp(`(^|[^\\p{L}])(${forms.join('|')})(?![\\p{L}])`, 'giu')
    if (!re.test(out)) continue
    out = out.replace(new RegExp(`(^|[^\\p{L}])(${forms.join('|')})(?![\\p{L}])`, 'giu'), (_m, pre: string, hitText: string) => {
      const upper = hitText[0] === hitText[0].toUpperCase() && hitText[0] !== hitText[0].toLowerCase()
      const rep = upper ? hit.vi[0].toUpperCase() + hit.vi.slice(1) : hit.vi
      return pre + rep
    })
  }
  return out
}

/*
  BẢNG "MÁY HAY DỊCH THÀNH" — đo trên phụ đề thật, không phải đoán.
  Hỏi riêng một thuật ngữ thì máy trả một kiểu, nhưng đặt trong câu nó lại chọn kiểu khác
  (青云宗 đứng riêng = "Thanh Vân Tông", trong câu = "Thanh Vân phái"). Nên ngoài bản dịch dò được,
  còn khớp thêm những cách viết sai quen thuộc này.
*/
const ALIASES: Record<string, string[]> = {
  道友: ['đạo sĩ', 'bạn đạo', 'người bạn đạo', 'bạn tu'],
  师尊: ['thầy', 'sư phụ', 'chủ nhân'],
  师父: ['thầy', 'sư phụ'],
  师兄: ['sư huynh', 'anh trai', 'sư ca'],
  师姐: ['chị gái', 'sư tỷ'],
  前辈: ['tiền bối', 'người tiền nhiệm', 'bậc tiền bối'],
  闭关: ['ẩn dật', 'đóng cửa', 'bế môn'],
  神识: ['ý thức', 'tâm trí', 'tinh thần', 'thần thức'],
  元神: ['nguyên thần', 'linh hồn'],
  修为: ['tu luyện', 'trình độ tu luyện'],
  修士: ['tu sĩ', 'người tu luyện', 'thầy tu'],
  法宝: ['bảo bối', 'kho báu ma thuật', 'pháp bảo'],
  灵石: ['đá tinh linh', 'linh thạch', 'đá linh hồn'],
  灵气: ['linh khí', 'khí linh', 'năng lượng'],
  功法: ['kỹ thuật', 'công pháp', 'phương pháp'],
  神通: ['sức mạnh siêu nhiên', 'thần thông', 'phép thuật'],
  丹药: ['thuốc', 'đan dược', 'viên thuốc'],
  天劫: ['thiên kiếp', 'thảm họa'],
  渡劫: ['vượt qua thảm họa', 'độ kiếp'],
  元婴: ['em bé nguyên thủy', 'nguyên anh', 'thai nhi'],
  金丹: ['kim đan', 'viên thuốc vàng', 'đan vàng'],
  筑基: ['xây nền', 'trúc cơ', 'nền móng'],
  魂师: ['bậc thầy linh hồn', 'linh hồn sư', 'hồn sư'],
  武魂: ['linh hồn võ thuật', 'võ hồn'],
  魂环: ['vòng linh hồn', 'hồn hoàn'],
  斗气: ['khí chiến đấu', 'đấu khí'],
  宗门: ['giáo phái', 'tông môn', 'môn phái'],
  弟子: ['đệ tử', 'học trò', 'môn đồ'],
  掌门: ['chưởng môn', 'trưởng môn', 'người đứng đầu'],
  长老: ['trưởng lão', 'người lớn tuổi'],
  秘境: ['bí cảnh', 'vùng đất bí ẩn', 'cõi bí mật'],
  洞府: ['hang động', 'động phủ'],
  妖兽: ['yêu thú', 'quái vật', 'con thú'],
  凡人: ['phàm nhân', 'người phàm', 'người thường'],
}

/** Tên tông môn: máy hay đổi hậu tố (Tông ↔ phái ↔ giáo phái ↔ môn). */
const SECT_HEAD = '(?:(?:giáo phái|môn phái|tông môn|bang hội|gia tộc)\\s+)?'
const SECT_TAIL = '(?:\\s+(?:tông|tông môn|phái|môn phái|giáo phái|môn|bang|hội|điện|các|thành|sơn|cốc))?'

/** Những cụm cần hỏi máy dịch riêng để biết nó đang dịch thành chữ gì. */
export function termsToProbe(zh: string): string[] {
  return mergeHits(matchTerms(zh), zh).map((h) => h.zh)
}
