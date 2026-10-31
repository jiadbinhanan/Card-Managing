const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function fixAppIcons() {
  const rootDir = path.resolve(__dirname, '..');
  // Always read from original pristine source in web app
  const src = path.join(rootDir, 'apps/web/public/icon-512x512.png');

  console.log('Reading pristine source icon from:', src);

  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });

  // Sample top-left corner background color
  const bgR = data[0], bgG = data[1], bgB = data[2];

  // Pass 1: Make background transparent and find exact tight bounding box of real logo pixels
  const rgba = Buffer.from(data);
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      if (dist <= 35) {
        rgba[idx + 3] = 0; // Transparent
      } else {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const logoWidth = maxX - minX + 1;
  const logoHeight = maxY - minY + 1;
  console.log(`Tight glyph bounds: minX=${minX}, maxX=${maxX}, minY=${minY}, maxY=${maxY} (${logoWidth}x${logoHeight})`);

  // Extract tight glyph without any padding
  const tightLogo = await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .extract({ left: minX, top: minY, width: logoWidth, height: logoHeight })
    .png()
    .toBuffer();

  // 1. Generate 512x512 adaptive-icon.png (Centered within 58% safe zone for Android adaptive icon standard)
  const targetAdaptiveH = 290;
  const resizedAdaptive = await sharp(tightLogo)
    .resize({ height: targetAdaptiveH, fit: 'inside' })
    .toBuffer();
  const adaptiveMeta = await sharp(resizedAdaptive).metadata();
  const leftAdaptive = Math.round((512 - adaptiveMeta.width) / 2);
  const topAdaptive = Math.round((512 - adaptiveMeta.height) / 2);
  console.log(`Adaptive icon margins: left=${leftAdaptive}, right=${512 - leftAdaptive - adaptiveMeta.width}`);

  const adaptivePath = path.join(rootDir, 'apps/mobile/assets/images/adaptive-icon.png');
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: resizedAdaptive, left: leftAdaptive, top: topAdaptive }])
    .png()
    .toFile(adaptivePath);
  console.log('✅ Generated 100% symmetrically centered adaptive icon:', adaptivePath);

  // 2. Generate 512x512 icon.png with #FCFDFB background
  const iconPath = path.join(rootDir, 'apps/mobile/assets/images/icon.png');
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 252, g: 253, b: 251, alpha: 1 } }
  })
    .composite([{ input: resizedAdaptive, left: leftAdaptive, top: topAdaptive }])
    .png()
    .toFile(iconPath);
  console.log('✅ Generated 100% symmetrically centered icon.png:', iconPath);

  // 3. Generate Android Native Mipmaps across all density buckets
  const densities = [
    { name: 'mdpi', fgSize: 108, iconSize: 48 },
    { name: 'hdpi', fgSize: 162, iconSize: 72 },
    { name: 'xhdpi', fgSize: 216, iconSize: 96 },
    { name: 'xxhdpi', fgSize: 324, iconSize: 144 },
    { name: 'xxxhdpi', fgSize: 432, iconSize: 192 },
  ];

  for (const d of densities) {
    const dir = path.join(rootDir, 'apps/mobile/android/app/src/main/res', 'mipmap-' + d.name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // a) ic_launcher_foreground.webp (Transparent foreground, logo scaled to 58% of canvas, mathematically centered)
    const targetFgH = Math.round(d.fgSize * 0.58);
    const fgLogo = await sharp(tightLogo).resize({ height: targetFgH, fit: 'inside' }).toBuffer();
    const fgMeta = await sharp(fgLogo).metadata();
    const fgLeft = Math.round((d.fgSize - fgMeta.width) / 2);
    const fgTop = Math.round((d.fgSize - fgMeta.height) / 2);

    await sharp({
      create: { width: d.fgSize, height: d.fgSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([{ input: fgLogo, left: fgLeft, top: fgTop }])
      .webp({ lossless: true })
      .toFile(path.join(dir, 'ic_launcher_foreground.webp'));

    // b) ic_launcher.webp (Square icon with #FCFDFB background, scaled to 68% of canvas, mathematically centered)
    const targetIconH = Math.round(d.iconSize * 0.68);
    const iconLogo = await sharp(tightLogo).resize({ height: targetIconH, fit: 'inside' }).toBuffer();
    const iconMeta = await sharp(iconLogo).metadata();
    const iLeft = Math.round((d.iconSize - iconMeta.width) / 2);
    const iTop = Math.round((d.iconSize - iconMeta.height) / 2);

    await sharp({
      create: { width: d.iconSize, height: d.iconSize, channels: 4, background: { r: 252, g: 253, b: 251, alpha: 1 } }
    })
      .composite([{ input: iconLogo, left: iLeft, top: iTop }])
      .webp({ lossless: true })
      .toFile(path.join(dir, 'ic_launcher.webp'));

    // c) ic_launcher_round.webp (Circle-masked icon with #FCFDFB background)
    const r = d.iconSize / 2;
    const circleSvg = `<svg width="${d.iconSize}" height="${d.iconSize}"><circle cx="${r}" cy="${r}" r="${r}" fill="#ffffff"/></svg>`;
    const baseIcon = await sharp({
      create: { width: d.iconSize, height: d.iconSize, channels: 4, background: { r: 252, g: 253, b: 251, alpha: 1 } }
    })
      .composite([{ input: iconLogo, left: iLeft, top: iTop }])
      .png()
      .toBuffer();

    await sharp(baseIcon)
      .composite([{ input: Buffer.from(circleSvg), blend: 'dest-in' }])
      .webp({ lossless: true })
      .toFile(path.join(dir, 'ic_launcher_round.webp'));

    console.log(`✅ Generated mathematically centered native mipmap-${d.name}`);
  }
}

fixAppIcons().catch((err) => {
  console.error('Error fixing icons:', err);
  process.exit(1);
});
