import slugs from './_images.json'
import { json } from './_shared'

/** Danh sách slug ảnh có thật trong public/media/vocabulary/en (sinh lúc build bởi scripts/image-index.mjs). */
export const onRequestGet = async () => json({ success: true, base: '/media/vocabulary/en/', slugs }, 200, { 'cache-control': 'public, max-age=3600' })
