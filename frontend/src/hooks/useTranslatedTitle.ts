import { useEffect, useState } from 'react'
import { translateText } from '../lib/api'
import { prepareForTranslation } from '../lib/xianxia'
import { cleanEpisodeTitle } from '../lib/series'

/**
 * Tên video trên YouTube toàn chữ Hán và rác kênh ("ENG SUB《斗罗大陆2绝世唐门》EP01 | … | 腾讯视频").
 * Hook này dọn rác rồi dịch sang tiếng Việt để người học biết mình đang xem tập nào, nói về gì.
 * Chỉ dịch khi tên có chữ Hán; kết quả cache theo tên nên đổi qua đổi lại không gọi lại mạng.
 */
export function useTranslatedTitle(title: string | null | undefined): string {
  const [vi, setVi] = useState('')
  useEffect(() => {
    const raw = (title ?? '').trim()
    setVi('')
    if (!raw || !/\p{Script=Han}/u.test(raw)) return
    // BẪY: cleanEpisodeTitle xoá dấu 【】《》 trước, nên phải bóc nhãn kênh và ghi chú phụ đề
    // TRƯỚC nó — không thì còn trơ chữ "繁中字幕 Ani-Mi Asia" và dịch máy dịch luôn cả cái đó.
    const stripped = raw
      .replace(/【[^】]*】/g, ' ')
      .replace(/[(（\[][^)）\]]*(字幕|SUB|sub|DUB|dub)[^)）\]]*[)）\]]/g, ' ')
      .replace(/(繁中字幕|简中字幕|簡中字幕|中英字幕|多语字幕|多語字幕|中字|生肉|熟肉)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const clean = (cleanEpisodeTitle(stripped) || stripped).trim() || raw
    let alive = true
    /*
      Với TÊN VIDEO thì thay tên phim TRƯỚC khi dịch (khác câu thoại — xem lib/xianxia.ts).
      Tên là phần chính của tiêu đề, mà hậu biên tập không bắt được vì máy dịch tên phim đứng riêng
      một kiểu ("Truyền thuyết bất tử"), đặt trong tiêu đề lại ra kiểu khác ("Tu luyện bất tử").
      Tiêu đề ngắn nên thay trước không làm vỡ ngữ pháp như câu thoại.
    */
    const prepped = prepareForTranslation(clean)
    void translateText(prepped.changed ? prepped.text : clean, 'vi', 'zh')
      .then((r) => alive && r.text && r.text.trim() !== clean && setVi(r.text.trim()))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [title])
  return vi
}
