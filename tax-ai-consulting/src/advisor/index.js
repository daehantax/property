/**
 * 상담 심화 보조 장치 통합 (장치 1~4)
 *
 * 하나의 케이스를 받아 네 가지 보조 장치를 돌려, 세무사가 "다양한 상황·문제점·
 * 추가 아이디어"를 한 번에 검토할 수 있는 심화 리포트를 만든다.
 *   1) 절세 대안 생성기 (AI + 엔진 검증)
 *   2) 리스크·함정 스캐너 (AI)
 *   3) 민감도·손익분기 분석 (엔진, AI 불필요)
 *   4) 세법 개정 감시 (AI 웹검색, 케이스 무관 — 옵션)
 */

import * as scenarios from '../scenario/index.js';
import { createClient } from '../ai/client.js';
import { sweep, renderSensitivity } from '../analysis/sensitivity.js';
import { scanRisks, renderRisks } from './risk-scan.js';
import { generateAlternatives, renderAlternatives } from './alternatives.js';
import { checkLawChanges, renderLawWatch } from '../monitor/law-watch.js';

export { sweep, renderSensitivity } from '../analysis/sensitivity.js';
export { scanRisks, renderRisks } from './risk-scan.js';
export { generateAlternatives, renderAlternatives } from './alternatives.js';
export { checkLawChanges, renderLawWatch } from '../monitor/law-watch.js';

/**
 * 스윕 결과가 실제로 유의미하게 변하는지(케이스별 총액 또는 diff가 바뀌는지) 판정.
 * 시나리오가 해당 입력값을 쓰지 않으면(예: 증여 vs 양도 시나리오의 loanPrice)
 * 표가 평평해지므로, 그런 변수는 기본값에서 배제한다.
 */
function variableMoves(scenarioId, baseInputs, variable) {
  try {
    const { points } = sweep({ scenarioId, baseInputs, variable });
    const distinct = new Set(points.map((p) => `${p.a}|${p.b}`));
    return distinct.size > 1;
  } catch {
    return false;
  }
}

/**
 * 시나리오에서 실제로 결과를 움직이는 변수를 자동 선택한다.
 * 후보를 우선순위대로 시험해, 표가 평평하지 않은(유불리가 실제로 달라지는)
 * 첫 변수를 고른다. 모두 평평하면 보유기간으로 폴백한다.
 */
export function defaultSweepVariable(scenarioId, baseInputs) {
  const mp = baseInputs.marketPrice ?? 0;
  const steps = (from, to, n) =>
    Array.from({ length: n }, (_, i) => Math.round(from + ((to - from) * i) / (n - 1)));

  const candidates = [];
  if (typeof baseInputs.loanPrice === 'number' && mp > 0) {
    candidates.push({ path: 'loanPrice', label: '승계 대출액', unit: '원', values: steps(0, Math.round(mp * 0.8), 5) });
  }
  if (typeof baseInputs.basePrice === 'number' && mp > 0) {
    candidates.push({ path: 'basePrice', label: '취득가액', unit: '원', values: steps(Math.round(mp * 0.3), Math.round(mp * 0.9), 5) });
  }
  if (typeof baseInputs.holdPeriod === 'number') {
    candidates.push({ path: 'holdPeriod', label: '보유기간', unit: '년', values: [2, 5, 10, 15, 20] });
  }
  if (mp > 0) {
    candidates.push({ path: 'marketPrice', label: '시가', unit: '원', values: steps(Math.round(mp * 0.7), Math.round(mp * 1.3), 5) });
  }

  for (const variable of candidates) {
    if (variableMoves(scenarioId, baseInputs, variable)) return variable;
  }
  return candidates[0] ?? { path: 'holdPeriod', label: '보유기간', unit: '년', values: [2, 5, 10, 15, 20] };
}

/**
 * 케이스 심화 분석을 실행한다.
 *
 * @param {number} scenarioId
 * @param {object} baseInputs
 * @param {object} [options]
 * @param {object}  [options.client]     AI 클라이언트 (검증·대안·감시 공용)
 * @param {boolean} [options.ai=true]    false면 민감도 분석만 (AI 불필요)
 * @param {boolean} [options.lawWatch=false] 세법 개정 감시 포함 여부 (느림)
 * @param {object}  [options.variable]   민감도 변수 override
 * @param {string}  [options.asOfDate]   개정 감시 기준일
 * @returns {Promise<{calculation, sensitivity, risk, alternatives, lawWatch}>}
 */
export async function adviseCase(scenarioId, baseInputs, options = {}) {
  const { ai = true, lawWatch = false } = options;
  const run = scenarios[`runScenario${scenarioId}`];
  if (typeof run !== 'function') {
    throw new Error(`알 수 없는 시나리오 ID: ${scenarioId} (1~10만 지원)`);
  }

  const calculation = run(baseInputs);

  // 민감도 분석 — 순수 엔진, 항상 실행
  const variable = options.variable ?? defaultSweepVariable(scenarioId, baseInputs);
  const sensitivity = sweep({ scenarioId, baseInputs, variable });

  if (!ai) {
    return { calculation, sensitivity, risk: null, alternatives: null, lawWatch: null };
  }

  const client = options.client ?? createClient();
  const [risk, alternatives] = await Promise.all([
    scanRisks(calculation, { ...options, client }),
    generateAlternatives(calculation, baseInputs, { ...options, client }),
  ]);
  const law = lawWatch ? await checkLawChanges({ ...options, client }) : null;

  return { calculation, sensitivity, risk, alternatives, lawWatch: law };
}

/** 심화 분석 결과를 하나의 마크다운 리포트로 합친다. */
export function renderAdvisory(advisory) {
  const { calculation, sensitivity, risk, alternatives, lawWatch } = advisory;
  const out = [
    `# 상담 심화 검토 — ${calculation.title}`,
    '',
    '> 계산 결과 위에 얹는 보조 검토입니다: 손익분기(민감도), 세무 리스크, 추가 절세 대안, 세법 개정 여부.',
    '',
    renderSensitivity(sensitivity, { heading: '## 1. 민감도·손익분기 분석' }),
  ];
  if (risk) out.push('', renderRisks(risk, { heading: '## 2. 세무 리스크 체크리스트' }));
  if (alternatives) out.push('', renderAlternatives(alternatives, { heading: '## 3. 추가 절세 대안' }));
  if (lawWatch) out.push('', renderLawWatch(lawWatch, { heading: '## 4. 세법 개정 감시' }));
  out.push(
    '',
    '---',
    '',
    '*본 검토는 참고용이며, 실제 신고 전 세무 전문가 확인이 필요합니다. 대안의 세액은 엔진 재계산값이며 리스크·개정 항목은 AI가 웹검색으로 검토한 결과입니다.*',
  );
  return out.join('\n');
}
