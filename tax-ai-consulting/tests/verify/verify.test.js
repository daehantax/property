/**
 * 2단계 AI 검증 모듈 테스트 — mock 클라이언트 주입, 네트워크 호출 없음
 */

import { describe, it, expect, vi } from 'vitest';
import { verifyCalculation, parseVerdict, buildVerifyPrompt } from '../../src/verify/index.js';
import { createMessageWithResume } from '../../src/ai/client.js';
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

const VERDICT_JSON = `검증 결과입니다.

\`\`\`json
{
  "verdict": "warning",
  "summary": "전반적으로 정확하나 개정 사항 확인 필요",
  "issues": [{ "severity": "warning", "description": "종부세 공정시장가액비율 확인 필요" }],
  "lawChanges": [{ "description": "2026.7월 시행령 개정 예정" }]
}
\`\`\``;

const mockClient = (text, stopReason = 'end_turn') => ({
  messages: {
    create: vi.fn(async () => ({
      content: [{ type: 'text', text }],
      stop_reason: stopReason,
      usage: { input_tokens: 100, output_tokens: 50 },
    })),
  },
});

describe('parseVerdict', () => {
  it('마지막 json 블록에서 판정을 파싱한다', () => {
    const v = parseVerdict(VERDICT_JSON);
    expect(v.verdict).toBe('warning');
    expect(v.issues).toHaveLength(1);
    expect(v.lawChanges).toHaveLength(1);
  });

  it('json 블록이 없으면 unknown을 반환한다', () => {
    const v = parseVerdict('그냥 텍스트');
    expect(v.verdict).toBe('unknown');
    expect(v.issues).toEqual([]);
  });

  it('json 블록이 깨져 있으면 unknown을 반환한다', () => {
    const v = parseVerdict('```json\n{broken\n```');
    expect(v.verdict).toBe('unknown');
  });

  it('json 블록이 여러 개면 마지막 것을 사용한다', () => {
    const text = '```json\n{"verdict":"fail"}\n```\n...\n```json\n{"verdict":"pass"}\n```';
    expect(parseVerdict(text).verdict).toBe('pass');
  });
});

describe('buildVerifyPrompt', () => {
  it('기준일과 계산 결과 JSON을 포함한다', () => {
    const result = runScenario1(SAMPLE_INPUTS);
    const prompt = buildVerifyPrompt(result);
    expect(prompt).toContain('2026-05-10');
    expect(prompt).toContain('"scenarioId": 1');
  });
});

describe('verifyCalculation', () => {
  it('mock 클라이언트로 검증 결과를 반환한다', async () => {
    const client = mockClient(VERDICT_JSON);
    const result = runScenario1(SAMPLE_INPUTS);
    const v = await verifyCalculation(result, { client });

    expect(v.verdict).toBe('warning');
    expect(v.reportText).toContain('검증 결과');
    expect(v.usage.output_tokens).toBe(50);

    const request = client.messages.create.mock.calls[0][0];
    expect(request.model).toBe('claude-opus-4-8');
    expect(request.thinking).toEqual({ type: 'adaptive' });
    expect(request.tools[0].type).toBe('web_search_20260209');
  });

  it('webSearch: false면 tools를 넣지 않는다', async () => {
    const client = mockClient(VERDICT_JSON);
    await verifyCalculation(runScenario1(SAMPLE_INPUTS), { client, webSearch: false });
    expect(client.messages.create.mock.calls[0][0].tools).toBeUndefined();
  });
});

describe('createMessageWithResume', () => {
  it('pause_turn이면 assistant 턴을 붙여 재요청한다', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '중간' }], stop_reason: 'pause_turn' })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '완료' }], stop_reason: 'end_turn' });
    const client = { messages: { create } };

    const res = await createMessageWithResume(client, {
      model: 'claude-opus-4-8', max_tokens: 100,
      messages: [{ role: 'user', content: '질문' }],
    });

    expect(res.stop_reason).toBe('end_turn');
    expect(create).toHaveBeenCalledTimes(2);
    const secondMessages = create.mock.calls[1][0].messages;
    expect(secondMessages).toHaveLength(2);
    expect(secondMessages[1].role).toBe('assistant');
  });

  it('refusal이면 오류를 던진다', async () => {
    const client = mockClient('', 'refusal');
    await expect(createMessageWithResume(client, {
      model: 'claude-opus-4-8', max_tokens: 100, messages: [{ role: 'user', content: 'x' }],
    })).rejects.toThrow(/refusal/);
  });
});
