/*
 * Generates the iOS app icon and launch image from public/favicon.svg, the same source as the
 * PWA and Android icons. Run `npm run icons:ios` after changing the logo.
 *
 * iOS rounds the icon's corners itself and rejects an icon with transparency, so the tile is
 * drawn square and the PNG is flattened. The launch image is the glyph on the brand green the
 * Android splash uses, centred, since iOS crops it to fill the screen.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const ASSETS = 'ios/App/App/Assets.xcassets'
const BRAND = '#3F6B52'
const svg = readFileSync('public/favicon.svg', 'utf8')
const tile = /<rect[^>]*\/>/

if (!tile.test(svg)) throw new Error('favicon.svg no longer starts with the background <rect>')

const square = svg.replace(tile, (rect) => rect.replace(/\srx="[^"]*"/, ''))
const icon = await sharp(Buffer.from(square), { density: 288 })
  .resize(1024, 1024)
  .flatten({ background: BRAND })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toBuffer()
writeFileSync(`${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`, icon)

const glyph = svg
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(tile, '')
const SIZE = 2732
const MARK = 560
const launch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BRAND}"/>
  <svg x="${(SIZE - MARK) / 2}" y="${(SIZE - MARK) / 2}" width="${MARK}" height="${MARK}" viewBox="0 0 512 512">${glyph}</svg>
</svg>`
const splash = await sharp(Buffer.from(launch)).png({ compressionLevel: 9 }).toBuffer()
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  writeFileSync(`${ASSETS}/Splash.imageset/${name}`, splash)
}

console.log('iOS icon and launch image written to', ASSETS)
