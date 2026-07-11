# property — 부동산 세금 AI 상담 프로그램

부동산 세금(증여세·양도세·취득세·재산세·종합부동산세)을 계산하고, AI가 그 계산을 검증한 뒤, 고객용 요약 문서까지 만들어 주는 프로그램입니다.

## 프로그램 목적 (전체 그림)

이 프로그램은 **3단계 파이프라인**으로 동작하는 것을 목표로 합니다.

```
[1단계]                [2단계]                    [3단계]
계산기 로직     →      AI 검증                →   요약 문서 생성
(코드로 세금 계산)     (계산 과정·결과를           (검증된 결과를 바탕으로
                       최신 세법 기준으로 검증)     고객용 요약 보고서 작성)
```

### 1단계 — 계산기 로직 (구현 완료)

코드로 작성된 세금 계산 엔진이 먼저 계산을 수행합니다. AI가 아닌 결정적(deterministic) 로직이므로 같은 입력에는 항상 같은 결과가 나옵니다.

### 2단계 — AI 검증 (구현 완료)

계산기가 **어떻게 계산했는지**(적용 세율, 공제, 중과 여부, 근거 법령)를 Claude AI가 받아서:

- 계산 과정이 올바른지 검증
- **최신 개정 세법**이 제대로 반영되었는지 웹검색으로 확인 (현재 엔진은 2026.5.10 시행분 기준)
- 오류나 누락이 있으면 지적하고 `pass / warning / fail` 판정을 반환

### 3단계 — 요약 문서 생성 (구현 완료)

검증까지 끝난 결과를 바탕으로 AI가 **고객 전달용 요약 보고서**(마크다운)를 자동 생성합니다. 케이스별 세부담 비교표, 보유세 변화, 유리한 선택지, 유의사항, 근거 세법을 담습니다. API 키가 없을 때를 위한 템플릿 기반 폴백 보고서(`buildBasicReport`)도 제공합니다.

## 현재 구현 상태

| 단계 | 상태 | 위치 |
|------|------|------|
| 1단계 계산기 로직 | ✅ 구현 완료 | `tax-ai-consulting/src/core`, `src/scenario` |
| 2단계 AI 검증 | ✅ 구현 완료 (Claude API + 웹검색) | `tax-ai-consulting/src/verify` |
| 3단계 요약 문서 생성 | ✅ 구현 완료 (AI 생성 + 템플릿 폴백) | `tax-ai-consulting/src/report` |
| 전체 파이프라인 / CLI | ✅ 구현 완료 | `tax-ai-consulting/src/pipeline.js`, `src/cli.js` |

테스트 95개 (계산 엔진 78개 + AI 단계 17개, AI 단계는 mock으로 네트워크 없이 검증).

## 저장소 구조

```
property/
└── tax-ai-consulting/
    ├── src/
    │   ├── core/               # 1단계: 세금 계산 엔진 (2026.5.10 시행 기준)
    │   │   ├── gift-tax.js           # 증여세 (calcGiveTax)
    │   │   ├── acquisition-tax.js    # 취득세 (calcTakingTax, calcGiveTakingEtcTax)
    │   │   ├── transfer-tax.js       # 양도세 (calcSaleIncomeTax)
    │   │   ├── property-tax.js       # 재산세 (calcPropertyTax)
    │   │   ├── comprehensive-tax.js  # 종합부동산세 (calcAggrTax)
    │   │   └── constants.js          # 세율·공제 상수
    │   ├── scenario/           # 1단계: 상담 시나리오 10종 (runScenario1 ~ runScenario10)
    │   ├── ai/client.js        # Claude API 클라이언트 래퍼 (pause_turn 재개, refusal 처리)
    │   ├── verify/             # 2단계: AI 검증 (verifyCalculation — 웹검색으로 최신 세법 확인)
    │   ├── report/             # 3단계: 요약 보고서 (generateReport / buildBasicReport)
    │   ├── pipeline.js         # 계산 → 검증 → 보고서 전체 파이프라인 (runPipeline)
    │   └── cli.js              # 커맨드라인 실행기
    └── tests/                  # vitest 테스트 (core / scenario / verify / report)
```

### 시나리오 목록

