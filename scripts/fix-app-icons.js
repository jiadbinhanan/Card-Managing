const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function fixAppIcons() {
  const rootDir = path.resolve(__dirname, '..');
  const src = path.join(rootDir, 'apps/mobile/assets/images/icon.png');

  console.log('Reading source icon from:', src);

  // 1. Crop logo to bounding box
  const logoTrimmed = await sharp(src)
    .extract({ left: 96, top: 34, width: 365, height: 470 })
    .toBuffer();

  // Make transparent background for the logo: replace near-white background pixels with alpha=0
  const { data, info } = await sharp(logoTrimmed).raw().toBuffer({ resolveWithObject: true });
  const bgR = 252, bgG = 253, bgB = 251;
  const transparentLogo = Buffer.from(data);
  for (let i = 0; i < transparentLogo.length; i += 4) {
    const r = transparentLogo[i];
    const g = transparentLogo[i + 1];
    const b = transparentLogo[i + 2];
    const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
    if (diff < 28) {
      transparentLogo[i + 3] = 0; // Transparent
    }
  }

  const cleanLogo = await sharp(transparentLogo, {
    raw: { width: info.width, height: info.height, channels: 4 }
  }).png().toBuffer();

  // 2. Generate 512x512 adaptive-icon.png (Centered within 60% safe zone to prevent Android zoom/crop)
  const targetAdaptiveH = 290;
  const resizedForAdaptive = await sharp(cleanLogo)
    .resize({ height: targetAdaptiveH, fit: 'inside' })
    .toBuffer();
  const adaptiveMeta = await sharp(resizedForAdaptive).metadata();
  const leftAdaptive = Math.round((512 - adaptiveMeta.width) / 2);
  const topAdaptive = Math.round((512 - adaptiveMeta.height) / 2);

  const adaptivePath = path.join(rootDir, 'apps/mobile/assets/images/adaptive-icon.png');
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: resizedForAdaptive, left: leftAdaptive, top: topAdaptive }])
    .png()
    .toFile(adaptivePath);
  console.log('✅ Generated padded adaptive icon:', adaptivePath);

  // 3. Generate 512x512 icon.png with #FCFDFB background
  const iconPath = path.join(rootDir, 'apps/mobile/assets/images/icon.png');
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 252, g: 253, b: 251, alpha: 1 } }
  })
    .composite([{ input: resizedForAdaptive, left: leftAdaptive, top: topAdaptive }])
    .png()
    .toFile(iconPath);
  console.log('✅ Generated centered icon.png:', iconPath);

  // 4. Generate Android Native Mipmaps
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

    // a) ic_launcher_foreground.webp (Transparent foreground, logo scaled to 58% of canvas)
    const targetLogoH = Math.round(d.fgSize * 0.58);
    const fgLogo = await sharp(cleanLogo).resize({ height: targetLogoH, fit: 'inside' }).toBuffer();
    const fgMeta = await sharp(fgLogo).metadata();
    const fgLeft = Math.round((d.fgSize - fgMeta.width) / 2);
    const fgTop = Math.round((d.fgSize - fgMeta.height) / 2);

    await sharp({
      create: { width: d.fgSize, height: d.fgSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([{ input: fgLogo, left: fgLeft, top: fgTop }])
      .webp({ lossless: true })
      .toFile(path.join(dir, 'ic_launcher_foreground.webp'));

    // b) ic_launcher.webp (Legacy square icon with #FCFDFB background)
    const targetIconLogoH = Math.round(d.iconSize * 0.72);
    const iconLogo = await sharp(cleanLogo).resize({ height: targetIconLogoH, fit: 'inside' }).toBuffer();
    const iconMeta = await sharp(iconLogo).metadata();
    const iLeft = Math.round((d.iconSize - iconMeta.width) / 2);
    const iTop = Math.round((d.iconSize - iconMeta.height) / 2);

    await sharp({
      create: { width: d.iconSize, height: d.iconSize, channels: 4, background: { r: 252, g: 253, b: 251, alpha: 1 } }
    })
      .composite([{ input: iconLogo, left: iLeft, top: iTop }])
      .webp({ lossless: true })
      .toFile(path.join(dir, 'ic_launcher.webp'));

    // c) ic_launcher_round.webp (Circle-masked icon)
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

    console.log(`✅ Generated native mipmap-${d.name}`);
  }
}

fixAppIcons().catch((err) => {
  console.error('Error fixing icons:', err);
  process.exit(1);
});
