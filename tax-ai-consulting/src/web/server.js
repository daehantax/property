/**
 * 웹 입력폼 + 보고서 서버
 *
 * 실행:  npm run web   (기본 포트 3000, PORT 환경변수로 변경)
 *
 * 경로:
 *   GET  /                  입력폼 페이지
 *   GET  /api/scenarios     시나리오·폼 필드 스펙
 *   POST /api/report        { scenarioId, inputs } → { html, markdown }
 *   POST /export/docx       같은 입력 → MS Word(.docx) 다운로드
 *   POST /export/pdf        같은 입력 → PDF 다운로드 (Chromium 필요)
 *
 * 보고서는 계산 엔진만으로 즉시 생성된다(AI·API 키 불필요).
 * PDF는 로컬 Chromium/Chrome 으로 렌더링하며, 없으면 안내 메시지를 준다
 * (그 경우 화면의 "인쇄" 버튼 → 브라우저 인쇄에서 PDF 저장 가능).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import * as scenarios from '../scenario/index.js';
import { SCENARIO_FORMS, coerceInputs, buildDefaults } from './form-specs.js';
import { buildWebReport } from './web-report.js';
import { renderReportHtml } from './report-html.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 로컬 Chromium/Chrome 실행 파일 탐색 (PDF용) */
export function resolveChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);

  // PLAYWRIGHT_BROWSERS_PATH 내 chromium-*/chrome-linux/chrome 탐색
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (pw && fs.existsSync(pw)) {
    for (const dir of fs.readdirSync(pw)) {
      if (dir.startsWith('chromium-')) {
        candidates.push(path.join(pw, dir, 'chrome-linux', 'chrome'));
        candidates.push(path.join(pw, dir, 'chrome-linux', 'headless_shell'));
      }
    }
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch { /* skip */ }
  }
  return null;
}

/** 요청 본문 → 계산 + 보고서. 오류 시 { error } */
function makeReport(body) {
  const scenarioId = Number(body?.scenarioId);
  const { inputs, errors } = coerceInputs(scenarioId, body?.inputs ?? {});
  if (!inputs) return { error: errors.join(', '), status: 400 };
  if (errors.length) return { error: `입력 오류: ${errors.join(' / ')}`, status: 400 };

  const run = scenarios[`runScenario${scenarioId}`];
  const calculation = run(inputs);
  const markdown = buildWebReport(calculation);
  const html = renderReportHtml(markdown);
  return { scenarioId, calculation, markdown, html };
}

const fileStamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

/** 한글 파일명 다운로드 헤더 */
function attachment(res, filename, mime) {
  res.setHeader('Content-Type', mime);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="report.${filename.split('.').pop()}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.sendFile(path.join(here, 'public', 'index.html'));
  });

  app.get('/api/scenarios', (_req, res) => {
    res.json(SCENARIO_FORMS.map((f) => ({
      id: f.id, title: f.title, fields: f.fields, defaults: buildDefaults(f.id),
    })));
  });

  app.post('/api/report', (req, res) => {
    try {
      const r = makeReport(req.body);
      if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
      res.json({ markdown: r.markdown, html: r.html, summary: r.calculation.summary });
    } catch (err) {
      res.status(500).json({ error: `계산 실패: ${err.message}` });
    }
  });

  app.post('/export/docx', async (req, res) => {
    try {
      const r = makeReport(req.body);
      if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
      const { default: htmlToDocx } = await import('html-to-docx');
      const buf = await htmlToDocx(r.html, null, {
        orientation: 'portrait',
        margins: { top: 1000, bottom: 1000, left: 1100, right: 1100 },
        font: 'Malgun Gothic',
        table: { row: { cantSplit: true } },
      });
      attachment(res, `세금보고서-시나리오${r.scenarioId}-${fileStamp()}.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.send(Buffer.from(buf));
    } catch (err) {
      res.status(500).json({ error: `Word 변환 실패: ${err.message}` });
    }
  });

  app.post('/export/pdf', async (req, res) => {
    try {
      const r = makeReport(req.body);
      if (r.error) return res.status(r.status ?? 400).json({ error: r.error });

      const executablePath = resolveChromium();
      if (!executablePath) {
        return res.status(501).json({
          error: 'PDF 변환용 Chromium/Chrome을 찾지 못했습니다. ' +
            '화면의 "인쇄" 버튼으로 브라우저 인쇄 → "PDF로 저장"을 사용하거나, ' +
            'CHROMIUM_PATH 환경변수에 Chrome 실행 파일 경로를 지정하세요.',
        });
      }

      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath });
      try {
        const page = await browser.newPage();
        await page.setContent(r.html, { waitUntil: 'load' });
        const pdf = await page.pdf({
          format: 'A4',
          margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
          printBackground: true,
        });
        attachment(res, `세금보고서-시나리오${r.scenarioId}-${fileStamp()}.pdf`, 'application/pdf');
        res.send(pdf);
      } finally {
        await browser.close();
      }
    } catch (err) {
      res.status(500).json({ error: `PDF 변환 실패: ${err.message}` });
    }
  });

  return app;
}

// 직접 실행 시 서버 기동
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`✔ 부동산 세금 상담 웹 서버: http://localhost:${port}`);
    console.log(`  PDF 변환용 Chromium: ${resolveChromium() ?? '(없음 — 브라우저 인쇄로 대체)'}`);
  });
}
