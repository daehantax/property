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
import { verifyCalculation } from '../verify/index.js';
import { generateReport } from '../report/index.js';
import { adviseCase, renderAdvisory } from '../advisor/index.js';
import { createClient } from '../ai/client.js';

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

/** HTML → .docx 버퍼 */
async function htmlToDocxBuffer(html) {
  const { default: htmlToDocx } = await import('html-to-docx');
  const buf = await htmlToDocx(html, null, {
    orientation: 'portrait',
    margins: { top: 1000, bottom: 1000, left: 1100, right: 1100 },
    font: 'Malgun Gothic',
    table: { row: { cantSplit: true } },
  });
  return Buffer.from(buf);
}

/** HTML → A4 PDF 버퍼 (로컬 Chromium). 없으면 { unavailable } */
async function htmlToPdfBuffer(html) {
  const executablePath = resolveChromium();
  if (!executablePath) {
    return {
      unavailable: 'PDF 변환용 Chromium/Chrome을 찾지 못했습니다. ' +
        '화면의 "인쇄" 버튼으로 브라우저 인쇄 → "PDF로 저장"을 사용하거나, ' +
        'CHROMIUM_PATH 환경변수에 Chrome 실행 파일 경로를 지정하세요.',
    };
  }
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
      printBackground: true,
    });
    return { pdf };
  } finally {
    await browser.close();
  }
}

const VERDICT_BADGE = { pass: '✅ 통과', warning: '⚠️ 주의', fail: '❌ 오류', unknown: '❔ 판정불가' };
const JOB_TTL_MS = 2 * 60 * 60 * 1000; // 완료 후 2시간 보관

/**
 * @param {object} [options]
 * @param {object} [options.aiClient] AI 클라이언트 주입 (테스트용). 없으면
 *                 ANTHROPIC_API_KEY 환경변수로 실제 클라이언트를 만든다.
 */
