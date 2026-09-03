/**
 * 세금 계산 공통 상수
 * 기준일: 2026.5.10 시행분
 */

// 증여 관계 코드
export const CHILD = 1;    // 직계비속(자녀)
export const SPOUSE = 2;   // 배우자
export const PARENTS = 3;  // 직계존속(부모)
export const EXT_REL = 4;  // 기타 친족 (자녀의 배우자 등 6촌 이내 혈족·4촌 이내 인척)
export const ETC = 5;      // 타인 (기타)

// 세대생략 여부
export const SKIP_T = 1;   // 세대생략 있음 (손자녀 등)
export const SKIP_F = 2;   // 세대생략 없음

// 양도세 중과 관련
export const LANDTRADE_DEADLINE_OLD_ADJ = "2026-09-09";  // 기존 조정지역 토허 양도 마감일
export const LANDTRADE_DEADLINE_NEW_ADJ = "2026-11-09";  // 신규 조정지역 토허 양도 마감일
export const HEAVY_RESUME_DATE = "2026-05-10";           // 다주택 중과 부활일

// 1세대1주택 비과세 고가주택 기준 (2022.1.1 이후 12억)
export const SINGLE_HH_NONTAX_THRESHOLD = 1_200_000_000;

// ── 2026 세제개편안 (2026.8.3 발표 정부안 — 국회 통과 전, 조문 확정 시 재검토) ──
export const REFORM2026 = {
  // 조정지역 다주택 중과 한시 완화: 양도연도별 가산폭 (2029년부터 +20%p/+30%p 복귀)
  HEAVY_SURCHARGE: {
    2027: { two: 0.05, threePlus: 0.10 },
    2028: { two: 0.10, threePlus: 0.15 },
  },
  HEAVY_SURCHARGE_DEFAULT: { two: 0.20, threePlus: 0.30 },  // 현행 = 2029 복귀

  // 장기보유특별공제 → 장기거주소득공제 전환 (2028.1.1 이후 양도분부터)
  //  2028: 1주택 보유 연2%(max20%) + 거주 연6%(max60%) / 2029~: 거주만 연8%(max80%)
  //  다주택: 2년 이상 거주 시 거주기간 연2%(max30%), 보유공제 폐지
  DEDUCT_CAP: { 2028: 2_000_000_000 },     // 공제금액 한도: 2028년 20억
  DEDUCT_CAP_FINAL: 1_000_000_000,         // 2029년 이후 10억

  // 1세대1주택 기본공제 확대 (10년 이상 거주 + 양도가액 30억 이하, 2029년 시행 가정)
  BASIC_DEDUCT_EXPANDED: 25_000_000,
  BASIC_DEDUCT_STAY_MIN: 10,
  BASIC_DEDUCT_PRICE_LIMIT: 3_000_000_000,
};

// 종부세 공제금액
export const AGGR_DEDUCT_SINGLE = 1_200_000_000;  // 1세대1주택
export const AGGR_DEDUCT_OTHERS = 900_000_000;    // 다주택·기타
export const AGGR_FAIR_MARKET_RATE = 0.6;         // 공정시장가액비율 60% (2026)

// ── 2026 세제개편안 — 종부세 (2026.9.1 국무회의 의결 확정안 · 9.3 국회 제출) ──
// 8.3 발표안 대비 확정안 수정사항:
//   ① 비거주 1주택 기본공제 9억 인하안 철회 → 현행 12억 유지
//   ② 공동명의 1주택 인별 공제: 거주 9억(합 18억) 유지 / 비거주 4억안 → 6억(합 12억)으로 조정
//   ③ 세부담상한 200% 인상안 철회 → 현행 150% 유지
export const AGGR_REFORM2026 = {
  // 기본공제 (2027년분부터): 1주택 실거주 14억 / 비거주 12억(확정안 — 현행 유지),
  // 다주택 4억 + 5억 × (거주주택 공시가격 ÷ 전체 공시가격 합계)
  DEDUCT_SINGLE_RESIDENT: 1_400_000_000,
  DEDUCT_SINGLE_NONRESIDENT: 1_200_000_000,
  DEDUCT_MULTI_BASE: 400_000_000,
  DEDUCT_MULTI_RESIDENT_BONUS: 500_000_000,

  // 공동명의 1주택 인별 기본공제 (2027년분부터): 거주 9억 / 비거주 6억 (확정안)
  DEDUCT_COUPLE_RESIDENT: 900_000_000,
  DEDUCT_COUPLE_NONRESIDENT: 600_000_000,

  // 공정시장가액비율: 2027년 70% 일괄, 2028년~ 1주택 70% / 3주택 이상·조정지역 2주택 이상 80%
  FAIR_MARKET_RATE_2027: 0.7,
  FAIR_MARKET_RATE_BASE: 0.7,
  FAIR_MARKET_RATE_HEAVY: 0.8,

  // 1세대1주택 세액공제(보유·연령) 한도 신설: 2027년 800만 → 2028년~ 600만
  CREDIT_CAP: { 2027: 8_000_000 },
  CREDIT_CAP_FINAL: 6_000_000,
};

// 증여세 공제한도
export const GIVE_DEDUCT = {
  CHILD_ADULT: 50_000_000,    // 성년 자녀
  CHILD_MINOR: 20_000_000,    // 미성년 자녀
  SPOUSE: 600_000_000,        // 배우자
  PARENTS: 50_000_000,        // 직계존속
  EXT_REL: 10_000_000,        // 기타친족
  ETC: 0,                     // 타인
};

// 성년 기준 나이
export const ADULT_AGE = 19;

// 세대독립 판정 나이 (30세 이상이면 별도세대로 간주하는 시나리오 전제)
export const INDEPENDENT_HH_AGE = 30;
