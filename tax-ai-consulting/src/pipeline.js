/**
 * 전체 파이프라인: 계산(1단계) → AI 검증(2단계) → 요약 보고서(3단계)
 */

import * as scenarios from './scenario/index.js';
import { verifyCalculation } from './verify/index.js';
import { generateReport, buildBasicReport } from './report/index.js';
import { createClient } from './ai/client.js';

/**
 * @param {number} scenarioId 1~10
 * @param {object} inputs     시나리오 입력값
 * @param {object} [options]
 * @param {object}  [options.client] 주입용 AI 클라이언트 (검증·보고서 공용)
 * @param {boolean} [options.ai=true] false면 AI 단계를 건너뛰고 템플릿 보고서만 생성
 * @returns {Promise<{calculation, verification, report}>}
 */
export async function runPipeline(scenarioId, inputs, options = {}) {
  const { ai = true } = options;

  const run = scenarios[`runScenario${scenarioId}`];
  if (typeof run !== 'function') {
    throw new Error(`알 수 없는 시나리오 ID: ${scenarioId} (1~10만 지원)`);
  }

  // 1단계 — 계산
  const calculation = run(inputs);

  if (!ai) {
    return { calculation, verification: null, report: buildBasicReport(calculation) };
  }

  const client = options.client ?? createClient();

  // 2단계 — AI 검증
  const verification = await verifyCalculation(calculation, { ...options, client });

  // 3단계 — 요약 보고서
  const { markdown } = await generateReport(calculation, verification, { ...options, client });

  return { calculation, verification, report: markdown };
}
