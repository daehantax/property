/**
 * 절세 대안 생성기 (장치 1)
 *
 * 고정된 케이스1/케이스2 비교를 넘어, Claude가 해당 상황에서 시도해볼 만한
 * 추가 절세 대안을 브레인스토밍한다. 여기서 핵심은 "AI가 지어낸 숫자"를 믿지
 * 않는다는 점이다 — AI가 제안한 대안이 같은 시나리오의 입력값 조정으로 표현
 * 가능하면, 그 조정을 실제 계산 엔진에 통과시켜 진짜 세액을 붙인다.
 *
 * 흐름: 결과+입력 제시 → AI가 아이디어 목록 생성(일부는 inputPatch 포함)
 *      → inputPatch가 있는 아이디어는 엔진으로 재계산 → 검증된 숫자 부착.
 *
 * 타 시나리오 매핑: 현재 시나리오의 입력 조정만으로 표현할 수 없는 대안
 * (예: "증여 vs 양도" 케이스에서 부담부증여 대안)은 altScenarioId 로
 * 다른 시나리오를 지정해 그 엔진으로 재계산할 수 있다.
 */

import {
  DEFAULT_MODEL, createClient, createMessageWithResume, extractText,
} from '../ai/client.js';
import { ENGINE_LAW_BASE_DATE } from '../verify/index.js';
import * as scenarios from '../scenario/index.js';
import { defaultCompare } from '../analysis/sensitivity.js';

/**
 * 시나리오 카탈로그 — AI가 altScenarioId 로 다른 시나리오를 지정할 때 참조.
 * extraInputs: 그 시나리오가 추가로 요구하는 입력 필드 (없으면 inputPatch로 채워야 함)
 */
export const SCENARIO_CATALOG = [
  { id: 1, title: '2주택자: 자녀에게 증여 vs 타인에게 양도', extraInputs: 'childAge, ownCount, isAdj' },
  { id: 2, title: '2주택자: 자녀에게 일반증여 vs 부담부증여', extraInputs: 'loanPrice(승계 채무), childAge' },
  { id: 3, title: '2주택자: 자녀 1명에게 증여 vs 여러 명에게 분산증여', extraInputs: 'child/childSpouse/grand1~3 = { price, age }' },
  { id: 4, title: '2주택자: 자녀 1명 부담부증여 vs 여러 명 부담부증여', extraInputs: 'loanPrice, child/childSpouse/grand1~3 = { price, age }' },
  { id: 5, title: '2주택자: 배우자에게 일반증여 vs 부담부증여', extraInputs: 'loanPrice, spouseAge' },
  { id: 6, title: '1주택자: 일부 지분 배우자 일반증여 vs 부담부증여', extraInputs: 'partRate(지분율), loanPrice, spouseAge' },
  { id: 7, title: '공동명의 1주택: 배우자 단독명의 전환 (일반 vs 부담부)', extraInputs: 'ownerRate, spouseRate, spouseHoldPeriod, loanPrice' },
  { id: 8, title: '2주택자: 배우자에게 증여 vs 타인에게 양도', extraInputs: 'spouseAge, ownCount, isAdj' },
  { id: 9, title: '2주택자: 배우자에게만 증여 vs 배우자+자녀 분산증여', extraInputs: 'spouse/child1~4 = { price, age }' },
  { id: 10, title: '2주택자: 배우자에게만 부담부증여 vs 여러 명 부담부증여', extraInputs: 'loanPrice, spouse/childSpouse/child2~4 = { price, age }' },
];

