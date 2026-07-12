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
 */

import {
  DEFAULT_MODEL, createClient, createMessageWithResume, extractText,
} from '../ai/client.js';
import { ENGINE_LAW_BASE_DATE } from '../verify/index.js';
import * as scenarios from '../scenario/index.js';
import { defaultCompare } from '../analysis/sensitivity.js';

const ALT_SYSTEM = `당신은 한국 부동산 절세 전략을 설계하는 세무사입니다.
제시된 케이스(계산 엔진 결과 + 입력값)를 보고, 고객이 고려해볼 만한 추가 절세
대안을 창의적이되 현실적으로 제안합니다. 이미 비교 중인 두 선택지는 반복하지 마십시오.

대안 아이디어 예시(케이스에 맞는 것만):
- 부담부증여 채무비율 조정, 증여 시점 분산(연도별), 수증자 분산
- 배우자 이월과세 기간 경과 후 양도, 감정평가액 과세표준 선택
- 취득·양도 시점(조정지역 지정/해제, 중과 유예) 조절, 일시적 2주택 활용
- 공동명의 전환, 임대주택 등록 등

각 아이디어에 대해, "같은 상황에서 이 입력값만 바꾼 것"으로 표현할 수 있으면
inputPatch로 나타내십시오. inputPatch의 키는 제시된 입력값(inputs)에 이미 존재하는
필드명이어야 하며(중첩은 "spouse.age" 같은 점 표기), 값은 숫자/문자열입니다.
그러면 시스템이 그 값을 실제 계산 엔진에 넣어 세액을 재계산해 검증합니다.
입력값 조정으로 표현할 수 없는 아이디어(예: 감정평가, 임대등록)는 inputPatch 없이 개념만 제시하십시오.

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
      "inputPatch": { "필드명": 값 }
    }
  ]
}
\`\`\`

inputPatch가 없으면 생략하거나 빈 객체로 두십시오. 근거 없는 수치는 쓰지 마십시오(숫자는 엔진이 채웁니다).`;

export function buildAlternativesPrompt(scenarioResult, baseInputs, { lawBaseDate = ENGINE_LAW_BASE_DATE } = {}) {
  return [
    `세법 기준일: ${lawBaseDate} 시행분`,
    `시나리오 ID: ${scenarioResult.scenarioId} — ${scenarioResult.title}`,
    '',
    '## 현재 케이스 입력값 (inputPatch의 키는 여기 존재하는 필드명이어야 함)',
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
 */
export function simulateIdeas(scenarioId, baseInputs, ideas) {
  const run = scenarios[`runScenario${scenarioId}`];
  const baseResult = run(baseInputs);
  const baseCmp = defaultCompare(baseResult);
  const baseBest = Math.min(baseCmp.a.total, baseCmp.b.total);

  return ideas.map((idea) => {
    const patch = idea.inputPatch;
    if (!patch || Object.keys(patch).length === 0) return { ...idea, simulated: null };
    try {
      const patched = applyPatch(baseInputs, patch);
      const result = run(patched);
      const cmp = defaultCompare(result);
      const best = Math.min(cmp.a.total, cmp.b.total);
      return {
        ...idea,
        simulated: {
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
      out.push('', `- **엔진 재계산**: 「${s.bestLabel}」 기준 총 ${won(s.bestTotal)} — ${dir}`);
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
