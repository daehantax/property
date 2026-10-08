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

import crypto from 'node:crypto';
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
  { entry: 'marriage-exempt.js', html: 'marriage-exempt.html' },
  { entry: 'local-house.js', html: 'local-house.html' },
  { entry: 'aggr-single.js', html: 'aggr-single.html' },
  { entry: 'aggr-couple.js', html: 'aggr-couple.html' },
  { entry: 'property-calc.js', html: 'property-calc.html' },
  { entry: 'law-updates.js', html: 'law-updates.html' },
  { entry: 'inherit-tax.js', html: 'inherit-tax.html' },
];
const ASSETS = ['styles.css', 'nav.js'];   // nav.js: 모든 페이지 공통 상단 메뉴(세목별 그룹)
const HTML_ONLY = ['aggr-home.html', 'rental-lessor.html'];   // JS 없이 HTML만 복사하는 페이지

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
for (const h of HTML_ONLY) fs.copyFileSync(path.join(staticDir, h), path.join(dist, h));
for (const a of ASSETS) fs.copyFileSync(path.join(staticDir, a), path.join(dist, a));

// 캐시 무효화: HTML 이 참조하는 JS·CSS 에 내용 해시를 붙인다 (예: inherit-tax.js?v=3f2a9c1b).
// GitHub Pages 는 파일을 10분간 캐시하므로, 배포 직후 브라우저가 「새 HTML + 옛 JS」를 섞어 받아
// 화면이 깨지는 것을 막는다. 파일 내용이 바뀔 때만 주소가 바뀐다.
const hashOf = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, f))).digest('hex').slice(0, 10);
for (const h of [...PAGES.map((p) => p.html), ...HTML_ONLY]) {
  const file = path.join(dist, h);
  const html = fs.readFileSync(file, 'utf8').replace(
    /(<(?:script[^>]*\ssrc|link[^>]*\shref)=")([\w.-]+\.(?:js|css))(")/g,
    (m, pre, ref, post) => (fs.existsSync(path.join(dist, ref)) ? `${pre}${ref}?v=${hashOf(ref)}${post}` : m),
  );
  fs.writeFileSync(file, html);
}

const kb = (f) => `${(fs.statSync(path.join(dist, f)).size / 1024).toFixed(0)}KB`;
console.log('✔ 정적 빌드 완료 (dist/):');
for (const p of PAGES) console.log(`  - ${p.html}  +  ${p.entry} (${kb(p.entry)})`);
for (const h of HTML_ONLY) console.log(`  - ${h}`);
for (const a of ASSETS) console.log(`  - ${a}`);