const ALT_SYSTEM = `당신은 한국 부동산 절세 전략을 설계하는 세무사입니다.
제시된 케이스(계산 엔진 결과 + 입력값)를 보고, 고객이 고려해볼 만한 추가 절세
대안을 창의적이되 현실적으로 제안합니다. 이미 비교 중인 두 선택지는 반복하지 마십시오.

대안 아이디어 예시(케이스에 맞는 것만):
- 부담부증여 채무비율 조정, 증여 시점 분산(연도별), 수증자 분산
- 배우자 이월과세 기간 경과 후 양도, 감정평가액 과세표준 선택
- 취득·양도 시점(조정지역 지정/해제, 중과 유예) 조절, 일시적 2주택 활용
- 공동명의 전환, 임대주택 등록 등

각 아이디어를 계산 엔진으로 검증할 수 있도록 다음 중 하나로 표현하십시오.
1) 같은 시나리오의 입력값 조정으로 표현 가능 → inputPatch만 지정
2) 다른 시나리오로 표현 가능(예: 증여vs양도 케이스의 부담부증여 대안은 시나리오 2)
   → altScenarioId 로 시나리오 번호를 지정하고, 그 시나리오가 요구하는 추가 입력을
     inputPatch 로 채우십시오 (아래 시나리오 카탈로그의 extraInputs 참고).
3) 엔진으로 표현 불가(감정평가·임대등록·시점 조절 등) → inputPatch 없이 개념만 제시

inputPatch의 키는 입력 필드명이며 중첩은 "spouse.age"처럼 점 표기, 값은 숫자만
사용하십시오. 시스템이 실제 계산 엔진으로 세액을 재계산해 검증하므로,
근거 없는 수치를 직접 쓰지 마십시오(숫자는 엔진이 채웁니다).

응답 형식:
- 먼저 마크다운으로 핵심 대안을 간단히 서술하십시오.
- 반드시 응답 맨 마지막에 아래 형식의 json 코드블록 하나로 요약하십시오.

\`\`\`json
{
  "summary": "한 문장 총평",
  "ideas": [
    {
      "title": "대안 이름",
      "rationale": "왜 절세가 되는지 / 언제 유효한지",
      "caveat": "주의점·전제(없으면 빈 문자열)",
      "altScenarioId": 2,
      "inputPatch": { "필드명": 값 }
    }
  ]
}
\`\`\`

altScenarioId는 다른 시나리오로 계산할 때만 지정하십시오(같은 시나리오면 생략).`;

export function buildAlternativesPrompt(scenarioResult, baseInputs, { lawBaseDate = ENGINE_LAW_BASE_DATE } = {}) {
  return [
    `세법 기준일: ${lawBaseDate} 시행분`,
    `시나리오 ID: ${scenarioResult.scenarioId} — ${scenarioResult.title}`,
    '',
    '## 시나리오 카탈로그 (altScenarioId 지정용)',
    ...SCENARIO_CATALOG.map((s) => `- ${s.id}: ${s.title} (추가 입력: ${s.extraInputs})`),
    '',
    '## 현재 케이스 입력값 (inputPatch 의 기준)',
    '```json',
    JSON.stringify(baseInputs, null, 2),
    '```',
    '',
    '## 계산 엔진 결과',
    '```json',
    JSON.stringify(scenarioResult.summary ?? scenarioResult, null, 2),
    '```',
    '',
    '위 상황에서 추가로 고려할 만한 절세 대안을 제안해 주세요.',
  ].join('\n');
}

/** dot-path 키를 포함한 patch를 baseInputs에 적용한 새 객체 반환 (원본 불변) */
export function applyPatch(baseInputs, patch) {
  const clone = structuredClone(baseInputs);
  for (const [rawKey, value] of Object.entries(patch ?? {})) {
    const keys = String(rawKey).split('.');
    let node = clone;
    for (let i = 0; i < keys.length - 1; i++) {
      if (node[keys[i]] == null || typeof node[keys[i]] !== 'object') node[keys[i]] = {};
      node = node[keys[i]];
    }
    node[keys[keys.length - 1]] = value;
  }
  return clone;
}

/** 응답 마지막 ```json 블록에서 아이디어 목록 파싱 */
export function parseIdeas(text) {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (matches.length > 0) {
    try {
      const parsed = JSON.parse(matches[matches.length - 1][1]);
      return {
        summary: parsed.summary ?? '',
        ideas: Array.isArray(parsed.ideas) ? parsed.ideas : [],
      };
    } catch {
      // fall through
    }
  }
  return { summary: '대안 요약 블록을 파싱하지 못했습니다.', ideas: [] };
}

/**
 * inputPatch가 있는 아이디어를 실제 엔진으로 재계산해 세액을 부착한다.
 * 기준 케이스의 총액(더 유리한 쪽)과 비교해 절감액을 계산한다.
 *
 * altScenarioId 가 있으면 그 시나리오의 엔진으로 재계산한다 — 현재 시나리오의
 * 입력 조정만으로 표현할 수 없는 대안(예: 증여vs양도 케이스의 부담부증여)을
 * 다른 시나리오로 매핑해 검증하기 위함이다.
 */