export function createApp(options = {}) {
  const { aiClient = null } = options;
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const canUseAi = () => Boolean(aiClient || process.env.ANTHROPIC_API_KEY);

  // ── AI 비동기 작업 저장소 ─────────────────────────────
  const jobs = new Map();
  let jobSeq = 0;

  const purgeOldJobs = () => {
    const now = Date.now();
    for (const [id, j] of jobs) {
      if (j.finishedAt && now - j.finishedAt > JOB_TTL_MS) jobs.delete(id);
    }
  };

  const JOB_LABEL = { 'verified-report': 'AI 검증 정밀 보고서', advisory: '상담 심화 검토' };
  const JOB_FILE = { 'verified-report': 'AI정밀보고서', advisory: '심화검토' };

  async function executeJob(job, inputs) {
    try {
      const run = scenarios[`runScenario${job.scenarioId}`];
      const calculation = run(inputs);
      const client = aiClient ?? createClient();

      if (job.kind === 'verified-report') {
        job.progress = '1/2 — AI가 최신 세법을 웹검색하며 계산을 검증 중입니다 (약 2~4분)…';
        const verification = await verifyCalculation(calculation, { client });
        job.progress = '2/2 — AI가 고객용 정밀 보고서를 작성 중입니다 (약 1~2분)…';
        const { markdown } = await generateReport(calculation, verification, { client });
        const badge = VERDICT_BADGE[verification.verdict] ?? verification.verdict;
        job.markdown = [
          `> **AI 검증 판정: ${badge}** — ${verification.summary}`,
          '',
          markdown,
        ].join('\n');
      } else {
        job.progress = '민감도 분석 + AI 리스크·절세대안 검토 중입니다 (약 2~4분)…';
        const advisory = await adviseCase(job.scenarioId, inputs, { ai: true, client });
        job.markdown = renderAdvisory(advisory);
      }

      job.html = renderReportHtml(job.markdown, { title: JOB_LABEL[job.kind] });
      job.status = 'done';
      job.progress = '완료';
    } catch (err) {
      job.status = 'error';
      job.error = `${JOB_LABEL[job.kind]} 실패: ${err.message}`;
    } finally {
      job.finishedAt = Date.now();
    }
  }

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
      const buf = await htmlToDocxBuffer(r.html);
      attachment(res, `세금보고서-시나리오${r.scenarioId}-${fileStamp()}.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: `Word 변환 실패: ${err.message}` });
    }
  });

  app.post('/export/pdf', async (req, res) => {
    try {
      const r = makeReport(req.body);
      if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
      const out = await htmlToPdfBuffer(r.html);
      if (out.unavailable) return res.status(501).json({ error: out.unavailable });
      attachment(res, `세금보고서-시나리오${r.scenarioId}-${fileStamp()}.pdf`, 'application/pdf');
      res.send(out.pdf);
    } catch (err) {
      res.status(500).json({ error: `PDF 변환 실패: ${err.message}` });
    }
  });

  // ── AI 작업 (정밀 보고서 / 심화 검토) ─────────────────
  app.post('/api/jobs', (req, res) => {
    const kind = req.body?.kind;
    if (!JOB_LABEL[kind]) {
      return res.status(400).json({ error: `알 수 없는 작업 종류: ${kind}` });
    }
    if (!canUseAi()) {
      return res.status(503).json({
        error: '서버에 ANTHROPIC_API_KEY가 설정되어 있지 않아 AI 기능을 쓸 수 없습니다. ' +
          '서버 실행 전 환경변수를 설정하세요: ANTHROPIC_API_KEY=sk-ant-... npm run web',
      });
    }
    const scenarioId = Number(req.body?.scenarioId);
    const { inputs, errors } = coerceInputs(scenarioId, req.body?.inputs ?? {});
    if (!inputs) return res.status(400).json({ error: errors.join(', ') });
    if (errors.length) return res.status(400).json({ error: `입력 오류: ${errors.join(' / ')}` });

    purgeOldJobs();
    const id = `job-${++jobSeq}`;
    const job = {
      id, kind, scenarioId,
      status: 'running', progress: '준비 중…',
      createdAt: Date.now(), finishedAt: null,
      markdown: null, html: null, error: null,
    };
    jobs.set(id, job);
    executeJob(job, inputs); // 백그라운드 실행 (오류는 job.status에 기록)
    res.json({ jobId: id, label: JOB_LABEL[kind] });
  });

  app.get('/api/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: '작업을 찾을 수 없습니다 (만료되었을 수 있음)' });
    res.json({
      status: job.status,
      progress: job.progress,
      error: job.error,
      elapsedSec: Math.round(((job.finishedAt ?? Date.now()) - job.createdAt) / 1000),
      html: job.status === 'done' ? job.html : undefined,
    });
  });

  app.get('/api/jobs/:id/export/:format', async (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: '작업을 찾을 수 없습니다 (만료되었을 수 있음)' });
    if (job.status !== 'done') return res.status(409).json({ error: '작업이 아직 완료되지 않았습니다' });
    const name = `${JOB_FILE[job.kind]}-시나리오${job.scenarioId}-${fileStamp()}`;
    try {
      if (req.params.format === 'docx') {
        const buf = await htmlToDocxBuffer(job.html);
        attachment(res, `${name}.docx`,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        return res.send(buf);
      }
      if (req.params.format === 'pdf') {
        const out = await htmlToPdfBuffer(job.html);
        if (out.unavailable) return res.status(501).json({ error: out.unavailable });
        attachment(res, `${name}.pdf`, 'application/pdf');
        return res.send(out.pdf);
      }
      res.status(400).json({ error: `알 수 없는 형식: ${req.params.format}` });
    } catch (err) {
      res.status(500).json({ error: `변환 실패: ${err.message}` });
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
    console.log(`  AI 기능(정밀 보고서·심화 검토): ${process.env.ANTHROPIC_API_KEY ? '사용 가능' : '비활성 (ANTHROPIC_API_KEY 미설정)'}`);
  });
}
