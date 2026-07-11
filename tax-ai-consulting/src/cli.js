#!/usr/bin/env node
/**
 * 파이프라인 실행 CLI
 *
 * 사용법:
 *   node src/cli.js <시나리오ID> [입력.json] [--no-ai] [--out 보고서.md]
 *
 *   - 입력.json 을 생략하면 내장 샘플 입력으로 실행한다.
 *   - --no-ai   : AI 검증·보고서 생성을 건너뛰고 템플릿 보고서만 출력 (API 키 불필요)
 *   - --out     : 보고서를 파일로 저장 (생략 시 stdout 출력)
 *
 * AI 단계를 사용하려면 ANTHROPIC_API_KEY 환경변수가 필요하다.
 */

import fs from 'node:fs';
import { runPipeline } from './pipeline.js';

const SAMPLE_INPUTS = {
  marketPrice: 1_500_000_000,
  officialPrice: 1_000_000_000,
  basePrice: 800_000_000,
  loanPrice: 300_000_000,
  holdPeriod: 6,
  stayPeriod: 4,
  space: 85,
  heavy: 0,
  holdOfficialPrice: 800_000_000,
  holdPeriod2: 5,
  ownerAge: 55,
  childAge: 25,
  spouseAge: 52,
  ownerRate: 0.5,
  spouseRate: 0.5,
  spouseHoldPeriod: 5,
  partRate: 0.5,
  ownCount: 2,
  isAdj: 0,
  child: { price: 500_000_000, age: 28 },
  childSpouse: { price: 0, age: 28 },
  grand1: { price: 300_000_000, age: 10 },
  grand2: { price: 300_000_000, age: 12 },
  grand3: { price: 0, age: 8 },
  spouse: { price: 500_000_000, age: 52 },
  child1: { price: 300_000_000, age: 25 },
  child2: { price: 300_000_000, age: 22 },
  child3: { price: 0, age: 18 },
  child4: { price: 0, age: 15 },
};

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--') && a !== outFile());

function outFile() {
  const i = args.indexOf('--out');
  return i >= 0 ? args[i + 1] : null;
}

const scenarioId = Number(positional[0]);
if (!Number.isInteger(scenarioId) || scenarioId < 1 || scenarioId > 10) {
  console.error('사용법: node src/cli.js <시나리오ID 1~10> [입력.json] [--no-ai] [--out 보고서.md]');
  process.exit(1);
}

const inputs = positional[1]
  ? JSON.parse(fs.readFileSync(positional[1], 'utf-8'))
  : SAMPLE_INPUTS;

const useAi = !flags.has('--no-ai');
if (useAi && !process.env.ANTHROPIC_API_KEY) {
  console.error('경고: ANTHROPIC_API_KEY가 설정되어 있지 않습니다. --no-ai 모드로 실행하거나 키를 설정하세요.');
}

const { calculation, verification, report } = await runPipeline(scenarioId, inputs, { ai: useAi });

console.error(`✔ 1단계 계산 완료: ${calculation.title}`);
if (verification) {
  console.error(`✔ 2단계 AI 검증 완료: verdict=${verification.verdict} — ${verification.summary}`);
} else {
  console.error('- 2단계 AI 검증 건너뜀 (--no-ai)');
}

const out = outFile();
if (out) {
  fs.writeFileSync(out, report);
  console.error(`✔ 3단계 보고서 저장: ${out}`);
} else {
  console.log(report);
}
