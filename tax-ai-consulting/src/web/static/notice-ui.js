/**
 * 보유세 전용 페이지 공용 UI (aggr-single / aggr-couple / property-calc)
 *
 * - 금액 입력 포맷팅(콤마·한글 단위 힌트)
 * - 산식 팝업(<dialog>): 고지서식 상세의 항목을 누르면 계산 산식을 보여준다
 */

export const fmt = (n) => Number(n).toLocaleString('ko-KR');
export const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

export const KOREAN_UNIT = (n) => {
  n = Number(n);
  if (!isFinite(n) || n === 0) return '';
  const eok = Math.floor(n / 100000000);
  const man = Math.round((n % 100000000) / 10000);
  let s = '';
  if (eok) s += eok.toLocaleString('ko-KR') + '억';
  if (man) s += (s ? ' ' : '') + man.toLocaleString('ko-KR') + '만';
  return s ? s + '원' : n.toLocaleString('ko-KR') + '원';
};

/** scope 안의 [data-kind="money"] 입력에 콤마 포맷·한글 힌트 바인딩 */
export function bindMoneyInputs(scope = document) {
  scope.querySelectorAll('[data-kind="money"]').forEach((inp) => {
    const hint = inp.nextElementSibling?.classList?.contains('money-hint') ? inp.nextElementSibling : null;
    const update = () => {
      const raw = inp.value.replace(/[^\d]/g, '');
      inp.value = raw ? fmt(raw) : '';
      if (hint) hint.textContent = raw ? KOREAN_UNIT(raw) : '';
    };
    inp.addEventListener('input', update);
    update();
  });
}

/** 금액 입력값 → 숫자 */
export const moneyVal = (el) => Number(String(el.value).replace(/[^\d.-]/g, '')) || 0;

/**
 * 산식 팝업 초기화. body에 <dialog>를 붙이고 표시 함수를 돌려준다.
 * 사용: const showFx = initFxDialog(); showFx('산출세액', '<p>...</p>');
 */
export function initFxDialog() {
  const dlg = document.createElement('dialog');
  dlg.className = 'fx-dialog';
  dlg.innerHTML = `
    <div class="fx-head"><h4 id="fxTitle"></h4>
      <button class="fx-close" aria-label="닫기">×</button></div>
    <div class="fx-body" id="fxBody"></div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('.fx-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  return (title, bodyHtml) => {
    dlg.querySelector('#fxTitle').textContent = title;
    dlg.querySelector('#fxBody').innerHTML = bodyHtml;
    dlg.showModal();
  };
}

/**
 * 고지서식 상세 테이블의 산식 버튼 클릭 위임 바인딩.
 * container 안에서 [data-fx] 버튼이 눌리면 해당 key의 { title, html } 을 팝업으로 띄운다.
 * getMap: 산식 맵 객체 또는 () => 맵 — 계산할 때마다 맵이 바뀌므로 함수로 넘기는 걸 권장.
 */
export function bindFxButtons(container, getMap, showFx) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fx]');
    if (!btn) return;
    const map = typeof getMap === 'function' ? getMap() : getMap;
    const entry = map?.[btn.dataset.fx];
    if (!entry) return;
    const { title, html } = typeof entry === 'function' ? entry() : entry;
    showFx(title, html);
  });
}

/** 종부세 현행 세율표 (속산표) — 산식 팝업용 */
export const AGGR_RATE_TABLE_HTML = `
  <table>
    <tr><th class="num">과세표준</th><th class="num">세율</th><th class="num">누진공제</th></tr>
    <tr><td class="num">3억 이하</td><td class="num">0.5%</td><td class="num">—</td></tr>
    <tr><td class="num">6억 이하</td><td class="num">0.7%</td><td class="num">60만</td></tr>
    <tr><td class="num">12억 이하</td><td class="num">1.0%</td><td class="num">240만</td></tr>
    <tr><td class="num">25억 이하</td><td class="num">1.3%</td><td class="num">600만</td></tr>
    <tr><td class="num">50억 이하</td><td class="num">1.5%</td><td class="num">1,100만</td></tr>
    <tr><td class="num">94억 이하</td><td class="num">2.0%</td><td class="num">3,600만</td></tr>
    <tr><td class="num">94억 초과</td><td class="num">2.7%</td><td class="num">1억 180만</td></tr>
  </table>`;

/** 종부세 산출세액을 세율표 구간 산식 문자열로 (예: "3.6억 × 0.7% − 60만") */
export function aggrRateFormula(base) {
  const r = (n) => won(n);
  if      (base <= 300_000_000)   return `${r(base)} × 0.5%`;
  else if (base <= 600_000_000)   return `${r(base)} × 0.7% − 600,000원`;
  else if (base <= 1_200_000_000) return `${r(base)} × 1.0% − 2,400,000원`;
  else if (base <= 2_500_000_000) return `${r(base)} × 1.3% − 6,000,000원`;
  else if (base <= 5_000_000_000) return `${r(base)} × 1.5% − 11,000,000원`;
  else if (base <= 9_400_000_000) return `${r(base)} × 2.0% − 36,000,000원`;
  else                            return `${r(base)} × 2.7% − 101,800,000원`;
}