| # | 대상 | 비교 내용 |
|---|------|-----------|
| 1 | 2주택자 | 자녀에게 증여 vs 타인에게 양도 |
| 2 | 2주택자 | 자녀에게 일반증여 vs 부담부증여 |
| 3 | 2주택자 | 자녀 1명에게 증여 vs 여러 명에게 분산증여 |
| 4 | 2주택자 | 자녀 1명 부담부증여 vs 여러 명 부담부증여 |
| 5 | 2주택자 | 배우자에게 일반증여 vs 부담부증여 |
| 6 | 1주택자 | 일부 지분 배우자 일반증여 vs 부담부증여 |
| 7 | 공동명의 1주택자 | 배우자 단독명의로 전환 |
| 8 | 2주택자 | 배우자에게 증여 vs 타인에게 양도 |
| 9 | 2주택자 | 배우자에게만 증여 vs 배우자+자녀 분산증여 |
| 10 | 2주택자 | 배우자에게만 부담부증여 vs 여러 명에게 부담부증여 |

## 실행 방법

```bash
cd tax-ai-consulting
npm install
npm test          # vitest 테스트 실행 (네트워크·API 키 불필요)
```

### API 키 설정 (환경변수)

AI 검증·보고서 단계는 `ANTHROPIC_API_KEY` 환경변수를 사용합니다. 두 가지 방법 중 하나로 설정하세요.

**방법 1 — `.env` 파일 (권장, 한 번만 설정)**

```bash
cd tax-ai-consulting
cp .env.example .env
# .env 파일을 열어 실제 키 입력: ANTHROPIC_API_KEY=sk-ant-...
```

`.env`는 `.gitignore`에 등록되어 있어 git에 커밋되지 않으며, CLI와 사례 실행기가 시작할 때 자동으로 읽습니다. 셸에 이미 설정된 환경변수가 있으면 그 값이 우선합니다.

**방법 2 — 셸 환경변수 (해당 터미널 세션에서만 유효)**

```bash
export ANTHROPIC_API_KEY=sk-ant-...            # macOS / Linux
# Windows PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
```

항상 유지하려면 `~/.bashrc`(또는 `~/.zshrc`)에 export 줄을 추가하세요.

> ⚠️ 실제 키를 코드·README·커밋 메시지에 직접 적지 마세요. 키가 노출됐다면 [Anthropic Console](https://console.anthropic.com/settings/keys)에서 폐기 후 재발급하세요.

### 전체 파이프라인 실행 (CLI)

```bash
# AI 검증·보고서까지 실행 — ANTHROPIC_API_KEY 필요 (위 설정 참고)
node src/cli.js 1                          # 시나리오 1을 샘플 입력으로 실행
node src/cli.js 1 inputs.json --out 보고서.md   # 입력 파일 지정, 보고서 파일로 저장

# AI 없이 계산 + 템플릿 보고서만 (API 키 불필요)
node src/cli.js 1 --no-ai
```

### 코드에서 사용

```js
import { runPipeline } from './src/pipeline.js';

const { calculation, verification, report } = await runPipeline(1, inputs);
// calculation : 1단계 계산 결과 (세액, lawRef 등)
// verification: 2단계 AI 검증 { verdict, summary, issues, lawChanges, reportText }
// report      : 3단계 고객용 요약 보고서 (마크다운)
```

AI 단계는 `claude-opus-4-8` 모델과 웹검색 도구(`web_search`)를 사용해 계산 엔진 기준일(2026.5.10) 이후의 세법 개정 여부까지 확인합니다.

## 프롬프트 튜닝 (사례 일괄 실행)

`tax-ai-consulting/cases/`에 실제 상담 사례 5건이 준비되어 있습니다. API 키를 설정한 뒤 일괄 실행하면 사례별 검증 판정과 보고서가 `tuning-results/`에 저장됩니다.

```bash
cd tax-ai-consulting   # API 키 설정 필요 (위 "API 키 설정" 참고)
npm run cases          # 사례 5건 전체를 계산→검증→보고서로 실행
npm run cases:dry      # AI 없이 계산만 (키 불필요, 입력값 점검용)
node scripts/run-cases.js --case 01   # 특정 사례만 실행
```

튜닝 절차: ① `npm run cases` 실행 → ② `tuning-results/*/verdict.json`과 `verification.md`에서 이상한 판정(과잉 warning, 놓친 오류 등) 확인 → ③ `src/verify/index.js`의 `VERIFY_SYSTEM` / `src/report/index.js`의 `REPORT_SYSTEM` 지시문 수정 → ④ 다시 실행해 비교. 사례 추가는 `cases/`에 JSON 파일(`scenarioId`, `title`, `description`, `inputs`)을 넣으면 됩니다.

## 앞으로 할 일 (로드맵)

1. 실제 상담 사례로 AI 검증 정확도 평가 및 프롬프트 튜닝 (사례·실행기 준비 완료, API 키 필요)
2. 보고서 PDF/DOCX 변환 등 출력 형식 확장
3. 세법 개정 시 `src/core/constants.js` 및 계산 로직 업데이트 절차 정리
