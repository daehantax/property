#!/usr/bin/env node
/**
 * 상담 심화 검토 실행기 (장치 1~4)
 *
 * 케이스를 민감도·리스크·대안·개정감시 장치에 돌려 advisory.md 를 만든다.
 *
 * 사용법:
 *   node scripts/advise.js --case 01              # cases/ 에서 "01" 포함 사례
 *   node scripts/advise.js --scenario 2 input.json
 *   node scripts/advise.js --case 01 --no-ai      # 민감도 분석만 (API 키 불필요)
 *   node scripts/advise.js --case 01 --law-watch  # 세법 개정 감시 포함 (느림)
 *   node scripts/advise.js --case 01 --out out.md
 *
 * AI 장치(리스크·대안·개정감시)는 ANTHROPIC_API_KEY 가 필요하다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adviseCase, renderAdvisory } from '../src/advisor/index.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const casesDir = path.join(root, 'cases');

const args = process.argv.slice(2);
const useAi = !args.includes('--no-ai');
const lawWatch = args.includes('--law-watch');
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const caseFilter = opt('--case');
const scenarioArg = opt('--scenario');
const outArg = opt('--out');

if (useAi && !process.env.ANTHROPIC_API_KEY) {
  console.error('경고: ANTHROPIC_API_KEY 미설정 — AI 장치(리스크·대안·개정감시)는 실패합니다.');
  console.error('민감도 분석만 하려면 --no-ai 로 실행하세요.');
}

// 입력 확보: --case (cases/*.json) 또는 --scenario + input.json
let scenarioId;
let inputs;
let label;

if (caseFilter) {
  const file = fs.readdirSync(casesDir)
    .filter((f) => f.endsWith('.json') && f.includes(caseFilter))
    .sort()[0];
  if (!file) {
    console.error(`사례를 찾지 못했습니다 (필터: ${caseFilter})`);
    process.exit(1);
  }
  const def = JSON.parse(fs.readFileSync(path.join(casesDir, file), 'utf-8'));
  scenarioId = def.scenarioId;
  inputs = def.inputs;
  label = path.basename(file, '.json');
} else if (scenarioArg) {
  scenarioId = Number(scenarioArg);
  const inputFile = args.find((a) => a.endsWith('.json'));
  if (!inputFile) {
    console.error('사용법: node scripts/advise.js --scenario <ID> <입력.json>');
    process.exit(1);
  }
  inputs = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  label = `scenario-${scenarioId}`;
} else {
  console.error('사용법: node scripts/advise.js --case <필터> | --scenario <ID> <입력.json> [--no-ai] [--law-watch] [--out out.md]');
  process.exit(1);
}

console.error(`▶ 심화 검토: ${label} (시나리오 ${scenarioId})${useAi ? '' : ' — 민감도만'}${lawWatch ? ' + 개정감시' : ''}`);

const started = Date.now();
const advisory = await adviseCase(scenarioId, inputs, { ai: useAi, lawWatch });
const md = renderAdvisory(advisory);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.error(`✔ 완료 (${seconds}s)`);
if (advisory.risk) console.error(`  - 리스크 ${advisory.risk.risks.length}건`);
if (advisory.alternatives) console.error(`  - 대안 ${advisory.alternatives.ideas.length}건`);
if (advisory.lawWatch) {
  const act = advisory.lawWatch.findings.filter((f) => f.status === 'changed' || f.status === 'scheduled').length;
  console.error(`  - 개정감시 조치필요 ${act}건`);
}

const out = outArg ?? path.join(root, 'advisory-results', `${label}.md`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);
console.error(`✔ 리포트 저장: ${out}`);
