/**
 * 2단계 — AI 검증 모듈
 *
 * 계산 엔진(src/core, src/scenario)이 산출한 결과를 Claude에 전달해
 *   1) 세율·공제·중과 적용 등 계산 과정이 올바른지
 *   2) 최신 개정 세법(웹검색으로 확인)이 반영되어 있는지
 * 를 검증하고, 구조화된 판정(verdict)과 검증 보고서를 돌려준다.
 */

import {
  DEFAULT_MODEL, createClient, createMessageWithResume, extractText,
} from '../ai/client.js';

export const ENGINE_LAW_BASE_DATE = '2026-05-10'; // 계산 엔진이 반영한 세법 시행 기준일

const VERIFY_SYSTEM = `당신은 한국 부동산 세금(증여세·양도소득세·취득세·재산세·종합부동산세) 전문 검증자입니다.
결정적(deterministic) 계산 엔진이 산출한 세금 계산 결과를 검증하는 것이 임무입니다.

검증 항목:
1. 적용된 세율, 공제, 중과 여부가 결과에 첨부된 근거 법령(lawRef) 및 한국 세법과 일치하는지
2. 계산 엔진의 세법 기준일 이후 개정·시행된 세법이 있는지 웹검색으로 확인하고, 결과에 영향을 주는 변경이 있으면 지적
3. 명백한 계산 오류, 누락된 세목, 잘못된 가정

응답 형식:
- 먼저 마크다운으로 검증 내용을 서술하십시오.
- 반드시 응답의 맨 마지막에 아래 형식의 json 코드블록 하나로 판정을 요약하십시오.

\`\`\`json
{
  "verdict": "pass | warning | fail",
  "summary": "한 문장 요약",
  "issues": [
    { "severity": "info | warning | error", "description": "지적 사항" }
  ],
  "lawChanges": [
    { "description": "기준일 이후 확인된 세법 개정 내용과 영향" }
  ]
}
\`\`\`

verdict 기준: 오류가 없으면 "pass", 결과에 영향 가능성이 있는 개정·불확실성이 있으면 "warning", 명백한 오류가 있으면 "fail".`;

export function buildVerifyPrompt(scenarioResult, { lawBaseDate = ENGINE_LAW_BASE_DATE } = {}) {
  return [
    `계산 엔진의 세법 기준일: ${lawBaseDate} 시행분`,
    '',
    '다음은 계산 엔진이 산출한 부동산 세금 시나리오 결과입니다. 금액 단위는 원(KRW)입니다.',
    '계산 과정과 최신 세법 반영 여부를 검증해 주세요.',
    '',
    '```json',
    JSON.stringify(scenarioResult, null, 2),
    '```',
  ].join('\n');
}

/** 응답 텍스트 마지막의 ```json 블록에서 판정을 파싱. 실패 시 verdict "unknown" */
export function parseVerdict(text) {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (matches.length > 0) {
    try {
      const parsed = JSON.parse(matches[matches.length - 1][1]);
      return {
        verdict: parsed.verdict ?? 'unknown',
        summary: parsed.summary ?? '',
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        lawChanges: Array.isArray(parsed.lawChanges) ? parsed.lawChanges : [],
      };
    } catch {
      // fall through
    }
  }
  return { verdict: 'unknown', summary: '판정 블록을 파싱하지 못했습니다.', issues: [], lawChanges: [] };
}

/**
 * @param {object} scenarioResult  runScenarioN() 반환값
 * @param {object} [options]
 * @param {object} [options.client]     주입용 클라이언트 (기본: Anthropic SDK)
 * @param {string} [options.model]      기본 claude-opus-4-8
 * @param {boolean} [options.webSearch] 최신 세법 웹검색 사용 여부 (기본 true)
 * @returns {Promise<{verdict, summary, issues, lawChanges, reportText, usage}>}
 */
export async function verifyCalculation(scenarioResult, options = {}) {
  const {
    client = createClient(),
    model = DEFAULT_MODEL,
    maxTokens = 16000,
    webSearch = true,
    lawBaseDate = ENGINE_LAW_BASE_DATE,
  } = options;

  const request = {
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system: VERIFY_SYSTEM,
    messages: [{ role: 'user', content: buildVerifyPrompt(scenarioResult, { lawBaseDate }) }],
  };
  if (webSearch) {
    request.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }];
  }

  const response = await createMessageWithResume(client, request);
  const reportText = extractText(response);

  return { ...parseVerdict(reportText), reportText, usage: response.usage };
}