export function simulateIdeas(scenarioId, baseInputs, ideas) {
  const run = scenarios[`runScenario${scenarioId}`];
  const baseResult = run(baseInputs);
  const baseCmp = defaultCompare(baseResult);
  const baseBest = Math.min(baseCmp.a.total, baseCmp.b.total);

  return ideas.map((idea) => {
    const patch = idea.inputPatch;
    const altId = Number.isInteger(idea.altScenarioId) ? idea.altScenarioId : null;
    const hasPatch = patch && Object.keys(patch).length > 0;
    if (!hasPatch && !altId) return { ...idea, simulated: null };
    try {
      const targetId = altId ?? scenarioId;
      const targetRun = scenarios[`runScenario${targetId}`];
      if (typeof targetRun !== 'function') {
        return { ...idea, simulated: null, simulateError: `알 수 없는 시나리오 ID: ${idea.altScenarioId}` };
      }
      const patched = applyPatch(baseInputs, patch ?? {});
      const result = targetRun(patched);
      const cmp = defaultCompare(result);
      const best = Math.min(cmp.a.total, cmp.b.total);
      if (!Number.isFinite(best)) {
        return { ...idea, simulated: null, simulateError: '재계산 결과가 유효한 숫자가 아닙니다 (입력 누락 가능성)' };
      }
      return {
        ...idea,
        simulated: {
          scenarioId: targetId,
          scenarioTitle: targetId === scenarioId ? null : result.title,
          bestTotal: best,
          bestLabel: cmp.a.total <= cmp.b.total ? cmp.a.label : cmp.b.label,
          savingVsBase: baseBest - best, // >0 이면 기준 최선보다 절감
          options: { a: cmp.a, b: cmp.b },
        },
      };
    } catch (err) {
      return { ...idea, simulated: null, simulateError: err.message };
    }
  });
}

/**
 * 케이스에 대한 절세 대안을 생성하고, 계산 가능한 것은 엔진으로 검증한다.
 *
 * @param {object} scenarioResult runScenarioN() 반환값
 * @param {object} baseInputs     해당 시나리오의 입력값 (inputPatch 적용 대상)
 * @param {object} [options] { client, model, maxTokens, lawBaseDate }
 * @returns {Promise<{summary, ideas, reportText, usage}>}
 */
export async function generateAlternatives(scenarioResult, baseInputs, options = {}) {
  const {
    client = createClient(),
    model = DEFAULT_MODEL,
    maxTokens = 16000,
    lawBaseDate = ENGINE_LAW_BASE_DATE,
  } = options;

  const request = {
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: ALT_SYSTEM,
    messages: [{ role: 'user', content: buildAlternativesPrompt(scenarioResult, baseInputs, { lawBaseDate }) }],
  };

  const response = await createMessageWithResume(client, request);
  const reportText = extractText(response);
  const { summary, ideas } = parseIdeas(reportText);
  const simulated = simulateIdeas(scenarioResult.scenarioId, baseInputs, ideas);

  return { summary, ideas: simulated, reportText, usage: response.usage };
}

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/** 대안 목록을 마크다운으로 렌더링 (검증된 숫자는 명시) */
export function renderAlternatives(alt, { heading = '## 추가 절세 대안' } = {}) {
  if (!alt || !Array.isArray(alt.ideas) || alt.ideas.length === 0) {
    return `${heading}\n\n제안된 추가 대안이 없습니다.`;
  }
  const out = [heading, ''];
  if (alt.summary) out.push(`_${alt.summary}_`, '');
  alt.ideas.forEach((idea, i) => {
    out.push(`### ${i + 1}. ${idea.title}`);
    if (idea.rationale) out.push(idea.rationale);
    if (idea.simulated) {
      const s = idea.simulated;
      const dir = s.savingVsBase > 0
        ? `기준 대비 약 **${won(s.savingVsBase)} 절감**`
        : s.savingVsBase < 0
          ? `기준 대비 약 ${won(-s.savingVsBase)} 증가`
          : '기준과 동일';
      const via = s.scenarioTitle ? ` _(시나리오 ${s.scenarioId} 「${s.scenarioTitle}」로 재계산)_` : '';
      out.push('', `- **엔진 재계산**: 「${s.bestLabel}」 기준 총 ${won(s.bestTotal)} — ${dir}${via}`);
    } else if (idea.simulateError) {
      out.push('', `- (엔진 재계산 실패: ${idea.simulateError})`);
    } else if (idea.inputPatch && Object.keys(idea.inputPatch).length > 0) {
      out.push('', '- (엔진 재계산 실패 — 입력 조정을 확인하세요)');
    } else {
      out.push('', '- (개념 제안 — 별도 검토 필요, 자동 계산 대상 아님)');
    }
    if (idea.caveat) out.push(`- **주의**: ${idea.caveat}`);
    out.push('');
  });
  return out.join('\n');
}
