/**
 * 종부세 계산기 — 1세대 1주택 단독명의 (aggr-single.html)
 *
 * 고지서식 상세: 산출세액·공제할 재산세액·세액공제·세부담상한 항목을 누르면
 * 산식 팝업(현재 입력값 대입 포함)을 보여준다.
 */

import { calcPropertyTax } from '../../core/property-tax.js';
import { calcAggrTax } from '../../core/comprehensive-tax.js';
import {
  won, bindMoneyInputs, moneyVal, initFxDialog, bindFxButtons,
  AGGR_RATE_TABLE_HTML, aggrRateFormula,
} from './notice-ui.js';

const $ = (id) => document.getElementById(id);
const pct = (x) => `${(x * 100).toFixed(0)}%`;
const showFx = initFxDialog();
let fxMap = {};   // 계산할 때마다 현재 값으로 갱신되는 산식 팝업 내용

function calculate() {
  const gongsi = moneyVal($('inGongsi'));
  const period = Number($('inPeriod').value) || 0;
  const age    = Number($('inAge').value) || 0;
  const prev   = moneyVal($('inPrev'));

  const p = calcPropertyTax('1세대1주택', gongsi);
  const r = calcAggrTax('1세대1주택', '비조정지역', gongsi, period, age, p.propertyTax,
    prev > 0 ? { prevYearTotal: prev } : {});
  const b = r.breakdown;

  const noTax = b.aggrTaxBase <= 0;
  const rows = [];
  const row = (label, amount, opts = {}) => rows.push(`
    <tr class="${opts.minus ? 'minus' : ''} ${opts.total ? 'total' : ''}">
      <td class="rowlabel">${opts.fx ? `<button class="fx-btn" data-fx="${opts.fx}">${label}</button>` : label}
        ${opts.note ? `<div style="font-size:13px;color:#5f7180;font-weight:400">${opts.note}</div>` : ''}</td>
      <td class="num">${opts.minus && amount > 0 ? '△' : ''}${won(amount)}</td>
    </tr>`);

  row('공시가격', gongsi);
  row('기본공제 (1세대1주택 12억)', 1_200_000_000, { minus: true });
  row(`과세표준 = (공시가격 − 12억) × 공정시장가액비율 ${pct(b.fairMarketRate)}`, b.aggrTaxBase);
  if (!noTax) {
    row('산출세액', b.aggrTaxBeforeDc, { fx: 'chulse' });
    row('공제할 재산세액 (이중과세 조정)', b.propertyTaxDc, { fx: 'jaesan', minus: true });
    row(`세액공제 (장기보유 ${pct(b.prdDc)} + 연령 ${pct(b.ageDc)})`, b.creditAmt, { fx: 'gongje', minus: true });
    row('세부담상한 초과 차감', b.capReduction, {
      fx: 'sanghan', minus: true,
      note: prev > 0 ? `전년도 보유세 ${won(prev)} × 150% 한도` : '전년도 보유세 미입력 → 미적용',
    });
  }
  row('종합부동산세 (결정세액)', r.aggrTax);
  row('농어촌특별세 (종부세 × 20%)', r.ruralTax);
  row('합계 (농특세 포함, 연간)', r.total, { total: true });

  $('result').innerHTML = `
    <div class="result-headline">
      <div class="label">종합부동산세 + 농특세 (연간)</div>
      <div class="amount">${won(r.total)}</div>
      <div class="sub">${noTax
        ? '공시가격이 기본공제 12억 이하 → 종부세 없음'
        : `종부세 ${won(r.aggrTax)} + 농특세 ${won(r.ruralTax)} · 세액공제 ${pct(b.combinedDc)}`}</div>
    </div>
    <div class="notice-wrap"><table class="notice">
      <tr><th>구분 <span style="font-weight:400;font-size:13px;color:#5f7180">(밑줄 항목 클릭 = 산식 보기)</span></th><th class="num">금액</th></tr>
      ${rows.join('')}
    </table></div>
    <p style="font-size:13.5px;color:#566573;margin:8px 0 0">참고 — 재산세는 별도 고지:
      본세 ${won(p.propertyTax)} + 도시지역분 ${won(p.dosiTax)} + 지방교육세 ${won(p.pEduTax)}
      = <b>${won(p.total)}</b> (<a href="property-calc.html">재산세 계산기</a>)</p>
    <div class="lawref"><b>근거 법령</b><br>${r.lawRef.join('<br>')}</div>
    <div class="disclaimer">※ 참고용 계산이며, 실제 신고 전 세무 전문가 확인이 필요합니다. (기준: 2026.5.10 시행분)</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';

  // 산식 팝업 내용 (현재 계산값 대입)
  fxMap = {
    chulse: {
      title: '산출세액 — 누진세율 (종부세법 §9)',
      html: `
        <p><b>산식</b>: 과세표준 × 세율 − 누진공제 (속산표)</p>
        ${AGGR_RATE_TABLE_HTML}
        <div class="fx-now">이번 계산: 과세표준 ${won(b.aggrTaxBase)}
→ ${aggrRateFormula(b.aggrTaxBase)} = <b>${won(b.aggrTaxBeforeDc)}</b></div>`,
    },
    jaesan: {
      title: '공제할 재산세액 — 이중과세 조정 (종부세법 §9)',
      html: `
        <p>같은 주택에 재산세와 종부세가 겹치는 부분을 종부세에서 빼줍니다.</p>
        <div class="fx-formula">공제액 = 재산세액 × (종부세 과세표준에 부과된 재산세 상당액 ÷ 주택분 재산세 상당액)
= 재산세 × (종부세 과세표준 × 45% × 0.4%) ÷ (공시가격 × 45% × 0.4% − 63만)</div>
        <div class="fx-now">이번 계산: ${won(p.propertyTax)} × (${won(b.aggrTaxBase)} × 45% × 0.4%) ÷ (${won(gongsi)} × 45% × 0.4% − 630,000원)
= <b>${won(b.propertyTaxDc)}</b></div>
        <p style="font-size:13px;color:#5f7180">※ 45%는 재산세 공정시장가액비율(1세대1주택 6억 초과), 0.4%−63만은 재산세 표준세율 최고구간 산식입니다.</p>`,
    },
    gongje: {
      title: '세액공제 — 장기보유·연령 (종부세법 §9의2)',
      html: `
        <p>1세대 1주택 단독명의자만 적용. 두 공제는 <b>합산 80% 한도</b>입니다.</p>
        <table><tr><th>장기보유</th><th class="num">공제율</th><th>연령</th><th class="num">공제율</th></tr>
        <tr><td>5년 이상</td><td class="num">20%</td><td>만 60세 이상</td><td class="num">20%</td></tr>
        <tr><td>10년 이상</td><td class="num">40%</td><td>만 65세 이상</td><td class="num">30%</td></tr>
        <tr><td>15년 이상</td><td class="num">50%</td><td>만 70세 이상</td><td class="num">40%</td></tr></table>
        <div class="fx-formula">세액공제 = (산출세액 − 공제할 재산세액) × min(장기보유 + 연령, 80%)</div>
        <div class="fx-now">이번 계산: 보유 ${period}년 → ${pct(b.prdDc)}, 만 ${age}세 → ${pct(b.ageDc)}
(${won(b.aggrTaxBeforeDc)} − ${won(b.propertyTaxDc)}) × ${pct(b.combinedDc)} = <b>${won(b.creditAmt)}</b></div>`,
    },
    sanghan: {
      title: '세부담상한 — 전년 대비 150% (종부세법 §10)',
      html: `
        <p>당해연도 보유세(재산세 + 종부세)가 <b>직전연도 보유세 상당액의 150%</b>를 넘지 않도록,
        초과분을 종부세에서 차감합니다.</p>
        <div class="fx-formula">상한액 = 전년도 (재산세 + 종부세) 상당액 × 150%
차감액 = max(당해 재산세 + 종부세 − 상한액, 0)</div>
        ${prev > 0 ? `<div class="fx-now">이번 계산: 상한액 = ${won(prev)} × 150% = ${won(b.capLimit)}
당해 보유세 = 재산세 ${won(p.propertyTax)} + 종부세 ${won(b.capReduction + r.aggrTax)}
→ 차감액 <b>${won(b.capReduction)}</b></div>`
        : '<div class="fx-now">전년도 보유세 상당액을 입력하지 않아 이번 계산에는 적용하지 않았습니다.</div>'}`,
    },
  };
}

bindMoneyInputs(document);
bindFxButtons($('btResult'), () => fxMap, showFx);
$('calcBtn').addEventListener('click', calculate);
