/**
 * 3단계 요약 보고서 모듈 + 파이프라인 테스트 — mock 클라이언트, 네트워크 호출 없음
 */

import { describe, it, expect, vi } from 'vitest';
import { generateReport, buildBasicReport, buildReportPrompt, formatKRW } from '../../src/report/index.js';
import { runPipeline } from '../../src/pipeline.js';
import { runScenario1 } from '../../src/scenario/index.js';

const SAMPLE_INPUTS = {
  marketPrice: 1_500_000_000,
  officialPrice: 1_000_000_000,
  basePrice: 800_000_000,
  holdPeriod: 6,
  stayPeriod: 4,
  space: 85,
  heavy: 0,
  holdOfficialPrice: 800_000_000,
  holdPeriod2: 5,
  ownerAge: 55,
  childAge: 25,
};

const VERIFICATION = {
  verdict: 'pass',
  summary: '계산에 문제가 없습니다.',
  issues: [],
  lawChanges: [],
};

const mockClient = (textByCall) => {
  let call = 0;
  return {
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: 'text', text: textByCall[Math.min(call++, textByCall.length - 1)] }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      })),
    },
  };
};

describe('formatKRW', () => {
  it('천 단위 구분과 원 단위로 표기한다', () => {
    expect(formatKRW(1234567)).toBe('1,234,567원');
  });
});

describe('buildReportPrompt', () => {
  it('계산 결과와 검증 결과를 모두 포함한다', () => {
    const result = runScenario1(SAMPLE_INPUTS);
    const prompt = buildReportPrompt(result, VERIFICATION);
    expect(prompt).toContain('"scenarioId": 1');
    expect(prompt).toContain('"verdict": "pass"');
  });

  it('검증 결과가 없어도 동작한다', () => {
    const prompt = buildReportPrompt(runScenario1(SAMPLE_INPUTS));
    expect(prompt).not.toContain('AI 검증 결과');
  });
});

describe('generateReport', () => {
  it('mock 클라이언트로 마크다운 보고서를 반환한다', async () => {
    const client = mockClient(['# 요약 보고서\n\n내용']);
    const { markdown, usage } = await generateReport(runScenario1(SAMPLE_INPUTS), VERIFICATION, { client });
    expect(markdown).toContain('# 요약 보고서');
    expect(usage.output_tokens).toBe(50);
    expect(client.messages.create.mock.calls[0][0].model).toBe('claude-opus-4-8');
  });
});

describe('buildBasicReport', () => {
  it('API 없이 요약·법령·검증·면책 문구를 포함한 보고서를 만든다', () => {
    const result = runScenario1(SAMPLE_INPUTS);
    const md = buildBasicReport(result, { ...VERIFICATION, verdict: 'warning', issues: [{ severity: 'warning', description: '확인 필요' }] });
    expect(md).toContain('시나리오 1');
    expect(md).toContain('| case1Total |');
    expect(md).toContain('근거 법령');
    expect(md).toContain('주의');
    expect(md).toContain('[warning] 확인 필요');
    expect(md).toContain('참고용');
  });
});

describe('runPipeline', () => {
  it('ai: false면 계산 + 템플릿 보고서만 생성한다', async () => {
    const { calculation, verification, report } = await runPipeline(1, SAMPLE_INPUTS, { ai: false });
    expect(calculation.scenarioId).toBe(1);
    expect(verification).toBeNull();
    expect(report).toContain('부동산 세금 시나리오 요약');
  });

  it('mock 클라이언트로 3단계 전체를 수행한다', async () => {
    const verifyText = '검증\n```json\n{"verdict":"pass","summary":"이상 없음","issues":[],"lawChanges":[]}\n```';
    const client = mockClient([verifyText, '# 고객용 보고서']);

    const { calculation, verification, report } = await runPipeline(1, SAMPLE_INPUTS, { client });
    expect(calculation.scenarioId).toBe(1);
    expect(verification.verdict).toBe('pass');
    expect(report).toBe('# 고객용 보고서');
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  it('잘못된 시나리오 ID면 오류를 던진다', async () => {
    await expect(runPipeline(99, SAMPLE_INPUTS, { ai: false })).rejects.toThrow(/시나리오 ID/);
  });
});
