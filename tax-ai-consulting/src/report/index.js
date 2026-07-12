/**
 * 3단계 — 요약 문서 생성 모듈
 *
 * 계산 결과(1단계)와 AI 검증 결과(2단계)를 바탕으로 고객 전달용
 * 요약 보고서(마크다운)를 만든다.
 *   - generateReport()  : Claude가 작성하는 고객용 보고서 (권장)
 *   - buildBasicReport(): API 호출 없이 만드는 템플릿 기반 보고서 (폴백)
 */

import {
  DEFAULT_MODEL, createClient, createMessageWithResume, extractText,
} from '../ai/client.js';

const REPORT_SYSTEM = `당신은 한국 세무법인의 부동산 세금 상담 보고서 작성자입니다.
계산 엔진의 결과와 AI 검증 결과를 바탕으로 고객에게 전달할 요약 보고서를 마크다운으로 작성합니다.

보고서 구성:
1. 제목과 상담 개요 (시나리오 설명, 주요 입력값)
2. 케이스별 세부담 비교 (표 사용, 금액은 천 단위 구분 "1,234,567원" 형식)
   - 비교표 바로 아래에 "세금 계산 내역" 소단락을 두고, 각 세목(증여세·취득세·양도세 등)별로
     계산 과정을 단계별로 제시하십시오. 예:
     · 증여세: 증여재산가액 → 증여재산공제 → 과세표준 → 세율·누진공제 → 산출세액 → 신고세액공제 → 납부세액
     · 취득세: 과세표준 → 세율(중과 여부) → 취득세 + 지방교육세 + 농어촌특별세
     · 양도세: 양도가액 − 취득가액 = 양도차익 → 장기보유특별공제(배제 시 그 사유) → 기본공제 → 과세표준 → 세율(중과 가산) → 산출세액 → 지방소득세
   - 계산 내역의 수치는 함께 제공되는 "검증 상세" 자료의 재현 내용과 계산 결과 JSON에 근거해야 하며,
     근거 없는 수치를 새로 만들지 마십시오. 근거가 없는 항목은 계산 내역에서 생략하십시오.
3. 보유세(재산세+종부세) 변화가 있으면 그 비교
4. 결론 — 어떤 선택이 세금상 유리한지와 그 금액 차이
5. 유의사항 — 검증에서 지적된 사항, 세법 개정 관련 참고사항, 근거 법령
6. 말미에 "본 보고서는 참고용이며, 실제 신고 전 세무 전문가 확인이 필요합니다." 문구

전문 용어는 고객이 이해할 수 있게 짧게 풀어 쓰고, 과장 없이 사실만 기술하십시오.`;

export function buildReportPrompt(scenarioResult, verification) {
  const parts = [
    '아래 자료로 고객용 요약 보고서를 작성해 주세요.',
    '',
    '## 계산 결과 (금액 단위: 원)',
    '```json',
    JSON.stringify(scenarioResult, null, 2),
    '```',
  ];
  if (verification) {
    parts.push(
      '',
      '## AI 검증 결과',
      '```json',
      JSON.stringify(
        {
          verdict: verification.verdict,
          summary: verification.summary,
          issues: verification.issues,
          lawChanges: verification.lawChanges,
        },
        null,
        2,
      ),
      '```',
    );
    if (verification.reportText) {
      parts.push(
        '',
        '## 검증 상세 (계산 재현 내용 — 계산 내역 작성의 근거로 사용)',
        verification.reportText,
      );
    }
  }
  return parts.join('\n');
}

/**
 * Claude로 고객용 요약 보고서(마크다운)를 생성한다.
 *
 * @param {object} scenarioResult runScenarioN() 반환값
 * @param {object} [verification] verifyCalculation() 반환값 (없으면 검증 없이 작성)
 * @param {object} [options] { client, model, maxTokens }
 * @returns {Promise<{markdown, usage}>}
 */
export async function generateReport(scenarioResult, verification = null, options = {}) {
  const {
    client = createClient(),
    model = DEFAULT_MODEL,
    maxTokens = 16000,
  } = options;

  const response = await createMessageWithResume(client, {
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: REPORT_SYSTEM,
    messages: [{ role: 'user', content: buildReportPrompt(scenarioResult, verification) }],
  });

  return { markdown: extractText(response), usage: response.usage };
}

export const formatKRW = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

const VERDICT_LABEL = {
  pass: '통과 — 계산에 문제가 발견되지 않았습니다.',
  warning: '주의 — 참고할 사항이 있습니다.',
  fail: '오류 — 계산 결과에 문제가 발견되었습니다.',
  unknown: '판정 불가 — 검증 결과를 해석하지 못했습니다.',
};

/**
 * API 호출 없이 계산 결과만으로 만드는 템플릿 기반 요약 보고서.
 * AI 보고서를 쓸 수 없을 때(키 없음, 오프라인)의 폴백이다.
 */
export function buildBasicReport(scenarioResult, verification = null) {
  const lines = [
    `# 부동산 세금 시나리오 요약 (시나리오 ${scenarioResult.scenarioId})`,
    '',
    `**${scenarioResult.title}**`,
    '',
    '## 세부담 요약',
    '',
    '| 항목 | 금액 |',
    '|------|------|',
  ];
  for (const [key, value] of Object.entries(scenarioResult.summary ?? {})) {
    lines.push(`| ${key} | ${formatKRW(value)} |`);
  }

  if (Array.isArray(scenarioResult.lawRef) && scenarioResult.lawRef.length > 0) {
    lines.push('', '## 근거 법령', '');
    for (const ref of scenarioResult.lawRef) lines.push(`- ${ref}`);
  }

  if (verification) {
    lines.push('', '## AI 검증 결과', '', `**${VERDICT_LABEL[verification.verdict] ?? verification.verdict}**`);
    if (verification.summary) lines.push('', verification.summary);
    for (const issue of verification.issues ?? []) {
      lines.push(`- [${issue.severity}] ${issue.description}`);
    }
    for (const change of verification.lawChanges ?? []) {
      lines.push(`- [세법개정] ${change.description}`);
    }
  }

  lines.push('', '---', '', '본 보고서는 참고용이며, 실제 신고 전 세무 전문가 확인이 필요합니다.');
  return lines.join('\n');
}
