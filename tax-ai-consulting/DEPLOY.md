# 배포 가이드 — Cloudflare Pages + Functions

## 아키텍처

```
┌─────────────────────────────────────────────┐
│         Cloudflare Pages (전역 CDN)         │
│                                             │
│  index.html, assets/, src/  ── 정적 SPA    │
│                                             │
│  /api/chat  ──────► functions/api/chat.js   │
│                       (Pages Function)      │
│                              │              │
└──────────────────────────────┼──────────────┘
                               │ x-api-key
                               ▼
                       Anthropic API
                       (Claude opus-4-7)
```

Pages가 SPA와 API 프록시를 같은 origin에서 제공 → CORS·도메인 화이트리스트 불필요.
`ANTHROPIC_API_KEY`는 Cloudflare 환경변수(Secret)로 보관, 클라이언트엔 노출되지 않음.

---

## 사전 준비

1. [Cloudflare 계정](https://dash.cloudflare.com/sign-up) (무료 플랜 OK)
2. Anthropic API 키 (https://console.anthropic.com/)
3. (선택) GitHub 리포지토리 — 자동 배포용

---

## 방법 A: GitHub 연동 자동 배포 (권장)

1. **Pages 프로젝트 생성**
   - Cloudflare 대시보드 → Workers & Pages → Create → Pages → Connect to Git
   - 본 저장소 선택, 브랜치 `main` (또는 원하는 브랜치)
   - Build settings:
     - **Build command**: 비워둠 (정적 SPA)
     - **Build output directory**: `tax-ai-consulting`
     - **Root directory**: `/` (저장소 루트)

2. **환경변수 등록**
   - 프로젝트 → Settings → Environment variables → Production
   - `ANTHROPIC_API_KEY` 추가, **Type: Secret** 체크
   - Preview 환경에도 동일하게 등록 (PR 미리보기용)
   - (선택) `MODEL_ID` — 일반 변수로 추가하면 기본 모델을 덮어씀
     - 기본값: `claude-opus-5-5`
     - 비용 절감: `claude-sonnet-5-5`

3. **배포**
   - main 브랜치에 push → 자동 빌드 & 배포
   - 도메인: `https://<project-name>.pages.dev`
   - 커스텀 도메인 연결: Settings → Custom domains

---

## 방법 B: wrangler CLI로 직접 배포

```bash
# 1) wrangler 설치
npm install -g wrangler

# 2) Cloudflare 로그인
wrangler login

# 3) 프로젝트 디렉터리로 이동
cd tax-ai-consulting

# 4) 비밀키 등록 (최초 1회)
wrangler pages secret put ANTHROPIC_API_KEY --project-name tuzaga-tax-ai
# (콘솔에 sk-ant-... 입력)

# 5) 배포
wrangler pages deploy . --project-name tuzaga-tax-ai
```

배포 후 출력되는 URL로 접속.

---

## 로컬 개발 (Functions 포함)

```bash
cd tax-ai-consulting
wrangler pages dev . --compatibility-date=2025-01-01

# 환경변수는 .dev.vars 파일에 (gitignore 필수!)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .dev.vars
```

브라우저에서 `http://localhost:8788` 접속 — 정적 SPA + `/api/chat` Functions가 함께 동작.

---

## 운영 점검 체크리스트

- [ ] 환경변수 `ANTHROPIC_API_KEY` 가 Secret 타입으로 등록됨
- [ ] `_headers` 의 CSP 가 정상 적용됨 (브라우저 DevTools → Network → Response Headers)
- [ ] `/api/chat` POST 요청이 200 + SSE 스트림 응답
- [ ] Anthropic 사용량/요금 알림 설정 (https://console.anthropic.com/settings/limits)
- [ ] (선택) Cloudflare 보안 → Bot Fight Mode, Rate Limiting Rules 설정
- [ ] (선택) Web Analytics 활성화

## 비용 예측

- Cloudflare Pages: 무료 (500 builds/month, 무제한 요청)
- Pages Functions: 100,000 호출/일 무료
- Anthropic Claude (기본 `claude-opus-5-5`)
  - 시스템 프롬프트(법령 DB ~6k tokens)가 매 요청 반복되므로 prompt caching 적용 시 큰 폭 절감 가능
  - 비용이 부담되면 환경변수 `MODEL_ID=claude-sonnet-5-5` 로 교체 (재배포 불필요)
  - 실제 단가는 https://claude.com/pricing 에서 확인

## 다음 단계

- 도메인 화이트리스트가 필요한 경우 `functions/api/chat.js` 상단에 Origin 검사 추가
- 사용자 인증·시나리오 클라우드 동기화 필요 시 Cloudflare D1 + Access 도입
- 법제처 OPEN API와 법령 DB 동기화 자동화
