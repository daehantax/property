/**
 * 세금 계산기 (메인 페이지) — 세목별 단독 계산기
 *
 * 증여세·양도소득세·재산세·종합부동산세를 각각 독립 계산한다.
 * 계산 엔진(src/core)을 브라우저에서 직접 실행하며, 계산 내역은
 * 결정적 포매터(renderCalcSteps)로 단계별 표시한다. 서버·AI 불필요.
 */

import { calcGiveTax }       from '../../core/gift-tax.js';
import { calcSaleIncomeTax } from '../../core/transfer-tax.js';
import { calcPropertyTax }   from '../../core/property-tax.js';
import { calcAggrTax }       from '../../core/comprehensive-tax.js';
import { renderCalcSteps }   from '../../report/calc-steps.js';
import { marked }            from 'marked';

const $ = (id) => document.getElementById(id);
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const fmt = (n) => Number(n).toLocaleString('ko-KR');

const KOREAN_UNIT = (n) => {
  n = Number(n);
  if (!isFinite(n) || n === 0) return '';
  const eok = Math.floor(n / 100000000);
  const man = Math.round((n % 100000000) / 10000);
  let s = '';
  if (eok) s += eok.toLocaleString('ko-KR') + '억';
  if (man) s += (s ? ' ' : '') + man.toLocaleString('ko-KR') + '만';
  return s ? s + '원' : n.toLocaleString('ko-KR') + '원';
};

const money = (name, label, def) => ({ name, label, type: 'money', default: def });
const int = (name, label, def) => ({ name, label, type: 'int', default: def });
const sel = (name, label, options, def) => ({ name, label, type: 'select', options, default: def });

/**
 * 계산기 정의. 각 항목:
 *   fields: 입력 스펙
 *   run(v): { headline, sub, computation:{kind,label,result} }
 * 새 계산기를 추가하려면 이 배열에 항목 하나만 넣으면 된다.
 */
const CALCULATORS = [
  {
    id: 'gift', name: '증여세',
    intro: '수증자 관계별 증여재산공제와 누진세율, 세대생략 할증, 신고세액공제(3%)를 반영합니다.',
    fields: [
      sel('rel', '수증자 관계', [
        { value: 1, label: '자녀(직계비속)' },
        { value: 2, label: '배우자' },
        { value: 3, label: '부모(직계존속)' },
        { value: 4, label: '기타 친족' },
        { value: 5, label: '타인' },
      ], 1),
      sel('skip', '세대생략 여부', [
        { value: 2, label: '일반 증여' },
        { value: 1, label: '세대생략 증여(손자녀 등)' },
      ], 2),
      money('giftPrice', '증여재산가액(시가)', 500_000_000),
      int('age', '수증자 나이(만)', 30),
    ],
    run: (v) => {
      const r = calcGiveTax(v.rel, v.skip, v.giftPrice, v.age);
      return {
        headline: r.tax, headlineLabel: '납부할 증여세',
        sub: `과세표준 ${won(r.breakdown.taxBase)} · 세율 ${(r.breakdown.taxRate * 100).toFixed(0)}%`,
        computation: { kind: 'gift', label: '증여세', result: r },
      };
    },
  },
  {
    id: 'transfer', name: '양도소득세',
    intro: '1세대1주택 비과세(12억)·장기보유특별공제·조정지역 다주택 중과(2026.5.10 부활)를 반영합니다.',
    fields: [
      money('marketPrice', '양도가액(시가)', 1_500_000_000),
      money('basePrice', '취득가액', 800_000_000),
      int('holdPeriod', '보유기간(년)', 10),
      int('stayPeriod', '거주기간(년)', 0),
      sel('isWvr', '주택 구분(비과세 판정)', [
        { value: '다주택', label: '다주택(비과세 아님)' },
        { value: '1세대1주택', label: '1세대1주택(12억 비과세)' },
        { value: '기타', label: '기타' },
      ], '다주택'),
      int('ownCount', '보유 주택수', 2),
      sel('isAdj', '조정대상지역', [{ value: 1, label: '조정지역' }, { value: 0, label: '비조정지역' }], 1),
    ],
    run: (v) => {
      const r = calcSaleIncomeTax(
        v.marketPrice, v.basePrice, v.holdPeriod, v.stayPeriod,
        v.isWvr, '주택', v.ownCount, v.isAdj,
      );
      return {
        headline: r.total, headlineLabel: '양도세 + 지방소득세 합계',
        sub: `양도소득세 ${won(r.transferTax)} + 지방소득세 ${won(r.localTax)}`
          + (r.breakdown.heavyApplied ? ' · 중과 적용' : ''),
        computation: { kind: 'transfer', label: '양도소득세', result: r },
      };
    },
  },
  {
    id: 'property', name: '재산세',
    intro: '공시가격 × 공정시장가액비율(1세대1주택 43~45% / 그 외 60%)로 과세표준을 잡고 누진세율을 적용합니다.',
    fields: [
      sel('oneOOne', '주택 유형', [
        { value: '1세대1주택', label: '1세대1주택' },
        { value: '다주택', label: '다주택·기타' },
      ], '1세대1주택'),
      money('gongsi', '공시가격', 1_000_000_000),
    ],
    run: (v) => {
      const r = calcPropertyTax(v.oneOOne, v.gongsi);
      return {
        headline: r.total, headlineLabel: '재산세 합계(연간)',
        sub: `본세 ${won(r.propertyTax)} + 도시지역분 ${won(r.dosiTax)} + 지방교육세 ${won(r.pEduTax)}`,
        computation: { kind: 'property', label: '재산세', result: r },
      };
    },
  },
  {
    id: 'aggr', name: '종합부동산세',
    intro: '공시가격 합계에서 공제(1세대1주택 12억 / 그 외 9억)를 빼고, 장기보유·연령 세액공제(1세대1주택)를 반영합니다.',
    fields: [
      sel('oneOOne', '주택 유형', [
        { value: '1세대1주택', label: '1세대1주택' },
        { value: '공동명의1주택', label: '공동명의 1주택' },
        { value: '다주택', label: '다주택·기타' },
      ], '1세대1주택'),
      money('gongsi', '공시가격 합계', 1_500_000_000),
      int('period', '보유기간(년)', 10),
      int('age', '소유자 나이(만)', 60),
    ],
    run: (v) => {
      // 종부세는 재산세 중복분 공제를 위해 재산세액이 필요 — 내부에서 먼저 계산
      const propertyTax = calcPropertyTax(v.oneOOne, v.gongsi).propertyTax;
      const r = calcAggrTax(v.oneOOne, '비조정지역', v.gongsi, v.period, v.age, propertyTax);
      const dc = r.breakdown.combinedDc > 0 ? ` · 세액공제 ${(r.breakdown.combinedDc * 100).toFixed(0)}%` : '';
      return {
        headline: r.total, headlineLabel: '종합부동산세 + 농특세(연간)',
        sub: r.breakdown.aggrTaxBase <= 0
          ? '공시가격이 공제금액 이하 → 종부세 없음'
          : `종부세 ${won(r.aggrTax)} + 농특세 ${won(r.ruralTax)}${dc}`,
        computation: { kind: 'aggr', label: '종합부동산세', result: r },
      };
    },
  },
];

