/**
 * 절세 대안 생성기 / 리스크 스캐너 테스트 — mock 클라이언트 주입, 네트워크 없음
 */

import { describe, it, expect, vi } from 'vitest';
import {
  scanRisks, parseRisks, renderRisks, buildRiskPrompt,
} from '../../src/advisor/risk-scan.js';
import {
  generateAlternatives, parseIdeas, applyPatch, simulateIdeas, renderAlternatives,
} from '../../src/advisor/alternatives.js';
import { runScenario2 } from '../../src/scenario/index.js';

const INPUTS = {
  marketPrice: 1_800_000_000, officialPrice: 1_260_000_000, basePrice: 900_000_000,
  loanPrice: 0, holdPeriod: 10, stayPeriod: 5, space: 85, heavy: 1,
  holdOfficialPrice: 1_000_000_000, holdPeriod2: 8, ownerAge: 62, childAge: 32,
};

const mockClient = (text) => ({
  messages: {
    create: vi.fn(async () => ({
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    })),
  },
});

describe('risk-scan', () => {
  const RISK_TEXT = `검토 의견입니다.

\`\`\`json
{
  "summary": "증여 후 단기 양도 리스크가 큼",
  "risks": [
    { "severity": "low", "title": "자금출처", "description": "d", "lawRef": "상증세법 §45", "checkpoint": "c" },
    { "severity": "high", "title": "이월과세", "description": "d2", "lawRef": "소득세법 §97의2", "checkpoint": "c2" }
  ]
}
\`\`\``;

  it('parseRisks가 마지막 json 블록을 파싱한다', () => {
    const r = parseRisks(RISK_TEXT);
    expect(r.risks).toHaveLength(2);
    expect(r.summary).toContain('단기 양도');
  });

  it('scanRisks가 severity 순으로 정렬한다 (high 먼저)', async () => {
    const client = mockClient(RISK_TEXT);
    const scan = await scanRisks(runScenario2(INPUTS), { client });
    expect(scan.risks[0].severity).toBe('high');
    expect(scan.risks[1].severity).toBe('low');
    expect(scan.usage.output_tokens).toBe(50);
    // 웹검색 도구 기본 포함
    expect(client.messages.create.mock.calls[0][0].tools[0].type).toBe('web_search_20260209');
  });

  it('webSearch:false면 tools 없음', async () => {
    const client = mockClient(RISK_TEXT);
    await scanRisks(runScenario2(INPUTS), { client, webSearch: false });
    expect(client.messages.create.mock.calls[0][0].tools).toBeUndefined();
  });

  it('renderRisks가 심각도 라벨을 붙인다', () => {
    const md = renderRisks(parseRisks(RISK_TEXT));
    expect(md).toContain('이월과세');
    expect(md).toContain('확인할 것');
  });

  it('리스크가 없으면 안내 문구', () => {
    expect(renderRisks({ risks: [] })).toContain('세무 리스크가 없습니다');
  });

  it('buildRiskPrompt에 기준일과 결과 포함', () => {
    const p = buildRiskPrompt(runScenario2(INPUTS));
    expect(p).toContain('2026-05-10');
    expect(p).toContain('scenarioId');
  });
});

