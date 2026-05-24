#!/usr/bin/env node

/**
 * Build script for Transpose React Chrome Extension
 *
 * Usage:
 *   node scripts/build.mjs          # Production build
 *   node scripts/build.mjs --watch  # Watch mode (dev)
 */

import { execSync } from 'child_process';
import { existsSync, rmSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');
const SRC = resolve(ROOT, 'src');

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isDev = args.includes('--dev') || isWatch;

// ---------------------------------------------------------------------------
// Step 1: Clean dist
// ---------------------------------------------------------------------------
console.log('🧹 Cleaning dist/...');
if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true, force: true });
}
mkdirSync(DIST, { recursive: true });

// ---------------------------------------------------------------------------
// Step 2: Run webpack
// ---------------------------------------------------------------------------
console.log(`📦 Building with webpack (${isDev ? 'development' : 'production'})...`);

const env = {
  ...process.env,
  NODE_ENV: isDev ? 'development' : 'production',
};

const webpackArgs = [
  '--config',
  'webpack.config.js',
  isWatch ? '--watch' : '',
  '--stats',
  'minimal',
].filter(Boolean);

try {
  execSync(`npx webpack ${webpackArgs.join(' ')}`, {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });
} catch (err) {
  console.error('❌ Webpack build failed');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 3: Verify build output
// ---------------------------------------------------------------------------
console.log('🔍 Verifying build output...');

const requiredFiles = [
  'manifest.json',
  'service-worker.js',
  'content.js',
  'content-dispatcher.js',
  'popup/index.html',
  'popup/index.js',
  'sidepanel/index.html',
  'sidepanel/index.js',
  'tabcapture/tabcapture.html',
  'tabcapture/tabcapture.js',
  'assets/debug/debug.html',
  'assets/debug/debug.js',
  'assets/debug/audio-worklet-test.js',
  'assets/icons/icon-128x128.png',
  'assets/icons/icon-16-32x32.png',
  'assets/icons/icon-32x32.png',
  'assets/icons/icon-48x48.png',
  'assets/icons/icon-256x256.png',
  '_locales/en/messages.json',
  '_locales/ru/messages.json',
  'rb.wasm',
  'aw-tp-processor.js',
  'aw-st-processor.js',
];

let allFound = true;
for (const file of requiredFiles) {
  const fullPath = join(DIST, file);
  if (!existsSync(fullPath)) {
    console.warn(`  ⚠️  Missing: ${file}`);
    allFound = false;
  }
}

if (allFound) {
  console.log('✅ All required files present.');
} else {
  console.warn('⚠️  Some files are missing - the extension may not work correctly.');
}

// ---------------------------------------------------------------------------
// Step 4: Summary
// ---------------------------------------------------------------------------
function getDirSize(dirPath) {
  let size = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else if (entry.isFile()) {
        size += statSync(fullPath).size;
      }
    }
  } catch {
    // ignore
  }
  return size;
}

const totalSize = getDirSize(DIST);
const sizeKB = (totalSize / 1024).toFixed(1);
const sizeMB = (totalSize / 1024 / 1024).toFixed(2);

console.log('');
console.log('✅ Build complete!');
console.log(`   Output: ${DIST}`);
console.log(`   Size:   ${sizeKB} KB (${sizeMB} MB)`);
console.log('');
console.log('📋 To load in Chrome:');
console.log('   1. Go to chrome://extensions');
console.log('   2. Enable "Developer mode"');
console.log('   3. Click "Load unpacked"');
console.log(`   4. Select the "${DIST}" folder`);
console.log('');
