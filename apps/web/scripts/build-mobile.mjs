import { execSync } from 'child_process';

console.log('🚀 Building Next.js for Capacitor (Local Bundled Asset Mode)...');
process.env.CAPACITOR_BUILD = 'true';

try {
  // 1. Build Next.js with static export to out/
  execSync('npx next build --turbopack', {
    stdio: 'inherit',
    env: { ...process.env, CAPACITOR_BUILD: 'true' }
  });

  // 2. Sync exported out/ directory into android/
  console.log('📲 Syncing assets into Android project...');
  execSync('npx cap sync android', {
    stdio: 'inherit'
  });

  console.log('✅ Mobile build and Capacitor sync completed successfully!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
