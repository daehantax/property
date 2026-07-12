#!/usr/bin/env node
/**
 * GitHub Pages용 정적 빌드
 *
 * 계산 엔진 + 폼 + 보고서 빌더를 esbuild로 하나의 브라우저 번들로 묶고,
 * 정적 셸(index.html)과 함께 dist/ 에 내놓는다.
 *
 * 사용법: npm run build:static   →  dist/index.html, dist/bundle.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src/web/static/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(dist, 'bundle.js'),
  logLevel: 'info',
});

fs.copyFileSync(path.join(root, 'src/web/static/index.html'), path.join(dist, 'index.html'));

const size = (f) => `${(fs.statSync(path.join(dist, f)).size / 1024).toFixed(0)}KB`;
console.log(`✔ 정적 빌드 완료: dist/index.html, dist/bundle.js (${size('bundle.js')})`);
