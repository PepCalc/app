/*
 * Generates the Android launcher icons from public/favicon.svg, the same source as the PWA
 * icons, so both installs look identical. Run `npm run icons:android` after changing the logo.
 *
 * The adaptive foreground drops the rounded tile (the launcher draws its own shape on the brand
 * colour) and centres the glyph in the 72dp of the 108dp canvas that every mask keeps visible.
 *
 * The 512px store icon (Google Play and F-Droid) is the tile with square corners: Play applies its
 * own rounding and shadow, so a pre-rounded icon would show transparent corners inside the mask.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const RES = 'android/app/src/main/res'
const svg = readFileSync('public/favicon.svg', 'utf8')
const tile = /<rect[^>]*\/>/

if (!tile.test(svg)) throw new Error('favicon.svg no longer starts with the background <rect>')

const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
const glyph = inner.replace(tile, '')
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <svg x="18" y="18" width="72" height="72" viewBox="0 0 512 512">${glyph}</svg></svg>`
const round = svg.replace(tile, '<circle cx="256" cy="256" r="256" fill="#3f6b52"/>')
const square = svg.replace(tile, (rect) => rect.replace(/\s*rx="[^"]*"/, ''))
if (square === svg) throw new Error('favicon.svg tile has no rx to square off')

// Launcher icons are 48dp (legacy) and 108dp (adaptive layer) at each density bucket.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

for (const [bucket, scale] of Object.entries(DENSITIES)) {
  const dir = `${RES}/mipmap-${bucket}`
  mkdirSync(dir, { recursive: true })
  const outputs = [
    ['ic_launcher.png', svg, 48],
    ['ic_launcher_round.png', round, 48],
    ['ic_launcher_foreground.png', foreground, 108],
  ]
  for (const [name, source, dp] of outputs) {
    const px = Math.round(dp * scale)
    // Rasterise at 4x (density 288) so the largest bucket is downscaled, never upscaled.
    const png = await sharp(Buffer.from(source), { density: 288 })
      .resize(px, px)
      .png({ compressionLevel: 9 })
      .toBuffer()
    writeFileSync(`${dir}/${name}`, png)
  }
}

console.log('Android launcher icons written to', RES)

const STORE_ICON = 'fastlane/metadata/android/en-US/images/icon.png'
await sharp(Buffer.from(square), { density: 288 })
  .resize(512, 512)
  .ensureAlpha()
  .png({ compressionLevel: 9 })
  .toFile(STORE_ICON)
console.log('Store icon written to', STORE_ICON)
