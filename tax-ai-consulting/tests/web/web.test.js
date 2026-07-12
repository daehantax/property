/**
 * 웹 모듈 테스트 — 폼 스펙 / 웹 보고서 / 서버 API (네트워크는 로컬 루프백만)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as scenarios from '../../src/scenario/index.js';
import {
  SCENARIO_FORMS, getForm, buildDefaults, coerceInputs,
} from '../../src/web/form-specs.js';
import { buildWebReport } from '../../src/web/web-report.js';
import { renderReportHtml } from '../../src/web/report-html.js';
import { createApp, resolveChromium } from '../../src/web/server.js';
import { defaultCompare } from '../../src/analysis/sensitivity.js';

describe('form-specs', () => {
  it('10개 시나리오 전부 폼 스펙이 있다', () => {
    expect(SCENARIO_FORMS).toHaveLength(10);
    for (let id = 1; id <= 10; id++) expect(getForm(id)).not.toBeNull();
  });

  it('기본값으로 모든 시나리오가 유한한 세액을 산출한다', () => {
    for (let id = 1; id <= 10; id++) {
      const inputs = buildDefaults(id);
      const result = scenarios[`runScenario${id}`](inputs);
      const { a, b } = defaultCompare(result);
      expect(Number.isFinite(a.total), `시나리오 ${id} 케이스1`).toBe(true);
      expect(Number.isFinite(b.total), `시나리오 ${id} 케이스2`).toBe(true);
    }
  });

  it('coerceInputs가 콤마·문자 섞인 금액을 숫자로 변환한다', () => {
    const { inputs, errors } = coerceInputs(2, {
      marketPrice: '1,800,000,000', loanPrice: '600000000원',
    });
    expect(errors).toEqual([]);
    expect(inputs.marketPrice).toBe(1_800_000_000);
    expect(inputs.loanPrice).toBe(600_000_000);
    expect(inputs.childAge).toBe(32); // 누락 필드는 기본값
  });

  it('coerceInputs가 %(0~100) 비율을 0~1로 정규화한다', () => {
    const { inputs } = coerceInputs(7, { ownerRate: 50, spouseRate: '50' });
    expect(inputs.ownerRate).toBe(0.5);
    expect(inputs.spouseRate).toBe(0.5);
  });

  it('음수·비숫자는 오류로 잡는다', () => {
    const { errors } = coerceInputs(1, { marketPrice: -1, holdPeriod: 'abc' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('buildWebReport', () => {
  it('시나리오 1 보고서에 비교표·계산내역·보유세·결론이 있다', () => {
    const calc = scenarios.runScenario1(buildDefaults(1));
    const md = buildWebReport(calc, { generatedAt: '2026-07-12' });
    expect(md).toContain('# 부동산 세금 상담 보고서');
    expect(md).toContain('## 1. 상담 개요');
    expect(md).toContain('## 2. 케이스별 세부담 비교');
    expect(md).toContain('### 세금 계산 내역');
    expect(md).toContain('## 3. 보유세');
    expect(md).toContain('### 보유세 계산 내역');
    expect(md).toContain('## 4. 결론');
    expect(md).toContain('유리');
    expect(md).toContain('세무 전문가 확인');
  });

  it('모든 시나리오가 기본값으로 보고서를 만든다', () => {
    for (let id = 1; id <= 10; id++) {
      const calc = scenarios[`runScenario${id}`](buildDefaults(id));
      const md = buildWebReport(calc, { generatedAt: '2026-07-12' });
      expect(md, `시나리오 ${id}`).toContain('케이스별 세부담 비교');
      expect(md, `시나리오 ${id}`).not.toContain('NaN');
    }
  });
});

describe('renderReportHtml', () => {
  it('마크다운을 인쇄용 HTML 문서로 감싼다', () => {
    const html = renderReportHtml('# 제목\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('lang="ko"');
    expect(html).toContain('@page');
    expect(html).toContain('<table>');
  });
});

describe('server API', () => {
  let server; let base;

  beforeAll(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('GET /api/scenarios — 10개 시나리오와 필드 스펙', async () => {
    const res = await fetch(`${base}/api/scenarios`);
    const data = await res.json();
    expect(data).toHaveLength(10);
    expect(data[0].fields.length).toBeGreaterThan(5);
    expect(data[0].defaults.marketPrice).toBeGreaterThan(0);
  });

  it('POST /api/report — 보고서 HTML·마크다운 반환', async () => {
    const res = await fetch(`${base}/api/report`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 1, inputs: buildDefaults(1) }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.html).toContain('세부담 비교');
    expect(data.markdown).toContain('## 4. 결론');
  });

  it('POST /api/report — 잘못된 시나리오는 400', async () => {
    const res = await fetch(`${base}/api/report`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 99, inputs: {} }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /export/docx — .docx(ZIP) 바이너리 다운로드', async () => {
    const res = await fetch(`${base}/export/docx`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 1, inputs: buildDefaults(1) }),
    });
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toContain('wordprocessingml');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.subarray(0, 2).toString()).toBe('PK'); // ZIP 시그니처
  }, 30000);

  it.skipIf(!resolveChromium())('POST /export/pdf — PDF 바이너리 다운로드 (Chromium 있을 때)', async () => {
    const res = await fetch(`${base}/export/pdf`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 1, inputs: buildDefaults(1) }),
    });
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toContain('pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 60000);
});
