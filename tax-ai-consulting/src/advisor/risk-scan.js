/**
 * 리스크·함정 스캐너 (장치 2)
 *
 * 계산 엔진의 결과가 "숫자상 맞다"는 것과, 그 거래가 "세무상 안전한가"는
 * 다른 문제다. 이 모듈은 Claude에게 과세관청·검토 세무사의 입장에서 케이스를
 * 공격적으로 검토하게 하여, 계산기에는 드러나지 않는 세무 리스크·함정을
 * 체크리스트로 뽑아낸다.
 *
 * 검토 관점(예): 이월과세, 부당행위계산부인, 저가·고가양도, 자금출처 소명,
 *   취득세 중과 함정, 1세대1주택 비과세 요건, 부담부증여 채무의 실질 인수,
 *   세대 판정(동일세대/별도세대), 증여 후 단기 양도 등.
 */

import {
  DEFAULT_MODEL, createClient, createMessageWithResume, extractText,
} from '../ai/client.js';
import { ENGINE_LAW_BASE_DATE } from '../verify/index.js';

const RISK_SYSTEM = `당신은 한국 부동산 세무 리스크를 검토하는 베테랑 세무사입니다.
계산 엔진이 산출한 세금 결과는 "산식은 맞다"고 가정하고, 그 거래 구조 자체에
숨은 세무 리스크·함정·사후 추징 가능성을 과세관청의 시각에서 공격적으로 찾아냅니다.

반드시 점검할 관점(해당하는 것만):
- 이월과세: 배우자·직계존비속에게 증여 후 일정기간(현행 10년) 내 양도 시 취득가액 이월 → 양도세 급증
- 부당행위계산부인: 특수관계자 간 저가·고가 거래, 우회 증여
- 저가양도/고가양도: 시가 대비 30%·3억 기준, 증여의제
- 부담부증여: 승계채무의 실질 인수(실제 상환 능력·이자 부담) 여부, 채무 미인수 시 전액 증여 재계산 위험
- 자금출처 소명: 수증자·매수자의 자금 능력, 증여추정
- 취득세: 중과 판정(주택 수·조정지역·공시가격 기준일), 일시적 2주택 처분기한
- 1세대1주택 비과세·장기보유특별공제: 보유·거주요건, 세대 판정
- 증여재산 합산(10년 내 동일인 증여 합산), 신고·납부기한

응답 형식:
- 먼저 마크다운으로 핵심 리스크를 짚은 검토 의견을 서술하십시오.
- 반드시 응답 맨 마지막에 아래 형식의 json 코드블록 하나로 리스크 목록을 요약하십시오.

\`\`\`json
{
  "summary": "한 문장 총평",
  "risks": [
    {
      "severity": "high | medium | low",
      "title": "리스크 이름",
      "description": "왜 문제인지, 어떤 상황에서 현실화되는지",
      "lawRef": "근거 법령/조문(모르면 빈 문자열)",
      "checkpoint": "세무사가 이 케이스에서 실제로 확인/질문해야 할 것"
    }
  ]
}
\`\`\`

원칙:
- 계산 산식의 원 단위 재현이 아니라 "거래 구조의 위험"에 집중하십시오.
- 해당 케이스 입력값(나이·관계·보유기간·대출·조정지역 등)에 근거해 구체적으로 지적하십시오. 일반론 나열은 피하십시오.
- 리스크가 낮으면 낮다고 정직하게 쓰고, 억지로 만들지 마십시오.`;

export function buildRiskPrompt(scenarioResult, { lawBaseDate = ENGINE_LAW_BASE_DATE } = {}) {
  return [
    `세법 기준일: ${lawBaseDate} 시행분`,
    '',
    '아래는 계산 엔진이 산출한 부동산 세금 시나리오 결과입니다(금액 단위: 원).',
    '이 거래 구조에 숨은 세무 리스크·함정을 과세관청 시각에서 검토해 주세요.',
    '',
    '```json',
    JSON.stringify(scenarioResult, null, 2),
    '```',
  ].join('\n');
}

/** 응답 마지막 ```json 블록에서 리스크 목록을 파싱. 실패 시 빈 목록 */
export function parseRisks(text) {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (matches.length > 0) {
    try {
      const parsed = JSON.parse(matches[matches.length - 1][1]);
      return {
        summary: parsed.summary ?? '',
        risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      };
    } catch {
      // fall through
    }
  }
  return { summary: '리스크 요약 블록을 파싱하지 못했습니다.', risks: [] };
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * 케이스의 세무 리스크·함정을 AI로 스캔한다.
 *
 * @param {object} scenarioResult runScenarioN() 반환값
 * @param {object} [options] { client, model, maxTokens, webSearch, lawBaseDate }
 * @returns {Promise<{summary, risks, reportText, usage}>}
 */
export async function scanRisks(scenarioResult, options = {}) {
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
    output_config: { effort: 'medium' },
    system: RISK_SYSTEM,
    messages: [{ role: 'user', content: buildRiskPrompt(scenarioResult, { lawBaseDate }) }],
  };
  if (webSearch) {
    request.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }];
  }

  const response = await createMessageWithResume(client, request);
  const reportText = extractText(response);
  const parsed = parseRisks(reportText);
  parsed.risks.sort((x, y) => (SEVERITY_ORDER[x.severity] ?? 9) - (SEVERITY_ORDER[y.severity] ?? 9));

  return { ...parsed, reportText, usage: response.usage };
}

const SEVERITY_LABEL = { high: '🔴 높음', medium: '🟡 중간', low: '🟢 낮음' };

/** 리스크 스캔 결과를 마크다운 체크리스트로 렌더링 */
export function renderRisks(scan, { heading = '## 세무 리스크 체크리스트' } = {}) {
  if (!scan || !Array.isArray(scan.risks) || scan.risks.length === 0) {
    return `${heading}\n\n특별히 지적된 세무 리스크가 없습니다.`;
  }
  const out = [heading, ''];
  if (scan.summary) out.push(`_${scan.summary}_`, '');
  for (const r of scan.risks) {
    out.push(`### ${SEVERITY_LABEL[r.severity] ?? r.severity} — ${r.title}`);
    if (r.description) out.push(r.description);
    if (r.checkpoint) out.push('', `- **확인할 것**: ${r.checkpoint}`);
    if (r.lawRef) out.push(`- **근거**: ${r.lawRef}`);
    out.push('');
  }
  return out.join('\n');
}
