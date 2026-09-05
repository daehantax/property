#!/usr/bin/env node
/**
 * 화면 스모크 테스트 — 배포되는 정적 사이트(dist/)의 전 페이지가 실제로 동작하는지 매일 점검한다.
 *
 * 점검 내용:
 *   1) 13개 페이지 전부: 로드 시 자바스크립트 에러 0건
 *   2) 계산기·판정기 9개 페이지: 기본 입력값으로 [계산하기/판정하기] 클릭 → #result 에 결과 표시
 *   3) 세법 동향 페이지: 타임라인 항목이 1건 이상 렌더링
 *
 * 사용법:  npm run build:static && node scripts/smoke-test.js
 * Chromium 경로: CHROMIUM_PATH 환경변수 → /opt/pw-browsers/chromium → playwright 기본 캐시 순으로 탐색.
 * 실패 시 종료코드 1 (CI 알림용).
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');

// { 페이지, 누를 버튼(없으면 로드만), 결과 확인 방법 }
const PAGES = [
  { html: 'index.html', tabs: ['증여세', '양도소득세', '재산세', '종합부동산세'], btn: '#calcBtn' },
  { html: 'transfer-heavy.html', btn: '#judgeBtn' },
  { html: 'acq-heavy.html', btn: '#judgeBtn' },
  { html: 'single-exempt.html', btn: '#judgeBtn' },
  { html: 'redev-exempt.html', btn: '#judgeBtn' },
  { html: 'marriage-exempt.html', btn: '#judgeBtn' },
  { html: 'aggr-single.html', btn: '#calcBtn' },
  { html: 'aggr-couple.html', btn: '#calcBtn' },
  { html: 'property-calc.html', btn: '#calcBtn' },
  { html: 'aggr-home.html' },
  { html: 'scenarios.html' },
  { html: 'rental-lessor.html' },
  { html: 'law-updates.html', expectSelector: '#timeline article' },
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve(dir) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!f.startsWith(dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function findChromium() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  if (fs.existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  return undefined; // playwright-core가 기본 캐시(~/.cache/ms-playwright)에서 찾는다
}

const failures = [];
const note = (page, msg) => { failures.push(`${page}: ${msg}`); console.log(`  ✗ ${page} — ${msg}`); };

const srv = await serve(dist);
const base = `http://127.0.0.1:${srv.address().port}`;
const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
console.log(`▶ 스모크 테스트 시작 (${PAGES.length}개 페이지, ${base})`);

for (const spec of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(String(e)));
  page.on('console', (m) => {
    // 외부 리소스(배지 이미지 등) 로드 실패는 무시하고 코드 에러만 잡는다
    if (m.type() === 'error' && !/Failed to load resource|net::/i.test(m.text())) jsErrors.push(m.text());
  });

  try {
    const resp = await page.goto(`${base}/${spec.html}`, { waitUntil: 'load', timeout: 15000 });
    if (!resp || !resp.ok()) { note(spec.html, `HTTP ${resp ? resp.status() : '응답 없음'}`); await page.close(); continue; }
    await page.waitForTimeout(300);

    if (spec.tabs) {
      // 메인 계산기: 세목 탭마다 계산 실행
      for (const tab of spec.tabs) {
        await page.click(`#calcTabs button:has-text("${tab}")`);
        await page.waitForTimeout(150);
        await page.click(spec.btn);
        await page.waitForTimeout(300);
        const txt = await page.textContent('#result').catch(() => '');
        if (!txt || !txt.includes('원')) note(spec.html, `[${tab}] 계산 결과가 표시되지 않음`);
      }
    } else if (spec.btn) {
      await page.click(spec.btn);
      await page.waitForTimeout(400);
      const visible = await page.isVisible('#result').catch(() => false);
      const txt = visible ? await page.textContent('#result').catch(() => '') : '';
      if (!visible || !txt.trim()) note(spec.html, '버튼 클릭 후 #result 가 비어 있음');
    } else if (spec.expectSelector) {
      const n = await page.locator(spec.expectSelector).count();
      if (n < 1) note(spec.html, `${spec.expectSelector} 렌더링 0건`);
    }

    if (jsErrors.length) note(spec.html, `JS 에러 ${jsErrors.length}건 — ${jsErrors[0]}`);
    if (!failures.some((f) => f.startsWith(spec.html))) console.log(`  ✓ ${spec.html}`);
  } catch (e) {
    note(spec.html, `예외: ${e.message}`);
  }
  await page.close();
}

await browser.close();
srv.close();

if (failures.length) {
  console.error(`\n✗ 스모크 테스트 실패 ${failures.length}건:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n✔ 스모크 테스트 전부 통과 (${PAGES.length}개 페이지)`);
