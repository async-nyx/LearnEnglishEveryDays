/**
 * Ảnh từ vựng sao từ betterVocab: assets/vocabulary/en/<slug>.webp, phục vụ ở /media/... (tránh đè /assets của Vite)
 * slug = chữ thường, mọi thứ không phải a-z0-9 thành một gạch nối, cắt gạch nối hai đầu.
 */
export const IMAGE_BASE = '/media/vocabulary/en/'

export function imageSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Thử lần lượt các ứng viên (lemma trước, rồi dạng gốc trong câu), trả URL ảnh đầu tiên có thật. */
export function findImage(slugs: ReadonlySet<string>, ...candidates: (string | undefined | null)[]): string | null {
  if (slugs.size === 0) return null
  for (const c of candidates) {
    if (!c) continue
    const slug = imageSlug(c)
    if (slug && slugs.has(slug)) return `${IMAGE_BASE}${slug}.webp`
  }
  return null
}

let loading: Promise<string[]> | null = null
export function loadImageSlugs(): Promise<string[]> {
  if (!loading) {
    loading = fetch('/api/images')
      .then((r) => r.json())
      .then((d: { slugs?: string[] }) => d.slugs ?? [])
      .catch(() => {
        loading = null
        return []
      })
  }
  return loading
}