describe('alternatives', () => {
  it('applyPatch가 dot-path를 반영하고 원본을 보존한다', () => {
    const base = { a: 1, spouse: { age: 50 } };
    const patched = applyPatch(base, { a: 2, 'spouse.age': 60 });
    expect(patched).toEqual({ a: 2, spouse: { age: 60 } });
    expect(base).toEqual({ a: 1, spouse: { age: 50 } }); // 불변
  });

  it('parseIdeas가 ideas 배열을 파싱한다', () => {
    const text = '```json\n{"summary":"s","ideas":[{"title":"t","inputPatch":{"loanPrice":600000000}}]}\n```';
    const p = parseIdeas(text);
    expect(p.ideas).toHaveLength(1);
    expect(p.ideas[0].inputPatch.loanPrice).toBe(600000000);
  });

  it('simulateIdeas가 inputPatch를 엔진으로 재계산해 절감액을 붙인다', () => {
    const ideas = [
      { title: '대출 6억 승계', inputPatch: { loanPrice: 600_000_000 } },
      { title: '개념 제안', inputPatch: {} },
    ];
    const sim = simulateIdeas(2, INPUTS, ideas);
    expect(sim[0].simulated).not.toBeNull();
    expect(typeof sim[0].simulated.bestTotal).toBe('number');
    // 부담부증여로 대출 6억을 승계하면 기준(대출0)보다 총액이 줄어든다
    expect(sim[0].simulated.savingVsBase).toBeGreaterThan(0);
    expect(sim[1].simulated).toBeNull();
  });

  it('잘못된 inputPatch는 simulateError로 잡는다', () => {
    const sim = simulateIdeas(2, INPUTS, [{ title: 'x', inputPatch: { marketPrice: 'not-a-number' } }]);
    // 계산은 NaN을 만들 수 있으나 throw하지 않으면 simulated가 채워짐 — 최소한 크래시하지 않음
    expect(sim).toHaveLength(1);
    expect(sim[0].simulated).toBeNull(); // NaN 결과는 simulateError로 걸러짐
  });

  it('altScenarioId로 다른 시나리오 엔진으로 재계산한다 (시나리오1 → 2 부담부증여)', () => {
    // 시나리오 1(증여vs양도) 케이스에서 부담부증여 대안 → 시나리오 2로 매핑
    const scenario1Inputs = { ...INPUTS, ownCount: 2, isAdj: 1 };
    const sim = simulateIdeas(1, scenario1Inputs, [
      { title: '부담부증여 전환', altScenarioId: 2, inputPatch: { loanPrice: 600_000_000 } },
    ]);
    expect(sim[0].simulated).not.toBeNull();
    expect(sim[0].simulated.scenarioId).toBe(2);
    expect(sim[0].simulated.scenarioTitle).toContain('부담부증여');
    expect(Number.isFinite(sim[0].simulated.bestTotal)).toBe(true);
  });

  it('존재하지 않는 altScenarioId는 simulateError', () => {
    const sim = simulateIdeas(2, INPUTS, [{ title: 'x', altScenarioId: 99, inputPatch: { loanPrice: 1 } }]);
    expect(sim[0].simulated).toBeNull();
    expect(sim[0].simulateError).toContain('99');
  });

  it('renderAlternatives가 타 시나리오 재계산을 표기한다', () => {
    const alt = {
      summary: 's',
      ideas: [{
        title: '부담부증여',
        simulated: { scenarioId: 2, scenarioTitle: '자녀에게 일반증여할까? 부담부증여할까?', bestTotal: 500_000_000, bestLabel: '부담부증여', savingVsBase: 70_000_000 },
      }],
    };
    const md = renderAlternatives(alt);
    expect(md).toContain('시나리오 2');
    expect(md).toContain('절감');
  });

  it('generateAlternatives가 아이디어를 생성하고 계산 가능한 것을 검증한다', async () => {
    const text = '```json\n{"summary":"대안","ideas":[{"title":"대출 승계","rationale":"r","inputPatch":{"loanPrice":900000000}}]}\n```';
    const client = mockClient(text);
    const alt = await generateAlternatives(runScenario2(INPUTS), INPUTS, { client });
    expect(alt.ideas[0].simulated.savingVsBase).toBeGreaterThan(0);
    // 대안 생성은 웹검색 없이 동작
    expect(client.messages.create.mock.calls[0][0].tools).toBeUndefined();
  });

  it('renderAlternatives가 검증된 숫자를 표기한다', () => {
    const alt = {
      summary: 's',
      ideas: [{ title: 't', rationale: 'r', simulated: { bestTotal: 500_000_000, bestLabel: '부담부증여', savingVsBase: 100_000_000 } }],
    };
    const md = renderAlternatives(alt);
    expect(md).toContain('엔진 재계산');
    expect(md).toContain('절감');
  });
});
