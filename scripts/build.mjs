#!/usr/bin/env node

import { execSync } from 'child_process';
import {
  existsSync,
  rmSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isDev = args.includes('--dev') || isWatch;

// Clean dist
console.log('🧹 Cleaning dist/...');
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// Build with Vite
console.log(`📦 Building with Vite (${isDev ? 'development' : 'production'})...`);

const env = { ...process.env, NODE_ENV: isDev ? 'development' : 'production' };

const viteArgs = ['build'];
if (isWatch) viteArgs.push('--watch');

try {
  execSync(`npx vite ${viteArgs.join(' ')}`, { cwd: ROOT, env, stdio: 'inherit' });
} catch (err) {
  console.error('❌ Vite build failed');
  process.exit(1);
}

// Build content scripts separately as IIFE (Chrome doesn't allow ESM in content scripts)
console.log('📦 Building content scripts (IIFE)...');
for (const name of ['content', 'content-dispatcher']) {
  try {
    execSync(`npx vite build --config vite.config.iife.ts --emptyOutDir false`, {
      cwd: ROOT,
      env: { ...env, VITE_IIFE_ENTRY: name },
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(`❌ ${name}.js build failed`);
    process.exit(1);
  }
}

// Verify output
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
  'bungee-processor.js',
  'bungee-wasm.bin',
];

let allFound = true;
for (const file of requiredFiles) {
  if (!existsSync(join(DIST, file))) {
    console.warn(`  ⚠️  Missing: ${file}`);
    allFound = false;
  }
}

if (allFound) console.log('✅ All required files present.');
else console.warn('⚠️  Some files are missing - the extension may not work correctly.');

function getDirSize(dirPath) {
  let size = 0;
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const fp = join(dirPath, entry.name);
      if (entry.isDirectory()) size += getDirSize(fp);
      else if (entry.isFile()) size += statSync(fp).size;
    }
  } catch {}
  return size;
}

const totalSize = getDirSize(DIST);
console.log('');
console.log('✅ Build complete!');
console.log(`   Output: ${DIST}`);
console.log(
  `   Size:   ${(totalSize / 1024).toFixed(1)} KB (${(totalSize / 1024 / 1024).toFixed(2)} MB)`,
);
console.log('');
console.log('📋 To load in Chrome:');
console.log('   1. Go to chrome://extensions');
console.log('   2. Enable "Developer mode"');
console.log('   3. Click "Load unpacked"');
console.log(`   4. Select the "${DIST}" folder`);
