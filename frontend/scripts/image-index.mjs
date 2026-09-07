// Sinh danh sách slug ảnh từ public/media/vocabulary/en -> functions/api/_images.json (chạy trước build).
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const dir = path.join(root, 'public', 'media', 'vocabulary', 'en')
const out = path.join(root, 'functions', 'api', '_images.json')
let slugs = []
try {
  slugs = fs
    .readdirSync(dir)
    .filter((f) => /\.(webp|png|jpe?g)$/i.test(f))
    .map((f) => f.replace(/\.[^.]+$/, ''))
    .sort()
} catch {
  slugs = []
}
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(slugs))
console.log(`image-index: ${slugs.length} ảnh -> functions/api/_images.json`)
