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

검증까지 끝난 결과를 바탕으로 AI가 **고객 전달용 요약 보고서**(마크다운)를 자동 생성합니다. 케이스별 세부담 비교표, 세목별 계산 내역, 보유세 변화, 유리한 선택지, 유의사항, 근거 세법을 담습니다. API 키가 없을 때를 위한 템플릿 기반 폴백 보고서(`buildBasicReport`)도 제공합니다.

### 심화 검토 보조 장치 (구현 완료)

계산·검증·보고서(3단계)가 "정해진 케이스를 정확히" 다룬다면, 그 **바깥의 다양한 상황·문제점·추가 아이디어**를 다루기 위한 4가지 보조 장치를 얹었습니다.

1. **절세 대안 생성기** (`src/advisor/alternatives.js`) — AI가 고정 케이스 밖의 절세 대안을 제안하고, 입력값 조정으로 표현 가능한 대안은 **실제 계산 엔진에 통과시켜 검증된 세액**을 붙입니다(AI가 지어낸 숫자가 아님).
2. **리스크·함정 스캐너** (`src/advisor/risk-scan.js`) — 과세관청 시각에서 이월과세·부당행위계산부인·저가양도·자금출처·취득세 중과 함정 등 **거래 구조의 세무 리스크**를 위험도·근거법령·확인사항 체크리스트로 뽑습니다.
3. **민감도·손익분기 분석** (`src/analysis/sensitivity.js`) — 핵심 변수(대출 승계액·취득가액·보유기간 등)를 범위로 스윕해 **유불리가 뒤바뀌는 손익분기점**을 찾습니다. 순수 엔진 계산이라 AI·네트워크가 필요 없습니다.
4. **세법 개정 감시** (`src/monitor/law-watch.js`) — 엔진이 박아둔 세법 가정(공정시장가액비율·공제금액·중과 부활일 등)을 웹검색으로 대조해 **바뀐 항목과 고쳐야 할 상수 위치**를 경고합니다.

네 장치는 `adviseCase()`로 한 번에 실행해 하나의 심화 리포트로 합칠 수 있습니다(`src/advisor/index.js`).

## 현재 구현 상태

| 단계 | 상태 | 위치 |
|------|------|------|
| 1단계 계산기 로직 | ✅ 구현 완료 | `tax-ai-consulting/src/core`, `src/scenario` |
| 2단계 AI 검증 | ✅ 구현 완료 (Claude API + 웹검색) | `tax-ai-consulting/src/verify` |
| 3단계 요약 문서 생성 | ✅ 구현 완료 (AI 생성 + 템플릿 폴백) | `tax-ai-consulting/src/report` |
| 전체 파이프라인 / CLI | ✅ 구현 완료 | `tax-ai-consulting/src/pipeline.js`, `src/cli.js` |
| 심화 검토 장치 (대안·리스크·민감도·개정감시) | ✅ 구현 완료 | `tax-ai-consulting/src/advisor`, `src/analysis`, `src/monitor` |

테스트 127개 (모든 AI 단계는 mock으로 네트워크 없이 검증).

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
    │   ├── analysis/           # 장치3: 민감도·손익분기 분석 (sweep — 순수 엔진)
    │   ├── advisor/            # 장치1·2 + 통합: 절세 대안 생성 / 리스크 스캐너 / adviseCase
    │   ├── monitor/            # 장치4: 세법 개정 감시 (checkLawChanges — 웹검색)
    │   ├── pipeline.js         # 계산 → 검증 → 보고서 전체 파이프라인 (runPipeline)
    │   └── cli.js              # 커맨드라인 실행기
    ├── scripts/                # run-cases.js (튜닝), advise.js (심화 검토)
    └── tests/                  # vitest 테스트 (core / scenario / verify / report / analysis / advisor / monitor)
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

### 전체 파이프라인 실행 (CLI)

```bash
# AI 검증·보고서까지 실행 — ANTHROPIC_API_KEY 환경변수 필요
export ANTHROPIC_API_KEY=sk-ant-...
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

### 심화 검토 실행 (대안·리스크·민감도·개정감시)

```bash
cd tax-ai-consulting

# 민감도·손익분기 분석만 — API 키 불필요
npm run advise:dry -- --case 01

# 4가지 장치 전부 (대안·리스크는 AI) — ANTHROPIC_API_KEY 필요
export ANTHROPIC_API_KEY=sk-ant-...
node scripts/advise.js --case 01                 # 케이스 01 심화 리포트
node scripts/advise.js --case 01 --law-watch     # 세법 개정 감시까지 포함(느림)
node scripts/advise.js --scenario 2 inputs.json --out advisory.md
```

결과는 `advisory-results/<사례명>.md`로 저장됩니다. 코드에서는 `adviseCase(scenarioId, inputs, { ai, lawWatch })` → `renderAdvisory(result)`로 사용합니다. GitHub Actions에서는 `advisory-deep-dive` 워크플로(수동 실행)로 돌릴 수 있습니다.

## 프롬프트 튜닝 (사례 일괄 실행)

`tax-ai-consulting/cases/`에 실제 상담 사례 5건이 준비되어 있습니다. API 키를 설정한 뒤 일괄 실행하면 사례별 검증 판정과 보고서가 `tuning-results/`에 저장됩니다.

```bash
cd tax-ai-consulting
export ANTHROPIC_API_KEY=sk-ant-...
npm run cases          # 사례 5건 전체를 계산→검증→보고서로 실행
npm run cases:dry      # AI 없이 계산만 (키 불필요, 입력값 점검용)
node scripts/run-cases.js --case 01   # 특정 사례만 실행
```

튜닝 절차: ① `npm run cases` 실행 → ② `tuning-results/*/verdict.json`과 `verification.md`에서 이상한 판정(과잉 warning, 놓친 오류 등) 확인 → ③ `src/verify/index.js`의 `VERIFY_SYSTEM` / `src/report/index.js`의 `REPORT_SYSTEM` 지시문 수정 → ④ 다시 실행해 비교. 사례 추가는 `cases/`에 JSON 파일(`scenarioId`, `title`, `description`, `inputs`)을 넣으면 됩니다.

## 프롬프트 튜닝 이력

사례 5건 기반 튜닝 2라운드 완료 (2026.7). 최종 상태: **5건 전부 pass**, 사례당 실행 2~4분.

- 1라운드: 검증 AI가 부담부증여 취득세 유상·무상 미분리 버그 발견 → `calcBurdenedGiveTakingTax` 추가로 수정. AI 호출 스트리밍 전환(타임아웃 해소), effort medium·웹검색 3회로 속도 개선, 판정 기준 프롬프트 명문화.
- 2라운드: 조정지역 다주택 중과 시 장기보유특별공제 미배제 버그(양도세 1.2억 과소), 공동명의 재산세 지분별 누진 계산 오류 발견 → 수정 후 재검증 pass 확인.

## 앞으로 할 일 (로드맵)

1. 사례 추가 확충(조정지역·고가·상속 연계 등)으로 검증 커버리지 확대
2. 보고서 PDF/DOCX 변환 등 출력 형식 확장
3. 세법 개정 감시(`advisory-deep-dive`)를 정기 스케줄로 돌려 상수 갱신 알림 자동화
4. 웹 입력폼 → 보고서·심화검토 UI (프런트엔드)
