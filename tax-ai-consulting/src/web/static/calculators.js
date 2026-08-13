/**
 * 세금 계산기 (메인 페이지) — 세목별 단독 계산기
 *
 * 증여세·양도소득세·재산세·종합부동산세를 각각 독립 계산한다.
 * 계산 엔진(src/core)을 브라우저에서 직접 실행하며, 계산 내역은
 * 결정적 포매터(renderCalcSteps)로 단계별 표시한다. 서버·AI 불필요.
 */

import { calcGiveTax }       from '../../core/gift-tax.js';
import { calcSaleIncomeTax, compareSaleIncomeTaxReform2026 } from '../../core/transfer-tax.js';
import { calcPropertyTax }   from '../../core/property-tax.js';
import { calcAggrTax, calcAggrTaxCouple, compareAggrTaxReform2026 } from '../../core/comprehensive-tax.js';
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
    id: 'transfer-reform', name: '양도세 개정안 비교',
    intro: '2026 세제개편안(2026.8.3 정부안) 반영 전·후 양도소득세를 비교합니다. '
      + '다주택 중과 한시 완화(2027~28년 +5~15%p), 장기거주소득공제 전환·공제한도(2028년~), '
      + '1세대1주택 기본공제 확대를 반영합니다. ※ 국회 통과 전 정부안 기준',
    fields: [
      sel('reformYear', '양도(예정)연도', [
        { value: 2027, label: '2027년 (중과 완화 +5/+10%p)' },
        { value: 2028, label: '2028년 (중과 +10/+15%p · 공제 중간단계 · 한도 20억)' },
        { value: 2029, label: '2029년 이후 (중과 복귀 · 거주공제 연8% · 한도 10억)' },
      ], 2027),
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
      const cmp = compareSaleIncomeTaxReform2026(
        v.reformYear,
        v.marketPrice, v.basePrice, v.holdPeriod, v.stayPeriod,
        v.isWvr, '주택', v.ownCount, v.isAdj,
      );
      const d = cmp.diff.total;
      const change = d === 0 ? '변동 없음'
        : `${won(Math.abs(d))} ${d > 0 ? '증가 ▲' : '감소 ▼'}`;
      return {
        headline: cmp.reform.total,
        headlineLabel: `개편안 적용 세액 (${v.reformYear}년 양도 기준)`,
        sub: `반영 전(현행) ${won(cmp.current.total)} → 반영 후 ${won(cmp.reform.total)} · ${change}`,
        computations: [
          { kind: 'transfer', label: '반영 전 — 현행법 (2026.5.10 시행분)', result: cmp.current },
          { kind: 'transfer', label: `반영 후 — 2026 세제개편안 (${v.reformYear}년 양도분)`, result: cmp.reform },
        ],
        lawRef: cmp.reform.lawRef,
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
    intro: '공시가격 합계에서 공제(1세대1주택 12억 / 그 외 9억)를 빼고, 장기보유·연령 세액공제(1세대1주택)를 반영합니다. '
      + '공동명의 1주택은 인별 과세 원칙대로 부부 각자 지분에 각자 9억씩 공제해 계산한 뒤 합산합니다.',
    fields: [
      sel('oneOOne', '주택 유형', [
        { value: '1세대1주택', label: '1세대1주택' },
        { value: '공동명의1주택', label: '공동명의 1주택 (부부 인별 계산)' },
        { value: '다주택', label: '다주택·기타' },
      ], '1세대1주택'),
      money('gongsi', '공시가격 합계', 1_500_000_000),
      int('shareA', '공동명의: 본인 지분율(%) — 배우자는 나머지', 50),
      int('period', '보유기간(년)', 10),
      int('age', '소유자 나이(만)', 60),
    ],
    run: (v) => {
      // 종부세는 재산세 중복분 공제를 위해 재산세액이 필요 — 내부에서 먼저 계산
      const propertyTax = calcPropertyTax(v.oneOOne, v.gongsi).propertyTax;
      if (v.oneOOne === '공동명의1주택') {
        const shareA = Math.min(Math.max(v.shareA || 50, 0), 100) / 100;
        const c = calcAggrTaxCouple(v.gongsi, shareA, '비조정지역', propertyTax);
        const pctA = Math.round(shareA * 100), pctB = 100 - pctA;
        return {
          headline: c.total, headlineLabel: '부부합계 (종부세 + 농특세, 연간)',
          sub: c.total === 0
            ? '각자 지분 공시가격이 인별 공제 9억 이하 → 부부 모두 종부세 없음'
            : `본인(${pctA}%) ${won(c.a.total)} + 배우자(${pctB}%) ${won(c.b.total)} — 인별 각자 계산 합산`,
          extraHtml: '<p style="font-size:12.5px;color:#566573;margin:6px 0 0">종부세는 인별 과세 — 각자 지분에 '
            + '각자 기본공제 9억(부부 합계 18억)을 적용해 계산했습니다. 특례(1세대1주택 방식) 비교는 '
            + '<a href="aggr-couple.html">부부 공동명의 전용 계산기</a>에서 확인하세요.</p>',
          computations: [
            { kind: 'aggr', label: `본인 지분 ${pctA}%`, result: c.a },
            { kind: 'aggr', label: `배우자 지분 ${pctB}%`, result: c.b },
          ],
          lawRef: c.lawRef,
        };
      }
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
  {
    id: 'aggr-reform', name: '종부세 개편안 비교',
    intro: '2026 세제개편안(2026.8.3 정부안)에 따른 종합부동산세 변화를 현행(2026) → 2027년(과도기) → '
      + '2028년~(단일세율) 순으로 비교합니다. 기본공제(실거주 14억/비거주 9억/다주택 가액비례), '
      + '공정시장가액비율(70~80%), 세율 일원화, 세액공제 한도(800만/600만)를 반영합니다. '
      + '※ 국회 통과 전 정부안 기준',
    fields: [
      sel('oneOOne', '주택 유형', [
        { value: '1세대1주택', label: '1세대1주택' },
        { value: '공동명의1주택', label: '공동명의 1주택 (부부 인별 계산)' },
        { value: '다주택', label: '다주택·기타' },
      ], '1세대1주택'),
      sel('isResident', '실거주 여부 (1주택)', [
        { value: 1, label: '실거주' },
        { value: 0, label: '비거주(전세·공실 등)' },
      ], 1),
      int('shareA', '공동명의: 본인 지분율(%) — 배우자는 나머지', 50),
      int('residentSharePct', '다주택: 거주주택 가액 비중(%)', 50),
      int('ownCount', '보유 주택수', 1),
      sel('heavy', '조정대상지역 (2028~ 비율 판정)', [
        { value: '비조정지역', label: '비조정지역' },
        { value: '조정지역', label: '조정지역' },
      ], '비조정지역'),
      money('gongsi', '공시가격 합계', 1_500_000_000),
      int('period', '보유기간(년)', 10),
      int('age', '소유자 나이(만)', 60),
    ],
    run: (v) => {
      const propertyTax = calcPropertyTax(v.oneOOne, v.gongsi).propertyTax;
      const reformOpts = {
        isResident: v.isResident,
        residentShare: (v.residentSharePct || 0) / 100,
        ownCount: v.ownCount,
      };
      const dRow = (d) => d === 0 ? '변동 없음'
        : `${won(Math.abs(d))} ${d > 0 ? '증가 ▲' : '감소 ▼'}`;
      const cmpTable = (rows) => `
        <table class="cmp-table" style="width:100%;border-collapse:collapse;margin:12px 0">
          <thead><tr>
            <th style="text-align:left;border-bottom:1px solid #ccc;padding:6px">귀속연도</th>
            <th style="text-align:right;border-bottom:1px solid #ccc;padding:6px">기본공제</th>
            <th style="text-align:right;border-bottom:1px solid #ccc;padding:6px">공정시장가액비율</th>
            <th style="text-align:right;border-bottom:1px solid #ccc;padding:6px">종부세+농특세</th>
            <th style="text-align:right;border-bottom:1px solid #ccc;padding:6px">현행 대비</th>
          </tr></thead>
          <tbody>${rows.map(([label, deduct, fmr, total, d]) => `
            <tr>
              <td style="padding:6px">${label}</td>
              <td style="text-align:right;padding:6px">${deduct}</td>
              <td style="text-align:right;padding:6px">${(fmr * 100).toFixed(0)}%</td>
              <td style="text-align:right;padding:6px"><b>${won(total)}</b></td>
              <td style="text-align:right;padding:6px">${d}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;

      if (v.oneOOne === '공동명의1주택') {
        // 인별 과세: 각 레짐을 부부 각자 지분으로 계산해 합산 비교
        const shareA = Math.min(Math.max(v.shareA || 50, 0), 100) / 100;
        const couple = (reformYear) => calcAggrTaxCouple(v.gongsi, shareA, v.heavy, propertyTax,
          reformYear ? { ...reformOpts, reformYear } : {});
        const cur = couple(0), y27 = couple(2027), y28 = couple(2028);
        const pctA = Math.round(shareA * 100), pctB = 100 - pctA;
        const rows = [
          ['현행 (2026년분)', `인별 ${won(cur.a.breakdown.deductAmt)}`, cur.a.breakdown.fairMarketRate, cur.total, '—'],
          ['개편안 2027년분 (과도기)', `인별 ${won(y27.a.breakdown.deductAmt)}`, y27.a.breakdown.fairMarketRate, y27.total, dRow(y27.total - cur.total)],
          ['개편안 2028년분~ (단일세율)', `인별 ${won(y28.a.breakdown.deductAmt)}`, y28.a.breakdown.fairMarketRate, y28.total, dRow(y28.total - cur.total)],
        ];
        return {
          headline: y28.total,
          headlineLabel: '부부합계 — 개편안 적용 세액 (2028년분~ 기준, 연간)',
          sub: `현행 ${won(cur.total)} → 2027년 ${won(y27.total)} → 2028년~ ${won(y28.total)} (부부 각자 계산 합산)`,
          extraHtml: cmpTable(rows)
            + '<p style="font-size:12.5px;color:#566573;margin:6px 0 0">종부세는 인별 과세 — 모든 연도를 부부 각자 지분'
            + `(본인 ${pctA}% / 배우자 ${pctB}%)으로 계산해 합산했습니다. 개편안의 공동명의 인별 공제 변경은 미공표라 인별 9억을 유지합니다.</p>`,
          computations: [
            { kind: 'aggr', label: `현행 — 본인 ${pctA}%`, result: cur.a },
            { kind: 'aggr', label: `현행 — 배우자 ${pctB}%`, result: cur.b },
            { kind: 'aggr', label: `2027년분 — 본인 ${pctA}%`, result: y27.a },
            { kind: 'aggr', label: `2027년분 — 배우자 ${pctB}%`, result: y27.b },
            { kind: 'aggr', label: `2028년분~ — 본인 ${pctA}%`, result: y28.a },
            { kind: 'aggr', label: `2028년분~ — 배우자 ${pctB}%`, result: y28.b },
          ],
          lawRef: y28.lawRef,
        };
      }

      const cmp = compareAggrTaxReform2026(
        v.oneOOne, v.heavy, v.gongsi, v.period, v.age, propertyTax, reformOpts,
      );
      const rows = [
        ['현행 (2026년분)', won(cmp.current.breakdown.deductAmt), cmp.current.breakdown.fairMarketRate, cmp.current.total, '—'],
        ['개편안 2027년분 (과도기)', won(cmp.y2027.breakdown.deductAmt), cmp.y2027.breakdown.fairMarketRate, cmp.y2027.total, dRow(cmp.diff.y2027)],
        ['개편안 2028년분~ (단일세율)', won(cmp.y2028.breakdown.deductAmt), cmp.y2028.breakdown.fairMarketRate, cmp.y2028.total, dRow(cmp.diff.y2028)],
      ];
      return {
        headline: cmp.y2028.total,
        headlineLabel: '개편안 적용 세액 (2028년분~ 기준, 연간)',
        sub: `현행 ${won(cmp.current.total)} → 2027년 ${won(cmp.y2027.total)} → 2028년~ ${won(cmp.y2028.total)}`,
        extraHtml: cmpTable(rows),
        computations: [
          { kind: 'aggr', label: '현행 (2026년분)', result: cmp.current },
          { kind: 'aggr', label: '개편안 2027년분 (과도기)', result: cmp.y2027 },
          { kind: 'aggr', label: '개편안 2028년분~ (단일세율)', result: cmp.y2028 },
        ],
        lawRef: cmp.y2028.lawRef,
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
  const comps = out.computations ?? [out.computation];
  const stepsMd = renderCalcSteps(
    comps.map((c, i) => ({ caseNo: i, ...c })),
    { heading: '### 계산 내역' },
  );
  const lawRef = out.lawRef ?? out.computation?.result.lawRef ?? [];

  $('result').innerHTML = `
    <div class="result-headline">
      <div class="label">${out.headlineLabel}</div>
      <div class="amount">${won(out.headline)}</div>
      <div class="sub">${out.sub}</div>
    </div>
    ${out.extraHtml ?? ''}
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