let activeId = CALCULATORS[0].id;

function fieldHtml(f) {
  if (f.type === 'select') {
    const opts = f.options.map((o) =>
      `<option value="${o.value}" ${o.value === f.default ? 'selected' : ''}>${o.label}</option>`).join('');
    return `<label>${f.label}</label><select data-name="${f.name}" data-type="select">${opts}</select>`;
  }
  const isMoney = f.type === 'money';
  return `<label>${f.label}</label>
    <input data-name="${f.name}" data-type="${f.type}" ${isMoney ? 'data-kind="money"' : ''}
           value="${isMoney ? fmt(f.default) : f.default}" inputmode="numeric">
    ${isMoney ? '<div class="money-hint"></div>' : ''}`;
}

function renderForm() {
  const calc = CALCULATORS.find((c) => c.id === activeId);
  $('fields').innerHTML =
    `<p class="page-intro" style="margin-top:0">${calc.intro}</p>` + calc.fields.map(fieldHtml).join('');
  document.querySelectorAll('#fields [data-kind="money"]').forEach((inp) => {
    const hint = inp.nextElementSibling?.classList?.contains('money-hint') ? inp.nextElementSibling : null;
    const update = () => {
      const raw = inp.value.replace(/[^\d]/g, '');
      inp.value = raw ? fmt(raw) : '';
      if (hint) hint.textContent = raw ? KOREAN_UNIT(raw) : '';
    };
    inp.addEventListener('input', update);
    update();
  });
  // 탭 활성 표시
  document.querySelectorAll('#calcTabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === activeId);
  });
  // 이전 결과 감추기
  $('result').style.display = 'none';
  $('empty').style.display = 'block';
}

function collect() {
  const v = {};
  document.querySelectorAll('#fields [data-name]').forEach((el) => {
    const t = el.dataset.type;
    if (t === 'select') {
      const raw = el.value;
      v[el.dataset.name] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
    } else {
      v[el.dataset.name] = Number(String(el.value).replace(/[^\d.-]/g, '')) || 0;
    }
  });
  return v;
}

function calculate() {
  const calc = CALCULATORS.find((c) => c.id === activeId);
  const out = calc.run(collect());
  const stepsMd = renderCalcSteps([{ caseNo: 0, ...out.computation }], { heading: '### 계산 내역' });
  const lawRef = out.computation.result.lawRef ?? [];

  $('result').innerHTML = `
    <div class="result-headline">
      <div class="label">${out.headlineLabel}</div>
      <div class="amount">${won(out.headline)}</div>
      <div class="sub">${out.sub}</div>
    </div>
    <div class="steps">${marked.parse(stepsMd, { async: false })}</div>
    ${lawRef.length ? `<div class="lawref"><b>근거 법령</b><br>${lawRef.join('<br>')}</div>` : ''}
    <div class="disclaimer">※ 참고용 계산이며, 실제 신고 전 세무 전문가 확인이 필요합니다. (기준: 2026.5.10 시행분)</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';
}

// 탭 구성
$('calcTabs').innerHTML = CALCULATORS
  .map((c) => `<button data-id="${c.id}">${c.name}</button>`).join('');
$('calcTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  activeId = btn.dataset.id;
  renderForm();
});
$('calcBtn').addEventListener('click', calculate);

renderForm();
