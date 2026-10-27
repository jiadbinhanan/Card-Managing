import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const SOURCE_ICON = path.resolve('public/icon-512x512.png');
const RES_DIR = path.resolve('android/app/src/main/res');

const MIPMAP_SIZES = {
  'mipmap-mdpi': { icon: 48, foreground: 108 },
  'mipmap-hdpi': { icon: 72, foreground: 162 },
  'mipmap-xhdpi': { icon: 96, foreground: 216 },
  'mipmap-xxhdpi': { icon: 144, foreground: 324 },
  'mipmap-xxxhdpi': { icon: 192, foreground: 432 },
};

async function generateIcons() {
  console.log('Generating Android app icons from', SOURCE_ICON);

  for (const [folder, sizes] of Object.entries(MIPMAP_SIZES)) {
    const targetDir = path.join(RES_DIR, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Standard Square Icon (ic_launcher.png)
    await sharp(SOURCE_ICON)
      .resize(sizes.icon, sizes.icon)
      .toFile(path.join(targetDir, 'ic_launcher.png'));

    // 2. Round Icon (ic_launcher_round.png)
    const circleBuffer = Buffer.from(
      `<svg width="${sizes.icon}" height="${sizes.icon}"><circle cx="${sizes.icon / 2}" cy="${sizes.icon / 2}" r="${sizes.icon / 2}" fill="#ffffff"/></svg>`
    );
    await sharp(SOURCE_ICON)
      .resize(sizes.icon, sizes.icon)
      .composite([{ input: circleBuffer, blend: 'dest-in' }])
      .toFile(path.join(targetDir, 'ic_launcher_round.png'));

    // 3. Foreground Icon (ic_launcher_foreground.png) for Adaptive Icons
    // Android adaptive icons have a 108dp grid where the icon should be within the central 72dp (approx 66% scale)
    const innerSize = Math.round(sizes.foreground * 0.72);
    const innerBuffer = await sharp(SOURCE_ICON)
      .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: {
        width: sizes.foreground,
        height: sizes.foreground,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: innerBuffer, gravity: 'center' }])
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_foreground.png'));

    console.log(`✅ Generated icons for ${folder} (${sizes.icon}x${sizes.icon})`);
  }

  // 4. Generate Branded Splash Screens (Dark #030014 background with Credics logo centered)
  const SPLASH_SIZES = {
    'drawable': { width: 480, height: 320 },
    'drawable-land-mdpi': { width: 480, height: 320 },
    'drawable-land-hdpi': { width: 800, height: 480 },
    'drawable-land-xhdpi': { width: 1280, height: 720 },
    'drawable-land-xxhdpi': { width: 1600, height: 960 },
    'drawable-land-xxxhdpi': { width: 1920, height: 1280 },
    'drawable-port-mdpi': { width: 320, height: 480 },
    'drawable-port-hdpi': { width: 480, height: 800 },
    'drawable-port-xhdpi': { width: 720, height: 1280 },
    'drawable-port-xxhdpi': { width: 960, height: 1600 },
    'drawable-port-xxxhdpi': { width: 1280, height: 1920 },
  };

  for (const [folder, dims] of Object.entries(SPLASH_SIZES)) {
    const targetDir = path.join(RES_DIR, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const minDim = Math.min(dims.width, dims.height);
    const logoSize = Math.max(96, Math.round(minDim * 0.35));

    const logoBuffer = await sharp(SOURCE_ICON)
      .resize(logoSize, logoSize, { fit: 'contain' })
      .toBuffer();

    await sharp({
      create: {
        width: dims.width,
        height: dims.height,
        channels: 4,
        background: { r: 3, g: 0, b: 20, alpha: 1 }, // #030014 theme
      },
    })
      .composite([{ input: logoBuffer, gravity: 'center' }])
      .png()
      .toFile(path.join(targetDir, 'splash.png'));

    console.log(`✅ Generated splash for ${folder} (${dims.width}x${dims.height})`);
  }

  console.log('🎉 All Android icons and splash screens generated successfully!');
}

generateIcons().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
