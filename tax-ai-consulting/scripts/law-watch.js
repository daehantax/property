#!/usr/bin/env node
/**
 * 세법 개정 감시 독립 실행기 (장치 4 전용)
 *
 * 케이스와 무관하게 엔진의 세법 가정 8종 + 동향 4종(판결·심판 / 국세청 예규·질의응답 /
 * 기획재정부 유권해석 / 정부안·규제지역)을 웹검색으로 대조한다.
 * 심화 검토(advise.js)에 끼워 돌리면 검색 예산이 부족해지므로,
 * 개정 감시는 이 스크립트로 단독 실행하는 것을 권장한다 (매월 1일 정기 스케줄용).
 *
 * 사용법:
 *   node scripts/law-watch.js                 # 감시 실행, law-watch-results/ 에 저장
 *   node scripts/law-watch.js --out watch.md  # 저장 위치 지정
 *   node scripts/law-watch.js --strict        # 조치 필요 항목이 있으면 종료코드 1
 *                                             # (CI 정기 실행에서 "빨간불 = 개정 발생" 알림용)
 *   node scripts/law-watch.js --days 62       # 동향 감시 기간 변경 (기본 31일 = 한 달치)
 *
 * 리포트 끝에 「세법 동향 일지 등록 후보」가 붙는다. 발견된 예규·판결·질의응답을
 * src/web/static/law-updates-data.js 에 붙여 넣을 수 있는 JS 블록이다.
 *
 * ANTHROPIC_API_KEY 필요.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkLawChanges, renderLawWatch, countActionable, countUpdateCandidates,
} from '../src/monitor/law-watch.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const daysArg = args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : NaN;
const lookbackDays = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : 31;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('오류: ANTHROPIC_API_KEY가 설정되어 있지 않습니다.');
  process.exit(1);
}

console.error(`▶ 세법 개정 감시 실행 (엔진 가정 8종 + 동향 4종, 최근 ${lookbackDays}일, 웹검색 최대 14회)`);
const started = Date.now();
const watch = await checkLawChanges({ lookbackDays });
const seconds = ((Date.now() - started) / 1000).toFixed(1);

const md = renderLawWatch(watch, { heading: '# 세법 개정 감시 리포트' });
const out = outArg ?? path.join(root, 'law-watch-results', `law-watch-${watch.asOfDate}.md`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);

const actionable = countActionable(watch);
const uncertain = watch.findings.filter((f) => f.status === 'uncertain').length;
const candidates = countUpdateCandidates(watch);
console.error(`✔ 완료 (${seconds}s) — 조치필요 ${actionable}건, 미확인 ${uncertain}건 / 총 ${watch.findings.length}항목, 동향 일지 등록 후보 ${candidates}건`);
console.error(`✔ 리포트 저장: ${out}`);

if (actionable > 0) {
  console.error('\n⚠️ 조치 필요 항목:');
  for (const f of watch.findings.filter((x) => x.status === 'changed' || x.status === 'scheduled')) {
    console.error(`  - [${f.status}] ${f.label}: ${f.note} → 고칠 위치: ${f.where}`);
  }
}
if (candidates > 0) {
  console.error(`\n📌 세법 동향 일지 등록 후보 ${candidates}건 — 리포트 끝의 JS 블록을 검토해 law-updates-data.js 에 추가하세요.`);
}
if (strict && actionable > 0) process.exit(1);
