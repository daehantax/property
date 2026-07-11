#!/usr/bin/env node
/**
 * 프롬프트 튜닝용 사례 일괄 실행기
 *
 * cases/*.json 의 상담 사례를 전부 파이프라인(계산 → AI 검증 → 보고서)에 돌리고,
 * 결과를 tuning-results/<사례명>/ 에 저장한다. 실행 후 요약 표를 출력하므로
 * 어느 사례에서 AI 판정이 이상한지 한눈에 보고 프롬프트를 다듬을 수 있다.
 *
 * 사용법:
 *   node scripts/run-cases.js              # 전체 사례 실행 (ANTHROPIC_API_KEY 필요)
 *   node scripts/run-cases.js --no-ai      # AI 없이 계산만 (사례 입력값 점검용)
 *   node scripts/run-cases.js --case 01    # 이름에 "01"이 들어간 사례만 실행
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '../src/pipeline.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const casesDir = path.join(root, 'cases');
const outRoot = path.join(root, 'tuning-results');

const args = process.argv.slice(2);
const useAi = !args.includes('--no-ai');
const caseFilter = args.includes('--case') ? args[args.indexOf('--case') + 1] : null;

if (useAi && !process.env.ANTHROPIC_API_KEY) {
  console.error('오류: ANTHROPIC_API_KEY가 설정되어 있지 않습니다.');
  console.error('키를 설정하거나, 입력값 점검만 하려면 --no-ai 로 실행하세요.');
  process.exit(1);
}

const caseFiles = fs.readdirSync(casesDir)
  .filter((f) => f.endsWith('.json'))
  .filter((f) => !caseFilter || f.includes(caseFilter))
  .sort();

if (caseFiles.length === 0) {
  console.error(`실행할 사례가 없습니다 (cases/ 디렉터리, 필터: ${caseFilter ?? '없음'})`);
  process.exit(1);
}

const summary = [];

for (const file of caseFiles) {
  const caseName = path.basename(file, '.json');
  const caseDef = JSON.parse(fs.readFileSync(path.join(casesDir, file), 'utf-8'));
  console.error(`\n▶ ${caseName} — 시나리오 ${caseDef.scenarioId}: ${caseDef.title}`);

  const outDir = path.join(outRoot, caseName);
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const started = Date.now();
    const { calculation, verification, report } = await runPipeline(
      caseDef.scenarioId, caseDef.inputs, { ai: useAi },
    );
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    fs.writeFileSync(path.join(outDir, 'calculation.json'), JSON.stringify(calculation, null, 2));
    fs.writeFileSync(path.join(outDir, 'report.md'), report);
    if (verification) {
      fs.writeFileSync(path.join(outDir, 'verification.md'), verification.reportText);
      fs.writeFileSync(path.join(outDir, 'verdict.json'), JSON.stringify({
        verdict: verification.verdict,
        summary: verification.summary,
        issues: verification.issues,
        lawChanges: verification.lawChanges,
        usage: verification.usage,
      }, null, 2));
    }

    const verdict = verification?.verdict ?? '(AI 미사용)';
    console.error(`  ✔ 완료 (${seconds}s) — 판정: ${verdict}`);
    summary.push({ case: caseName, verdict, issues: verification?.issues?.length ?? 0, note: verification?.summary ?? '' });
  } catch (err) {
    console.error(`  ✘ 실패: ${err.message}`);
    fs.writeFileSync(path.join(outDir, 'error.txt'), String(err.stack ?? err));
    summary.push({ case: caseName, verdict: 'ERROR', issues: '-', note: err.message });
  }
}

console.error('\n===== 실행 요약 =====');
for (const row of summary) {
  console.error(`${row.verdict.padEnd(10)} issues:${String(row.issues).padEnd(3)} ${row.case} — ${row.note}`);
}
console.error(`\n결과 저장 위치: ${outRoot}/`);
