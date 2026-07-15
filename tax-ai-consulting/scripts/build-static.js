#!/usr/bin/env node
/**
 * GitHub Pages용 정적 멀티페이지 빌드
 *
 * 세무 도구를 페이지별로 빌드해 dist/ 에 내놓는다. 각 페이지는
 * 계산 엔진을 브라우저에서 직접 실행한다(서버 불필요).
 *   index.html      + calculators.js  → 세금 계산기 (메인)
 *   scenarios.html  + scenarios.js    → 상담 시나리오
 * 새 도구(예: 비과세 판정기)를 추가하려면 PAGES에 항목 하나만 넣으면 된다.
 *
 * 사용법: npm run build:static
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const staticDir = path.join(root, 'src/web/static');
const dist = path.join(root, 'dist');

// { entry: 번들할 JS, html: 복사할 HTML } — 페이지 추가 시 여기에 등록
const PAGES = [
  { entry: 'calculators.js', html: 'index.html' },
  { entry: 'scenarios.js', html: 'scenarios.html' },
  { entry: 'transfer-heavy.js', html: 'transfer-heavy.html' },
  { entry: 'acq-heavy.js', html: 'acq-heavy.html' },
  { entry: 'single-exempt.js', html: 'single-exempt.html' },
  { entry: 'redev-exempt.js', html: 'redev-exempt.html' },
];
const ASSETS = ['styles.css'];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

await build({
  entryPoints: PAGES.map((p) => path.join(staticDir, p.entry)),
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  outdir: dist,
  logLevel: 'info',
});

for (const p of PAGES) fs.copyFileSync(path.join(staticDir, p.html), path.join(dist, p.html));
for (const a of ASSETS) fs.copyFileSync(path.join(staticDir, a), path.join(dist, a));

const kb = (f) => `${(fs.statSync(path.join(dist, f)).size / 1024).toFixed(0)}KB`;
console.log('✔ 정적 빌드 완료 (dist/):');
for (const p of PAGES) console.log(`  - ${p.html}  +  ${p.entry} (${kb(p.entry)})`);
for (const a of ASSETS) console.log(`  - ${a}`);
